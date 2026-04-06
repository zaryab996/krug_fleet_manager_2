/**
 * db/sync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Robuste bidirektionale Sync-Engine zwischen Zustand-Stores und Firebase.
 *
 * Wie es funktioniert:
 *  1. loadAllStores()      → Beim App-Start: alle Stores aus Firebase laden
 *  2. startStoreSync()     → Jede Store-Änderung → debounced nach Firebase schreiben
 *  3. startLiveUpdates()   → Firebase → alle anderen Browser live aktualisieren
 *
 * Sicherheitsmechanismen:
 *  • Debounce 800ms: verhindert zu viele Schreiboperationen
 *  • Write-Lock: verhindert Schreiben während des Ladens
 *  • Retry: bei Netzwerkfehler bis zu 3 Versuche
 *  • Deduplizierung: verhindert Echo-Updates (eigene Änderungen zurückzuschreiben)
 */

import { dbRead, dbWrite, dbListen, isConfigured } from './client';
import {
  useFleetStore, useDocsStore, useColorLegendStore,
  useColumnConfigStore, useDocPermStore, useVehicleHistoryStore,
  useVehicleNotesStore, useVehicleAccessStore, useUserGroupStore,
  useCustomColumnsStore, useRolesStore, useVehicleMailStore,
  useUsersStore,
} from '@/hooks/useStore';

// ─── Store-Registrierung ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZustandStore = any;

interface StoreReg {
  key:      string;
  store:    ZustandStore;
}

const STORES: StoreReg[] = [
  { key: 'fleet-data',            store: useFleetStore          },
  { key: 'fleet-docs',            store: useDocsStore           },
  { key: 'fleet-color-legend',    store: useColorLegendStore    },
  { key: 'fleet-column-config',   store: useColumnConfigStore   },
  { key: 'fleet-doc-perms',       store: useDocPermStore        },
  { key: 'fleet-vehicle-history', store: useVehicleHistoryStore },
  { key: 'fleet-vehicle-notes',   store: useVehicleNotesStore   },
  { key: 'fleet-vehicle-access',  store: useVehicleAccessStore  },
  { key: 'fleet-user-groups',     store: useUserGroupStore      },
  { key: 'fleet-custom-columns',  store: useCustomColumnsStore  },
  { key: 'fleet-roles',           store: useRolesStore          },
  { key: 'fleet-vehicle-mails',   store: useVehicleMailStore    },
  { key: 'fleet-users',           store: useUsersStore          },
];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Extrahiert nur die Daten-Properties eines Stores (keine Funktionen) */
function getStoreData(store: ZustandStore): Record<string, unknown> {
  const state = store.getState();
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(state)) {
    if (typeof state[key] !== 'function') {
      result[key] = state[key];
    }
  }
  return result;
}

/** Wendet Daten auf einen Store an */
function applyToStore(store: ZustandStore, data: Record<string, unknown>): void {
  // Nur bekannte (nicht-Funktion) Keys übernehmen
  const current = store.getState();
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (typeof current[key] !== 'function' && key in data) {
      patch[key] = data[key];
    }
  }
  if (Object.keys(patch).length > 0) {
    store.setState(patch, false);  // merge=true → Funktionen bleiben erhalten
  }
}

// ─── Laden ────────────────────────────────────────────────────────────────────

/** Lädt ALLE Stores aus Firebase und überschreibt lokale Daten */
export async function loadAllStores(): Promise<void> {
  if (!isConfigured()) {
    console.log('[Sync] Kein Backend → localStorage-Modus');
    return;
  }

  console.log('[Sync] Lade alle Daten aus Firebase…');
  let loaded = 0;

  const results = await Promise.allSettled(
    STORES.map(async ({ key, store }) => {
      const raw = await dbRead<string>(`stores/${key}`);
      if (!raw) return;
      try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const storeData = data?.state ?? data;
        if (storeData && typeof storeData === 'object') {
          applyToStore(store, storeData as Record<string, unknown>);
          loaded++;
          console.log(`[Sync] ✓ ${key}`);
        }
      } catch (err) {
        console.warn(`[Sync] Parse-Fehler ${key}:`, err);
      }
    })
  );

  const errors = results.filter(r => r.status === 'rejected').length;
  console.log(`[Sync] Geladen: ${loaded}/${STORES.length} Stores${errors > 0 ? `, ${errors} Fehler` : ''}`);
}

// ─── Schreiben (Stores → Firebase) ───────────────────────────────────────────

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 800;
const MAX_RETRIES = 3;
let writeLock = false;  // true während loadAllStores()

async function writeWithRetry(key: string, data: Record<string, unknown>, attempt = 1): Promise<void> {
  try {
    await dbWrite(`stores/${key}`, JSON.stringify({ state: data, ts: Date.now() }));
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 500));
      return writeWithRetry(key, data, attempt + 1);
    }
    console.warn(`[Sync] Write ${key} fehlgeschlagen nach ${MAX_RETRIES} Versuchen:`, err);
  }
}

/** Startet die Sync-Subscriptions: jede Store-Änderung → Firebase */
export function startStoreSync(): () => void {
  if (!isConfigured()) return () => {};

  // Write-Lock freigeben nach 4s (sicher nach loadAllStores)
  setTimeout(() => { writeLock = false; }, 4000);
  writeLock = true;

  const unsubFns = STORES.map(({ key, store }) =>
    store.subscribe(() => {
      if (writeLock) return;
      clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(() => {
        const data = getStoreData(store);
        writeWithRetry(key, data).catch(() => {});
      }, DEBOUNCE_MS);
    })
  );

  console.log('[Sync] ✅ Store-Sync aktiv');
  return () => unsubFns.forEach(fn => fn());
}

// ─── Live-Updates (Firebase → Browser) ───────────────────────────────────────

// Timestamp der letzten eigenen Schreiboperation pro Key
const lastOwnWrite: Record<string, number> = {};

/** Startet Echtzeit-Updates: Änderungen anderer Browser sofort anwenden */
export function startLiveUpdates(): () => void {
  if (!isConfigured()) return () => {};

  const unsubFns: Array<() => void> = [];

  for (const { key, store } of STORES) {
    const unsub = dbListen(`stores/${key}`, (raw) => {
      if (!raw || writeLock) return;

      // Echo-Schutz: eigene Updates der letzten 2s ignorieren
      const ownTs = lastOwnWrite[key] ?? 0;
      if (Date.now() - ownTs < 2000) return;

      try {
        const str  = typeof raw === 'string' ? raw : JSON.stringify(raw);
        const data = JSON.parse(str);
        const remoteTs = data?.ts ?? 0;
        if (Date.now() - ownTs < 2000 && remoteTs <= ownTs) return;

        const storeData = data?.state ?? data;
        if (storeData && typeof storeData === 'object') {
          applyToStore(store, storeData as Record<string, unknown>);
        }
      } catch { /* ignorieren */ }
    });
    unsubFns.push(unsub);
  }

  console.log('[Sync] ✅ Live-Updates aktiv');
  return () => unsubFns.forEach(fn => fn());
}

// ─── Einzelnen Store sofort speichern ─────────────────────────────────────────

export async function forceSave(storeKey: string): Promise<void> {
  const entry = STORES.find(s => s.key === storeKey);
  if (!entry || !isConfigured()) return;
  lastOwnWrite[storeKey] = Date.now();
  await writeWithRetry(storeKey, getStoreData(entry.store));
}
