/**
 * db/users.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Benutzer-CRUD direkt in Firebase Realtime Database.
 *
 * Alle Benutzer liegen unter: /fleet/users/{id}
 * Login prüft: E-Mail/Benutzername + Passwort-Hash
 */

import { dbRead, dbWrite, dbDelete, dbListen, isConfigured } from './client';
import { simpleHash, generateId, getDefaultUsers } from '@/lib/index';
import type { User } from '@/lib/types';

const USERS_PATH = 'users';

// ─── Normalisierung ───────────────────────────────────────────────────────────

/**
 * Wandelt Benutzernamen (ksm.user1) in internes E-Mail-Format um.
 * E-Mail-Adressen (mit @) bleiben unverändert.
 */
export function normalizeLogin(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : `${trimmed}@fleet.local`;
}

// ─── Lesen ────────────────────────────────────────────────────────────────────

/** Alle Benutzer laden */
export async function fetchAllUsers(): Promise<User[]> {
  if (!isConfigured()) return [];
  try {
    const data = await dbRead<Record<string, User>>(USERS_PATH);
    if (!data) return [];
    return Object.values(data);
  } catch (err) {
    console.warn('[Users] fetchAll:', err);
    return [];
  }
}

/** Einen Benutzer per E-Mail suchen */
export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await fetchAllUsers();
  const normalized = normalizeLogin(email);
  return users.find(u => u.email.toLowerCase() === normalized) ?? null;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Login gegen Firebase.
 * Unterstützt: E-Mail (user@firma.de) und Benutzername (ksm.user1)
 */
export async function loginFromDb(email: string, password: string): Promise<User | null> {
  if (!isConfigured()) return null;
  try {
    const normalized = normalizeLogin(email);
    const hash       = simpleHash(password.trim());
    const users      = await fetchAllUsers();
    const user       = users.find(
      u => u.email.toLowerCase() === normalized && u.passwordHash === hash
    );
    return user ?? null;
  } catch (err) {
    console.warn('[Users] login:', err);
    return null;
  }
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

/** Benutzer anlegen */
export async function createUser(
  email:    string,
  name:     string,
  role:     User['role'],
  password: string,
  id?:      string,
): Promise<User> {
  const user: User = {
    id:           id ?? generateId(),
    email:        normalizeLogin(email),
    name:         name.trim(),
    role,
    createdAt:    new Date().toISOString(),
    passwordHash: simpleHash(password.trim()),
  };
  if (isConfigured()) {
    await dbWrite(`${USERS_PATH}/${user.id}`, user);
  }
  return user;
}

/** Benutzer aktualisieren */
export async function updateUser(
  id:      string,
  changes: Partial<Pick<User, 'name' | 'role' | 'email' | 'groupId'>>,
): Promise<void> {
  if (!isConfigured()) return;
  const users = await fetchAllUsers();
  const user  = users.find(u => u.id === id);
  if (!user) return;
  await dbWrite(`${USERS_PATH}/${id}`, { ...user, ...changes });
}

/** Passwort zurücksetzen */
export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  if (!isConfigured()) return;
  const users = await fetchAllUsers();
  const user  = users.find(u => u.id === id);
  if (!user) return;
  await dbWrite(`${USERS_PATH}/${id}`, {
    ...user,
    passwordHash: simpleHash(newPassword.trim()),
  });
}

/** Benutzer löschen */
export async function deleteUser(id: string): Promise<void> {
  if (!isConfigured()) return;
  await dbDelete(`${USERS_PATH}/${id}`);
}

// ─── Standard-Benutzer sicherstellen ─────────────────────────────────────────

/**
 * Stellt sicher dass alle Standard-Benutzer in Firebase existieren.
 * Wird beim App-Start aufgerufen. Überschreibt KEINE bestehenden Benutzer.
 */
export async function ensureDefaultUsers(): Promise<void> {
  if (!isConfigured()) return;
  try {
    const existing = await fetchAllUsers();
    const existingIds = new Set(existing.map(u => u.id));
    const defaults    = getDefaultUsers();

    for (const user of defaults) {
      if (!existingIds.has(user.id)) {
        await dbWrite(`${USERS_PATH}/${user.id}`, user);
        console.log(`[Users] Standard-Benutzer angelegt: ${user.name}`);
      }
    }
  } catch (err) {
    console.warn('[Users] ensureDefaultUsers:', err);
  }
}

/**
 * Migriert lokale Benutzer nach Firebase.
 * Wird einmalig beim ersten Verbinden aufgerufen.
 */
export async function migrateLocalUsers(localUsers: User[]): Promise<void> {
  if (!isConfigured() || localUsers.length === 0) return;
  try {
    const existing    = await fetchAllUsers();
    const existingIds = new Set(existing.map(u => u.id));

    for (const user of localUsers) {
      if (!existingIds.has(user.id)) {
        await dbWrite(`${USERS_PATH}/${user.id}`, user);
      }
    }
    console.log(`[Users] Migration: ${localUsers.length} Benutzer nach Firebase`);
  } catch (err) {
    console.warn('[Users] migrateLocalUsers:', err);
  }
}

// ─── Live-Updates ─────────────────────────────────────────────────────────────

/** Benutzer live aus Firebase laden wenn sich etwas ändert */
export function listenUsers(cb: (users: User[]) => void): () => void {
  if (!isConfigured()) return () => {};
  return dbListen(USERS_PATH, (raw) => {
    if (!raw || typeof raw !== 'object') return;
    cb(Object.values(raw as Record<string, User>));
  });
}
