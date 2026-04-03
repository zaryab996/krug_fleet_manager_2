/**
 * supabaseUsers.ts – Benutzer-Datenzugriff via Supabase
 *
 * Diese Datei ist die einzige Stelle, an der Benutzer gelesen und
 * geschrieben werden. Sie ist Datenquelle für:
 *   - Login  (geräteübergreifend, da Supabase zentral)
 *   - Benutzerverwaltung im Admin-Panel
 *
 * Fallback: Wenn Supabase nicht konfiguriert ist, wird der lokale
 * useUsersStore als Datenquelle genutzt (App bleibt offline-fähig).
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { simpleHash, generateId, getDefaultUsers } from '@/lib/index';
import type { User }                               from '@/lib/types';

// ─── Interne Hilfsfunktionen ──────────────────────────────────────────────────

/** Konvertiert eine Supabase-Zeile in den App-internen User-Typ */
function rowToUser(row: Record<string, unknown>): User {
  return {
    id:           String(row.id          ?? ''),
    email:        String(row.email        ?? ''),
    name:         String(row.name         ?? ''),
    role:         (row.role as User['role']) ?? 'viewer',
    passwordHash: String(row.password_hash ?? ''),
    groupId:      row.group_id ? String(row.group_id) : undefined,
    createdAt:    String(row.created_at   ?? new Date().toISOString()),
  };
}

/** Konvertiert einen App-User in eine Supabase-Zeile */
function userToRow(user: User) {
  return {
    id:            user.id,
    email:         user.email.trim().toLowerCase(),
    name:          user.name.trim(),
    role:          user.role,
    password_hash: user.passwordHash,
    group_id:      user.groupId ?? null,
    created_at:    user.createdAt,
    updated_at:    new Date().toISOString(),
  };
}

// ─── Lesen ────────────────────────────────────────────────────────────────────

/**
 * Lädt ALLE Benutzer aus Supabase.
 * Gibt null zurück wenn Supabase nicht konfiguriert oder Fehler.
 */
export async function getAllUsersFromSupabase(): Promise<User[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('fleet_users')
    .select('id, email, name, role, password_hash, group_id, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Users] Fehler beim Laden:', error.message);
    return null;
  }

  return (data ?? []).map(row => rowToUser(row as Record<string, unknown>));
}

/**
 * Sucht einen Benutzer per E-Mail in Supabase.
 * Gibt null zurück wenn nicht gefunden oder Supabase nicht konfiguriert.
 */
/**
 * Normalisiert eine Login-Eingabe auf eine E-Mail-Adresse.
 * Benutzernamen ohne @ werden als Username@fleet.local behandelt.
 *   'ksm.user1'           → 'ksm.user1@fleet.local'
 *   'admin@firma.de'      → 'admin@firma.de'   (unverändert)
 */
export function normalizeLoginInput(input: string): string {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed}@fleet.local`;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const normalizedEmail = normalizeLoginInput(email);

  const { data, error } = await supabase
    .from('fleet_users')
    .select('id, email, name, role, password_hash, group_id, created_at')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error('[Users] getUserByEmail Fehler:', error.message);
    return null;
  }

  return data ? rowToUser(data as Record<string, unknown>) : null;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Prüft E-Mail + Passwort gegen Supabase fleet_users-Tabelle.
 *
 * Ablauf:
 * 1. E-Mail in Supabase suchen
 * 2. Passwort-Hash vergleichen (simpleHash)
 * 3. Bei Erfolg: vollständiges User-Objekt zurückgeben
 *
 * Returns null bei falschem Login oder Fehler.
 */
export async function loginWithSupabase(
  email: string,
  password: string,
): Promise<User | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  // Unterstützt sowohl "ksm.user1" als auch "user@firma.de"
  const normalizedEmail = normalizeLoginInput(email);
  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    console.log('[Users] Login: Benutzer nicht gefunden:', normalizedEmail);
    return null;
  }

  const hash = simpleHash(password.trim());
  if (user.passwordHash !== hash) {
    console.log('[Users] Login: falsches Passwort für:', email);
    return null;
  }

  console.log(`[Users] ✅ Login erfolgreich: ${user.name} (${user.role})`);
  return user;
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

/**
 * Legt einen neuen Benutzer in Supabase an.
 * Schreibt gleichzeitig in den lokalen Store (Zustand).
 */
export async function createUserInSupabase(
  email:    string,
  name:     string,
  role:     User['role'],
  password: string,
  groupId?: string,
): Promise<User | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const newUser: User = {
    id:           generateId(),
    email:        email.trim().toLowerCase(),
    name:         name.trim(),
    role,
    passwordHash: simpleHash(password.trim()),
    groupId,
    createdAt:    new Date().toISOString(),
  };

  const { error } = await supabase
    .from('fleet_users')
    .insert(userToRow(newUser));

  if (error) {
    console.error('[Users] createUser Fehler:', error.message);
    return null;
  }

  console.log(`[Users] ✅ Benutzer erstellt: ${newUser.name} (${newUser.role})`);
  return newUser;
}

/**
 * Aktualisiert Benutzer-Felder in Supabase (Name, Rolle, E-Mail, Gruppe).
 */
export async function updateUserInSupabase(
  id:      string,
  changes: Partial<Pick<User, 'name' | 'role' | 'email' | 'groupId'>>,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.name     !== undefined) row.name     = changes.name.trim();
  if (changes.role     !== undefined) row.role     = changes.role;
  if (changes.email    !== undefined) row.email    = changes.email.trim().toLowerCase();
  if (changes.groupId  !== undefined) row.group_id = changes.groupId ?? null;

  const { error } = await supabase
    .from('fleet_users')
    .update(row)
    .eq('id', id);

  if (error) {
    console.error('[Users] updateUser Fehler:', error.message);
    return false;
  }

  console.log(`[Users] ✅ Benutzer ${id} aktualisiert`);
  return true;
}

/**
 * Löscht einen Benutzer aus Supabase.
 * Admin (id='admin-1') kann nicht gelöscht werden.
 */
export async function deleteUserFromSupabase(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  if (id === 'admin-1') return false; // Admin ist unveränderlich

  const { error } = await supabase
    .from('fleet_users')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Users] deleteUser Fehler:', error.message);
    return false;
  }

  console.log(`[Users] ✅ Benutzer ${id} gelöscht`);
  return true;
}

/**
 * Setzt das Passwort eines Benutzers zurück.
 */
export async function resetPasswordInSupabase(
  id:          string,
  newPassword: string,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const { error } = await supabase
    .from('fleet_users')
    .update({
      password_hash: simpleHash(newPassword.trim()),
      updated_at:    new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('[Users] resetPassword Fehler:', error.message);
    return false;
  }

  console.log(`[Users] ✅ Passwort für ${id} zurückgesetzt`);
  return true;
}

// ─── Initialisierung (Sicherstellen dass Admin existiert) ─────────────────────

/**
 * Stellt sicher, dass der Standard-Admin in fleet_users existiert.
 * Wird beim App-Start einmalig aufgerufen.
 * Legt den Admin nur an wenn die Tabelle LEER ist.
 */
export async function ensureDefaultUsersInSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const defaults = getDefaultUsers();

  // IDs der Default-User holen
  const defaultIds = defaults.map(u => u.id);

  // Prüfen welche davon schon in Supabase existieren
  const { data: existing, error } = await supabase
    .from('fleet_users')
    .select('id')
    .in('id', defaultIds);

  if (error) {
    console.error('[Users] ensureDefaultUsers Fehler:', error.message);
    return;
  }

  const existingIds = new Set((existing ?? []).map(r => String(r.id)));
  const missing = defaults.filter(u => !existingIds.has(u.id));

  if (missing.length === 0) {
    console.log('[Users] ✅ Alle Default-User bereits in Supabase vorhanden');
    return;
  }

  console.log(`[Users] Lege ${missing.length} fehlende Default-User an:`, missing.map(u => u.email));

  const rows = missing.map(u => userToRow(u));
  const { error: insertError } = await supabase
    .from('fleet_users')
    .upsert(rows, { onConflict: 'id' });

  if (insertError) {
    console.error('[Users] Default-User konnten nicht angelegt werden:', insertError.message);
  } else {
    console.log(`[Users] ✅ ${rows.length} Default-User angelegt`);
  }
}

/**
 * Einmalige Migration: Benutzer aus dem Zustand-Store (fleet-users localStorage)
 * nach Supabase fleet_users migrieren.
 * Läuft nur wenn fleet_users leer ist.
 */
export async function migrateUsersToSupabase(localUsers: User[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  if (!localUsers || localUsers.length === 0) return;

  // Prüfen ob bereits Daten in fleet_users
  const { count } = await supabase
    .from('fleet_users')
    .select('*', { count: 'exact', head: true })
    .then(r => ({ count: r.count ?? 0 }));

  if (count > 0) {
    console.log(`[Users] Migration übersprungen – ${count} Benutzer bereits in Supabase`);
    return;
  }

  console.log(`[Users] Migriere ${localUsers.length} Benutzer nach Supabase...`);

  const rows = localUsers.map(u => userToRow(u));
  const { error } = await supabase
    .from('fleet_users')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('[Users] Migrations-Fehler:', error.message);
  } else {
    console.log(`[Users] ✅ ${rows.length} Benutzer migriert`);
  }
}
