/**
 * Supabase Client – Runtime-konfigurierbar
 *
 * Reihenfolge der Konfigurationsquellen (höhere Priorität zuerst):
 *   1. Build-Zeit-Env-Variablen  (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
 *   2. Runtime-Config aus localStorage  (fleet-supabase-config)
 *
 * → Kein Rebuild nötig. Credentials können im Admin-Panel eingetragen werden.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_KEY = 'fleet-supabase-config';

export interface SupabaseRuntimeConfig {
  url:  string;
  key:  string;
}

/** Liest die Runtime-Konfiguration aus localStorage */
export function getRuntimeConfig(): SupabaseRuntimeConfig | null {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseRuntimeConfig;
    if (parsed?.url && parsed?.key) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Speichert Runtime-Konfiguration in localStorage */
export function setRuntimeConfig(url: string, key: string): void {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }));
}

/** Löscht die Runtime-Konfiguration */
export function clearRuntimeConfig(): void {
  localStorage.removeItem(RUNTIME_KEY);
}

// ─── Bestimme aktive Konfiguration ───────────────────────────────────────────

const BUILD_URL = (import.meta.env.VITE_SUPABASE_URL      as string) || '';
const BUILD_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

const runtimeCfg = getRuntimeConfig();

const ACTIVE_URL = BUILD_URL || runtimeCfg?.url || '';
const ACTIVE_KEY = BUILD_KEY || runtimeCfg?.key || '';

/** true wenn Supabase konfiguriert ist (Build-Zeit ODER Runtime) */
export let isSupabaseConfigured: boolean = Boolean(ACTIVE_URL && ACTIVE_KEY);

/** Supabase-Client (null wenn nicht konfiguriert) */
export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(ACTIVE_URL, ACTIVE_KEY, { auth: { persistSession: false } })
  : null;

if (isSupabaseConfigured) {
  const projectId = ACTIVE_URL.replace(/^https?:\/\//, '').split('.')[0];
  console.log('[Supabase] ✅ Client initialisiert:', projectId,
    runtimeCfg && !BUILD_URL ? '(Runtime-Config)' : '(Build-Config)');
} else {
  console.log('[Supabase] ℹ Nicht konfiguriert – localStorage-Modus aktiv');
}

/**
 * Erstellt einen neuen Supabase-Client mit gegebenen Credentials.
 * Verwendet von der Admin-Konfiguration für den Verbindungstest.
 */
export function createTestClient(url: string, key: string): SupabaseClient {
  return createClient(url.trim(), key.trim(), { auth: { persistSession: false } });
}

/**
 * Aktiviert Supabase zur Laufzeit mit neuen Credentials.
 * Speichert in localStorage und löst App-Neustart aus.
 */
export function activateSupabase(url: string, key: string): void {
  setRuntimeConfig(url, key);
  // App neu laden damit main.tsx die vollständige Init-Sequenz durchläuft
  window.location.reload();
}

/**
 * Deaktiviert Supabase und wechselt zurück zu localStorage-Modus.
 */
export function deactivateSupabase(): void {
  clearRuntimeConfig();
  window.location.reload();
}

/** Gibt die aktive URL zurück (für Anzeige) */
export function getActiveSupabaseUrl(): string {
  return ACTIVE_URL;
}
