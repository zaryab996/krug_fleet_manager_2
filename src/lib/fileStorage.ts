/**
 * Datei-Speicherung für Fahrzeugdokumente
 *
 * Wenn Supabase konfiguriert ist:
 *   → Supabase Storage (Bucket: vehicle-docs)
 *   → Persistent, geräteübergreifend, unbegrenzte Größe
 *
 * Fallback (kein Supabase):
 *   → IndexedDB (KrugFleetDocs / files)
 *   → Browserspezifisch, typisch bis 250 MB+
 *
 * Die öffentliche API bleibt IDENTISCH zu vorher:
 *   saveFile, loadFile, deleteFile, arrayBufferToBlobUrl,
 *   arrayBufferToDataUrl, downloadBuffer, formatFileSize
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

// ─── Supabase Storage Bucket ──────────────────────────────────────────────────

const BUCKET = 'vehicle-docs';

// ─── IndexedDB Konstanten (Fallback) ─────────────────────────────────────────

const DB_NAME    = 'KrugFleetDocs';
const STORE_NAME = 'files';
const DB_VERSION = 1;

// ─── IndexedDB Hilfsfunktionen ────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveFileIDB(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function loadFileIDB(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function deleteFileIDB(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Supabase Storage Hilfsfunktionen ────────────────────────────────────────

async function ensureBucket(): Promise<void> {
  if (!supabase) return;
  await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {
    /* Bucket existiert bereits – ignorieren */
  });
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/** Datei speichern – gibt storageKey zurück */
export async function saveFile(key: string, data: ArrayBuffer): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await ensureBucket();
    const blob = new Blob([data]);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, blob, { upsert: true });
    if (error) throw new Error(`Supabase Storage saveFile: ${error.message}`);
    return;
  }
  return saveFileIDB(key, data);
}

/** Datei laden – gibt ArrayBuffer zurück */
export async function loadFile(key: string): Promise<ArrayBuffer | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(key);
    if (error || !data) return null;
    return data.arrayBuffer();
  }
  return loadFileIDB(key);
}

/** Datei löschen */
export async function deleteFile(key: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([key]);
    if (error) console.warn(`Supabase Storage deleteFile(${key}):`, error.message);
    return;
  }
  return deleteFileIDB(key);
}

// ─── Hilfsfunktionen (unverändert) ───────────────────────────────────────────

/** ArrayBuffer → Blob-URL (temporär, für Vorschau) */
export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/** ArrayBuffer → Base64 Data-URL (für PDF-Einbettung in Chrome) */
export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Datei herunterladen – via data:-URL, funktioniert auch in sandboxed iFrames */
export function downloadBuffer(buffer: ArrayBuffer, mimeType: string, filename: string): void {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const a = document.createElement('a');
  a.href = `data:${mimeType};base64,${base64}`;
  a.download = filename;
  a.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

/** Formatiert Dateigröße lesbar */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
