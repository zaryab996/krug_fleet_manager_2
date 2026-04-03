/**
 * db/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zentraler Firebase-Client für die gesamte App.
 *
 * Firebase Realtime Database:
 *  • Alle Fahrzeugdaten, Einstellungen, Benutzerdaten
 *  • Echtzeit-Sync zwischen allen Browsern weltweit
 *  • Kostenlose Stufe: 1 GB Speicher, 10 GB/Monat Transfer
 *
 * Konfiguration:
 *  1. Priorität: Build-Zeit Env-Variablen (VITE_FIREBASE_*)
 *  2. Priorität: localStorage (fleet-db-config) – kein Rebuild nötig
 *
 * Struktur in der Datenbank:
 *   /fleet/
 *     users/          → Benutzerkonten
 *     stores/         → App-Daten (Fahrzeuge, Einstellungen etc.)
 *       fleet-data    → Fahrzeugdaten
 *       fleet-docs    → Dokument-Metadaten
 *       ...
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getDatabase, ref, get, set, update, remove,
  onValue, off, serverTimestamp,
  type Database, type DataSnapshot, type DatabaseReference,
} from 'firebase/database';
import {
  getStorage, ref as sRef,
  uploadBytes, getDownloadURL, deleteObject,
  type FirebaseStorage,
} from 'firebase/storage';

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface DbConfig {
  apiKey:              string;
  databaseURL:         string;
  projectId:           string;
  storageBucket?:      string;
  authDomain?:         string;
  appId?:              string;
  messagingSenderId?:  string;
}

export interface DbStatus {
  configured: boolean;
  connected:  boolean;
  projectId:  string;
  mode:       'firebase' | 'local';
}

// ─── Konfiguration laden ──────────────────────────────────────────────────────

const LS_CONFIG_KEY = 'fleet-db-config';

export function loadConfig(): DbConfig | null {
  // 1. Build-Zeit (wenn VITE_FIREBASE_API_KEY gesetzt)
  const buildKey  = (import.meta.env.VITE_FIREBASE_API_KEY           as string) || '';
  const buildUrl  = (import.meta.env.VITE_FIREBASE_DATABASE_URL      as string) || '';
  const buildPid  = (import.meta.env.VITE_FIREBASE_PROJECT_ID        as string) || '';
  const buildBkt  = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET    as string) || '';
  const buildAuth = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string) || `${buildPid}.firebaseapp.com`;
  const buildApp  = (import.meta.env.VITE_FIREBASE_APP_ID             as string) || '';
  const buildMsi  = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '';
  if (buildKey && buildUrl && buildPid) {
    return {
      apiKey: buildKey, databaseURL: buildUrl, projectId: buildPid,
      storageBucket: buildBkt, authDomain: buildAuth,
      appId: buildApp, messagingSenderId: buildMsi,
    };
  }
  // 2. Runtime (localStorage)
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as DbConfig;
    if (cfg.apiKey && cfg.databaseURL && cfg.projectId) return cfg;
  } catch { /* ignore */ }
  return null;
}

export function saveConfig(cfg: DbConfig): void {
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(LS_CONFIG_KEY);
}

// ─── Firebase-Instanz ─────────────────────────────────────────────────────────

let _app:     FirebaseApp    | null = null;
let _db:      Database        | null = null;
let _storage: FirebaseStorage | null = null;
let _config:  DbConfig        | null = null;

function initClient() {
  const cfg = loadConfig();
  if (!cfg) {
    console.log('[DB] Kein Backend konfiguriert → localStorage-Modus');
    return;
  }
  try {
    _app = getApps().length ? getApp() : initializeApp({
      apiKey:             cfg.apiKey,
      databaseURL:        cfg.databaseURL,
      projectId:          cfg.projectId,
      storageBucket:      cfg.storageBucket,
      authDomain:         cfg.authDomain,
      appId:              cfg.appId,
      messagingSenderId:  cfg.messagingSenderId,
    });
    _db      = getDatabase(_app);
    _storage = cfg.storageBucket ? getStorage(_app) : null;
    _config  = cfg;
    console.log(`[DB] ✅ Firebase verbunden: ${cfg.projectId}`);
  } catch (err) {
    console.error('[DB] ❌ Firebase-Fehler:', err);
  }
}

initClient();

// ─── Öffentliche Exports ──────────────────────────────────────────────────────

export const isConfigured = (): boolean => _db !== null;
export const getConfig    = (): DbConfig | null => _config;
export const getProjectId = (): string  => _config?.projectId ?? '';

// ─── Daten-API ────────────────────────────────────────────────────────────────

const ROOT = 'fleet';

/** Liest einmalig einen Wert */
export async function dbRead<T>(path: string): Promise<T | null> {
  if (!_db) return null;
  try {
    const snap = await get(ref(_db, `${ROOT}/${path}`));
    return snap.exists() ? (snap.val() as T) : null;
  } catch (err) {
    console.warn(`[DB] Read(${path}):`, err);
    return null;
  }
}

/** Schreibt einen Wert (überschreibt) */
export async function dbWrite(path: string, value: unknown): Promise<boolean> {
  if (!_db) return false;
  try {
    await set(ref(_db, `${ROOT}/${path}`), value);
    return true;
  } catch (err) {
    console.warn(`[DB] Write(${path}):`, err);
    return false;
  }
}

/** Löscht einen Pfad */
export async function dbDelete(path: string): Promise<boolean> {
  if (!_db) return false;
  try {
    await remove(ref(_db, `${ROOT}/${path}`));
    return true;
  } catch (err) {
    console.warn(`[DB] Delete(${path}):`, err);
    return false;
  }
}

/** Abonniert Echtzeit-Updates. Gibt Unsubscribe-Funktion zurück. */
export function dbListen(
  path: string,
  cb: (val: unknown) => void,
): () => void {
  if (!_db) return () => {};
  const r = ref(_db, `${ROOT}/${path}`);
  const handler = (snap: DataSnapshot) => cb(snap.val());
  onValue(r, handler, (err) => console.warn(`[DB] Listen(${path}):`, err));
  return () => off(r, 'value', handler);
}

// ─── Verbindungstest ──────────────────────────────────────────────────────────

export async function testConnection(cfg: DbConfig): Promise<{ ok: boolean; message: string; details?: string }> {
  let testApp: FirebaseApp | null = null;
  try {
    const appName = `test-${Date.now()}`;
    testApp = initializeApp({
      apiKey:             cfg.apiKey,
      databaseURL:        cfg.databaseURL,
      projectId:          cfg.projectId,
      storageBucket:      cfg.storageBucket,
      authDomain:         cfg.authDomain,
      appId:              cfg.appId,
      messagingSenderId:  cfg.messagingSenderId,
    }, appName);
    const db = getDatabase(testApp);
    const testRef = ref(db, 'fleet/_test');
    await set(testRef, { ok: true, ts: Date.now() });
    const snap = await get(testRef);
    if (!snap.exists()) throw new Error('Lese/Schreib-Test fehlgeschlagen');
    await set(testRef, null);
    return { ok: true, message: `✅ Verbindung erfolgreich! Projekt: ${cfg.projectId}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('PERMISSION_DENIED'))
      return { ok: false, message: '❌ Zugriff verweigert', details: 'Setze die Datenbankregeln auf { ".read": true, ".write": true } (Testmodus)' };
    if (msg.includes('Invalid URL') || msg.includes('databaseURL'))
      return { ok: false, message: '❌ Ungültige Database URL', details: 'Format: https://PROJEKT-default-rtdb.europe-west1.firebasedatabase.app' };
    if (msg.includes('auth/invalid-api-key') || msg.includes('API key'))
      return { ok: false, message: '❌ Ungültiger API Key' };
    return { ok: false, message: `❌ ${msg}` };
  }
}

// ─── Datei-Storage ────────────────────────────────────────────────────────────

/** Lädt eine Datei in Firebase Storage hoch, gibt Download-URL zurück */
export async function fileUpload(
  path: string,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<string | null> {
  if (!_storage) return null;
  try {
    const r = sRef(_storage, path);
    await uploadBytes(r, data instanceof ArrayBuffer ? new Uint8Array(data) : data, { contentType: mimeType });
    return await getDownloadURL(r);
  } catch (err) {
    console.warn('[DB] fileUpload:', err);
    return null;
  }
}

/** Gibt die Download-URL zurück */
export async function fileGetUrl(path: string): Promise<string | null> {
  if (!_storage) return null;
  try {
    return await getDownloadURL(sRef(_storage, path));
  } catch { return null; }
}

/** Löscht eine Datei aus Storage */
export async function fileDelete(path: string): Promise<boolean> {
  if (!_storage) return false;
  try {
    await deleteObject(sRef(_storage, path));
    return true;
  } catch { return false; }
}
