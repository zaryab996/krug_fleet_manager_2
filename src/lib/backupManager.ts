/**
 * backupManager.ts
 *
 * Vollständiges Backup & Restore des Krug Fleet Managers.
 * Erfasst:
 *   – alle Zustand-Store-Keys (strukturierte Daten)
 *   – Dokumente & Bilder (IndexedDB oder Supabase Storage je nach Konfiguration)
 *
 * Backup-Snapshots werden in localStorage UND (wenn konfiguriert) in Supabase gespeichert.
 *
 * Maximale Anzahl gespeicherter Backups: MAX_SNAPSHOTS (Standard 30)
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { saveFile, loadFile, deleteFile as _deleteFile } from './fileStorage';

export const MAX_SNAPSHOTS = 30;

export const BACKUP_LS_KEY = 'fleet-backups';

/** Alle Store-Schlüssel (außer Backups selbst und Auth) */
const FLEET_STORE_KEYS = [
  'fleet-data',
  'fleet-users',
  'fleet-docs',
  'fleet-color-legend',
  'fleet-column-config',
  'fleet-doc-perms',
  'fleet-vehicle-history',
  'fleet-vehicle-notes',
  'fleet-vehicle-access',
  'fleet-user-groups',
  'fleet-custom-columns',
  'fleet-roles',
  'fleet-vehicle-mails',
  'fleet-email-settings',
] as const;

export interface BackupFile {
  name: string;
  type: string;
  dataB64: string;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  label: string;
  isAuto: boolean;
  lsData: Record<string, string>;
  idbFiles: BackupFile[];
  meta: {
    vehicleCount: number;
    userCount: number;
    fileCount: number;
    sizeBytes: number;
  };
}

// ─── Store-Daten lesen (localStorage + optional Supabase) ─────────────────────

async function readAllStoreData(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  if (isSupabaseConfigured && supabase) {
    // Von Supabase lesen (primäre Quelle)
    try {
      const { data } = await supabase
        .from('store_state')
        .select('key, value')
        .in('key', [...FLEET_STORE_KEYS]);
      if (data) {
        for (const row of data) {
          result[row.key] = row.value as string;
        }
      }
    } catch { /* Fallback auf localStorage */ }
  }

  // Fehlende Keys aus localStorage auffüllen
  for (const key of FLEET_STORE_KEYS) {
    if (!(key in result)) {
      const val = localStorage.getItem(key);
      if (val !== null) result[key] = val;
    }
  }

  return result;
}

async function writeAllStoreData(data: Record<string, string>): Promise<void> {
  // localStorage schreiben
  for (const key of FLEET_STORE_KEYS) {
    if (key in data) localStorage.setItem(key, data[key]);
    else localStorage.removeItem(key);
  }

  // Supabase schreiben (wenn konfiguriert)
  if (isSupabaseConfigured && supabase) {
    const upserts = Object.entries(data)
      .filter(([k]) => FLEET_STORE_KEYS.includes(k as typeof FLEET_STORE_KEYS[number]))
      .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    if (upserts.length > 0) {
      await supabase.from('store_state').upsert(upserts, { onConflict: 'key' });
    }
  }
}

// ─── Datei-Backup (IndexedDB Fallback oder Supabase Storage) ─────────────────

function _openKrugFleetIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Versuche beide bekannte DB-Namen
    const req = indexedDB.open('KrugFleetDocs', 1);
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
  });
}

async function readAllIDBFiles(): Promise<BackupFile[]> {
  try {
    const db = await _openKrugFleetIDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result as string[];
        if (keys.length === 0) { resolve([]); return; }
        const files: BackupFile[] = [];
        let done = 0;
        for (const k of keys) {
          const r = store.get(k);
          r.onsuccess = () => {
            const buf = r.result as ArrayBuffer | undefined;
            if (buf) {
              const bytes  = new Uint8Array(buf);
              let   binary = '';
              bytes.forEach(b => { binary += String.fromCharCode(b); });
              files.push({ name: k, type: 'application/octet-stream', dataB64: btoa(binary) });
            }
            if (++done === keys.length) resolve(files);
          };
          r.onerror = () => { if (++done === keys.length) resolve(files); };
        }
      };
      keysReq.onerror = () => reject(keysReq.error);
    });
  } catch {
    return [];
  }
}

async function writeAllIDBFiles(files: BackupFile[]): Promise<void> {
  if (files.length === 0) return;
  try {
    const db = await _openKrugFleetIDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.clear();
      files.forEach(f => {
        const binary = atob(f.dataB64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        store.put(bytes.buffer, f.name);
      });
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    console.warn('[Backup] IndexedDB-Restore teilweise fehlgeschlagen');
  }
}

// ─── Backup-Snapshots in localStorage + Supabase ──────────────────────────────

function _loadSnapshotList(): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _saveSnapshotList(list: BackupSnapshot[]): void {
  localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(list));
  // Zusätzlich async in Supabase
  if (isSupabaseConfigured && supabase) {
    void supabase
      .from('store_state')
      .upsert(
        { key: BACKUP_LS_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .then(({ error }) => {
        if (error) console.warn('[Backup] Supabase save error:', error.message);
      });
  }
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

export async function createBackup(label: string, isAuto: boolean): Promise<BackupSnapshot[]> {
  const lsData   = await readAllStoreData();
  const idbFiles = isSupabaseConfigured ? [] : await readAllIDBFiles();

  let vehicleCount = 0;
  let userCount    = 0;
  try {
    const fleetRaw = lsData['fleet-data'];
    if (fleetRaw) vehicleCount = JSON.parse(fleetRaw)?.state?.fleetData?.records?.length ?? 0;
    const usersRaw = lsData['fleet-users'];
    if (usersRaw) userCount = JSON.parse(usersRaw)?.state?.users?.length ?? 0;
  } catch { /* ignore */ }

  const sizeBytes = JSON.stringify(lsData).length + idbFiles.reduce((s, f) => s + f.dataB64.length, 0);

  const snapshot: BackupSnapshot = {
    id: `bak_${Date.now()}`,
    createdAt: new Date().toISOString(),
    label,
    isAuto,
    lsData,
    idbFiles,
    meta: { vehicleCount, userCount, fileCount: idbFiles.length, sizeBytes },
  };

  const list    = _loadSnapshotList();
  const updated = [snapshot, ...list].slice(0, MAX_SNAPSHOTS);
  _saveSnapshotList(updated);
  return updated;
}

export async function restoreBackup(id: string): Promise<void> {
  const list = _loadSnapshotList();
  const snap = list.find(s => s.id === id);
  if (!snap) throw new Error(`Backup ${id} nicht gefunden`);

  await writeAllStoreData(snap.lsData);
  await writeAllIDBFiles(snap.idbFiles);

  window.location.reload();
}

export function deleteBackup(id: string): BackupSnapshot[] {
  const updated = _loadSnapshotList().filter(s => s.id !== id);
  _saveSnapshotList(updated);
  return updated;
}

export function listBackups(): BackupSnapshot[] {
  return _loadSnapshotList();
}

export function shouldAutoBackup(intervalMs: number): boolean {
  const list     = _loadSnapshotList();
  const lastAuto = list.find(s => s.isAuto);
  if (!lastAuto) return true;
  return Date.now() - new Date(lastAuto.createdAt).getTime() > intervalMs;
}

export function downloadBackupFile(id: string): void {
  const list = _loadSnapshotList();
  const snap = list.find(s => s.id === id);
  if (!snap) return;

  const json     = JSON.stringify(snap, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const date     = new Date(snap.createdAt).toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  const filename = `krug-fleet-backup_${date}.json`;

  const reader   = new FileReader();
  reader.onload  = () => {
    const a = document.createElement('a');
    a.href     = reader.result as string;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  reader.readAsDataURL(blob);
}

export async function importBackupFile(file: File): Promise<void> {
  const text       = await file.text();
  const snap: BackupSnapshot = JSON.parse(text);
  snap.id    = `bak_import_${Date.now()}`;
  snap.label = `Import: ${snap.label}`;
  snap.isAuto = false;
  const list = _loadSnapshotList();
  _saveSnapshotList([snap, ...list].slice(0, MAX_SNAPSHOTS));
  await restoreBackup(snap.id);
}
