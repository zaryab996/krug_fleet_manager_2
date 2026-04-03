import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, VehicleRecord, ColumnDefinition, ImportSession, FleetData, VehicleDocument, ColorLegendEntry, UserColumnConfig, UserDocPermission, VehicleHistoryEntry, VehicleNote, HistoryEventType, HistoryFieldChange, UserVehicleAccess, UserGroup, GroupDocPermissions, GroupVehicleAccess, GroupColumnSettings, CustomColumn, ColumnLabelOverrides, CustomRole, BuiltinRole, VehicleMail } from '@/lib/types';
import { simpleHash, generateId, getDefaultUsers, mergeRecords, buildColumnDefs } from '@/lib/index';
import { deleteFile } from '@/lib/fileStorage';
import {
  createUser as dbCreateUser,
  updateUser as dbUpdateUser,
  deleteUser as dbDeleteUser,
  resetUserPassword as dbResetPassword,
  fetchAllUsers,
  loginFromDb,
  normalizeLogin,
} from '@/db/users';
import { isConfigured as isDbConfigured } from '@/db/client';

// ============================================================
// Auth Store
// ============================================================
interface AuthStore {
  currentUser: User | null;
  /** Sync-Fallback: prüft gegen übergebene users-Liste (wenn Supabase offline) */
  login: (email: string, password: string, users: User[]) => boolean;
  /** Async-Login: prüft erst Supabase, dann lokalen Fallback */
  loginAsync: (email: string, password: string, users: User[]) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      currentUser: null as User | null,

      // Sync-Fallback (lokale User-Liste, z. B. wenn Supabase offline)
      login: (email, password, users) => {
        const hash = simpleHash(password.trim());
        const user = users.find(
          u => u.email.toLowerCase() === email.trim().toLowerCase() && u.passwordHash === hash
        );
        if (user) { set({ currentUser: user }); return true; }
        return false;
      },

      // Async-Login: Firebase als primäre Quelle, lokaler Fallback
      loginAsync: async (email, password, users) => {
        // 1. Versuch: Firebase Realtime Database
        if (isDbConfigured()) {
          const dbUser = await loginFromDb(email, password);
          if (dbUser) {
            set({ currentUser: dbUser });
            return true;
          }
          // Firebase sagt nein → verweigern
          return false;
        }

        // 2. Fallback: lokale Benutzerliste (Offline-Modus)
        const normalizedEmail = normalizeLogin(email);
        const hash = simpleHash(password.trim());
        const user = users.find(
          u => u.email.toLowerCase() === normalizedEmail.toLowerCase() && u.passwordHash === hash
        );
        if (user) { set({ currentUser: user }); return true; }
        return false;
      },

      logout: () => set({ currentUser: null }),
    }),
    { name: 'fleet-auth' }
  )
);

// ============================================================
// Users Store
// ============================================================
interface UsersStore {
  users: User[];
  addUser: (email: string, name: string, role: User['role'], password: string) => void;
  updateUser: (id: string, changes: Partial<Pick<User, 'name' | 'role' | 'email' | 'groupId'>>) => void;
  deleteUser: (id: string) => void;
  resetPassword: (id: string, newPassword: string) => void;
}

export const useUsersStore = create<UsersStore>()(
  persist(
    (set, get) => ({
      users: getDefaultUsers(),

      addUser: (email, name, role, password) => {
        // In Firebase speichern (erzeugt ID) + lokal sofort anzeigen
        dbCreateUser(email, name, role, password).then(newUser => {
          set(s => ({
            users: s.users.some(u => u.id === newUser.id)
              ? s.users
              : [...s.users, newUser],
          }));
        }).catch(() => {
          // Fallback: lokale Anlage
          const newUser: User = {
            id: generateId(),
            email: normalizeLogin(email),
            name: name.trim(),
            role,
            createdAt: new Date().toISOString(),
            passwordHash: simpleHash(password.trim()),
          };
          set({ users: [...get().users, newUser] });
        });
      },

      updateUser: (id, changes) => {
        set({ users: get().users.map(u => u.id === id ? { ...u, ...changes } : u) });
        dbUpdateUser(id, changes).catch(e => console.warn('[Users] updateUser:', e));
      },

      deleteUser: (id) => {
        if (id === 'admin-1') return;
        set({ users: get().users.filter(u => u.id !== id) });
        dbDeleteUser(id).catch(e => console.warn('[Users] deleteUser:', e));
      },

      resetPassword: (id, newPassword) => {
        set({ users: get().users.map(u => u.id === id ? { ...u, passwordHash: simpleHash(newPassword) } : u) });
        dbResetPassword(id, newPassword).catch(e => console.warn('[Users] resetPassword:', e));
      },
    }),
    {
      name: 'fleet-users',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Default-User lokal sicherstellen
        const defaults = getDefaultUsers();
        const missing = defaults.filter(d => !state.users.find(u => u.id === d.id));
        if (missing.length > 0) {
          state.users = [...missing, ...state.users];
        }
        // Firebase-Benutzer laden (Live-Daten haben Vorrang)
        if (isDbConfigured()) {
          fetchAllUsers().then(dbUsers => {
            if (dbUsers.length > 0) {
              useUsersStore.setState({ users: dbUsers });
              console.log('[Users] ✅ Benutzer aus Firebase:', dbUsers.length);
            }
          }).catch(e => console.warn('[Users] Firebase-Sync:', e));
        }
      },
    }
  )
);

// ============================================================
// Fleet Data Store
// ============================================================
interface FleetStore {
  fleetData: FleetData;
  searchQuery: string;
  activeFilters: Record<string, string>;
  setSearchQuery: (q: string) => void;
  setFilter: (key: string, val: string) => void;
  clearFilters: () => void;
  previewImport: (records: VehicleRecord[]) => { duplicates: { incoming: VehicleRecord; existing: VehicleRecord }[]; newCount: number };
  importData: (records: VehicleRecord[], fileName: string) => { newCount: number; updatedCount: number; newColumns: string[]; newVins: string[] };
  addVehicle: (vehicle: VehicleRecord) => void;
  updateVehicle: (vin: string, changes: Partial<VehicleRecord>) => void;
  deleteVehicle: (vin: string) => void;
  archiveVehicle: (vin: string, byUserName: string) => void;
  archiveMultiple: (vins: string[], byUserName: string) => void;
  restoreVehicle: (vin: string) => void;
  restoreMultiple: (vins: string[]) => void;
  permanentlyDelete: (vin: string) => void;
  permanentlyDeleteMultiple: (vins: string[]) => void;
  getVehicle: (vin: string) => VehicleRecord | undefined;
  setVehicleColor: (vin: string, color: string | null) => void;
  getLiveVehicles: () => VehicleRecord[];
  getArchivedVehicles: () => VehicleRecord[];
}

export const useFleetStore = create<FleetStore>()(
  persist(
    (set, get) => ({
      fleetData: { columns: [] as ColumnDefinition[], records: [] as VehicleRecord[], importHistory: [] as ImportSession[] },
      searchQuery: '',
      activeFilters: {},
      setSearchQuery: (q) => set({ searchQuery: q }),
      setFilter: (key, val) => set(s => ({ activeFilters: { ...s.activeFilters, [key]: val } })),
      clearFilters: () => set({ searchQuery: '', activeFilters: {} }),
      // Vorschau: gibt Duplikate zurück ohne zu speichern
      previewImport: (incoming) => {
        const { fleetData } = get();
        const existingMap = new Map(fleetData.records.map(r => [String(r.vin), r]));
        const duplicates: { incoming: VehicleRecord; existing: VehicleRecord }[] = [];
        const newRecords: VehicleRecord[] = [];
        incoming.forEach(r => {
          const vin = String(r.vin);
          if (existingMap.has(vin)) {
            duplicates.push({ incoming: r, existing: existingMap.get(vin)! });
          } else {
            newRecords.push(r);
          }
        });
        return { duplicates, newCount: newRecords.length };
      },

      importData: (incoming, fileName) => {
        const { fleetData } = get();
        const existingVins = new Set(fleetData.records.map(r => String(r.vin)));
        const existingCount = fleetData.records.length;
        const { merged, newColumns } = mergeRecords(fleetData.records, incoming);
        const newCount = merged.length - existingCount;
        const updatedCount = incoming.length - newCount;
        const newVins = incoming
          .map(r => String(r.vin))
          .filter(v => !existingVins.has(v));
        const columns: ColumnDefinition[] = buildColumnDefs(merged);
        const session: ImportSession = {
          id: generateId(),
          fileName,
          importedAt: new Date().toISOString(),
          recordCount: incoming.length,
          newColumns,
        };
        set({
          fleetData: {
            columns,
            records: merged,
            importHistory: [session, ...fleetData.importHistory],
          },
        });
        return { newCount, updatedCount, newColumns, newVins };
      },
      updateVehicle: (vin, changes) => {
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.map(r => r.vin === vin ? { ...r, ...changes } : r),
          },
        }));
      },
      deleteVehicle: (vin) => {
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.filter(r => r.vin !== vin),
          },
        }));
      },
      getVehicle: (vin) => get().fleetData.records.find(r => r.vin === vin),
      setVehicleColor: (vin, color) => set(s => ({
        fleetData: {
          ...s.fleetData,
          records: s.fleetData.records.map(r =>
            r.vin === vin
              ? { ...r, _color: color ?? undefined }
              : r
          ),
        },
      })),

      // ── Manuell Fahrzeug anlegen ───────────────────────────────
      addVehicle: (vehicle) => {
        set(s => {
          const existing = s.fleetData.records.find(r => r.vin === vehicle.vin);
          if (existing) return s; // VIN already exists
          const records = [...s.fleetData.records, vehicle];
          return {
            fleetData: {
              ...s.fleetData,
              columns: buildColumnDefs(records),
              records,
            },
          };
        });
      },

      // ── Soft-Delete: Archivieren ───────────────────────────────
      archiveVehicle: (vin, byUserName) => {
        const now = new Date().toISOString();
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.map(r =>
              r.vin === vin
                ? { ...r, _archived: true, _archivedAt: now, _archivedBy: byUserName }
                : r
            ),
          },
        }));
      },

      archiveMultiple: (vins, byUserName) => {
        const now = new Date().toISOString();
        const vinSet = new Set(vins);
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.map(r =>
              vinSet.has(r.vin)
                ? { ...r, _archived: true, _archivedAt: now, _archivedBy: byUserName }
                : r
            ),
          },
        }));
      },

      // ── Wiederherstellen ──────────────────────────────────────
      restoreVehicle: (vin) => {
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.map(r =>
              r.vin === vin
                ? { ...r, _archived: false, _archivedAt: undefined, _archivedBy: undefined }
                : r
            ),
          },
        }));
      },

      restoreMultiple: (vins) => {
        const vinSet = new Set(vins);
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.map(r =>
              vinSet.has(r.vin)
                ? { ...r, _archived: false, _archivedAt: undefined, _archivedBy: undefined }
                : r
            ),
          },
        }));
      },

      // ── Endgültig löschen (nur aus Archiv) ────────────────────
      permanentlyDelete: (vin) => {
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.filter(r => r.vin !== vin),
          },
        }));
      },

      permanentlyDeleteMultiple: (vins) => {
        const vinSet = new Set(vins);
        set(s => ({
          fleetData: {
            ...s.fleetData,
            records: s.fleetData.records.filter(r => !vinSet.has(r.vin)),
          },
        }));
      },

      // ── Gefilterte Views ──────────────────────────────────────
      getLiveVehicles: () =>
        get().fleetData.records.filter(r => !r._archived),
      getArchivedVehicles: () =>
        get().fleetData.records.filter(r => r._archived === true),
    }),
    { name: 'fleet-data' }
  )
);

// ============================================================
// Documents Store – Metadaten in localStorage, Dateien in IndexedDB
// ============================================================
interface DocsStore {
  documents: VehicleDocument[];
  addDocument: (doc: VehicleDocument) => void;
  deleteDocument: (id: string) => Promise<void>;
  getVehicleDocs: (vin: string) => VehicleDocument[];
}

export const useDocsStore = create<DocsStore>()(
  persist(
    (set, get) => ({
      documents: [] as VehicleDocument[],
      addDocument: (doc) => set(s => ({ documents: [...s.documents, doc] })),
      deleteDocument: async (id) => {
        const doc = get().documents.find(d => d.id === id);
        if (doc) {
          await deleteFile(doc.storageKey).catch(() => {/* ignore IndexedDB errors */});
        }
        set(s => ({ documents: s.documents.filter(d => d.id !== id) }));
      },
      getVehicleDocs: (vin) => get().documents.filter(d => d.vehicleVin === vin),
    }),
    { name: 'fleet-docs' }
  )
);

// ============================================================
// Color Legend Store – Admin verwaltet Farbbedeutungen
// ============================================================

interface ColorLegendStore {
  entries: ColorLegendEntry[];
  setDescription: (color: string, description: string) => void;
}

export const useColorLegendStore = create<ColorLegendStore>()(
  persist(
    (set, get) => ({
      entries: [] as ColorLegendEntry[],
      setDescription: (color, description) => {
        const existing = get().entries.find(e => e.color === color);
        if (existing) {
          set({ entries: get().entries.map(e => e.color === color ? { ...e, description } : e) });
        } else {
          // Farbname aus der Palette ableiten (wird beim ersten Setzen mitgespeichert)
          const LABELS: Record<string, string> = {
            '#ef444420': 'Rot', '#f9731620': 'Orange', '#eab30820': 'Gelb',
            '#22c55e20': 'Grün', '#06b6d420': 'Cyan', '#3b82f620': 'Blau',
            '#8b5cf620': 'Violett', '#ec489920': 'Pink', '#64748b20': 'Grau',
          };
          set({ entries: [...get().entries, { color, label: LABELS[color] ?? color, description }] });
        }
      },
    }),
    { name: 'fleet-color-legend' }
  )
);

// ============================================================
// Column Config Store – Spalten-Sichtbarkeit & Reihenfolge je Benutzer
// ============================================================
interface ColumnConfigStore {
  configs: UserColumnConfig[];
  getConfig: (userId: string) => UserColumnConfig | undefined;
  setConfig: (userId: string, visibleColumns: string[]) => void;
  setDetailFields: (userId: string, visibleDetailFields: string[]) => void;
  deleteConfig: (userId: string) => void;
}

export const useColumnConfigStore = create<ColumnConfigStore>()(
  persist(
    (set, get) => ({
      configs: [] as UserColumnConfig[],
      getConfig: (userId) => get().configs.find(c => c.userId === userId),
      setConfig: (userId, visibleColumns) => {
        const existing = get().configs.find(c => c.userId === userId);
        if (existing) {
          set({ configs: get().configs.map(c => c.userId === userId ? { ...c, visibleColumns } : c) });
        } else {
          set({ configs: [...get().configs, { userId, visibleColumns }] });
        }
      },
      setDetailFields: (userId, visibleDetailFields) => {
        const existing = get().configs.find(c => c.userId === userId);
        if (existing) {
          set({ configs: get().configs.map(c => c.userId === userId ? { ...c, visibleDetailFields } : c) });
        } else {
          set({ configs: [...get().configs, { userId, visibleColumns: [], visibleDetailFields }] });
        }
      },
      deleteConfig: (userId) => {
        set({ configs: get().configs.filter(c => c.userId !== userId) });
      },
    }),
    { name: 'fleet-column-config' }
  )
);

// ============================================================
// Doc Permission Store – Admin legt Dokument-Rechte je Nutzer fest
// ============================================================

interface DocPermStore {
  permissions: UserDocPermission[];
  /** Rechte eines Nutzers abrufen (Fallback: alles erlaubt für Admins/Editoren) */
  getPermission: (userId: string, role: string) => UserDocPermission;
  setPermission: (perm: UserDocPermission) => void;
  resetPermission: (userId: string) => void;
}

const DEFAULT_PERM = (userId: string): UserDocPermission => ({
  userId,
  canUploadPdf: true,
  canUploadImage: true,
  canDeleteDocs: true,
  canViewDocs: true,
  canImport: true,
  canBulkUpload: true,
  canViewDashboard: true,
  canEditDashboard: true,
  canOverrideDashboardLayout: true,
});

export const useDocPermStore = create<DocPermStore>()(
  persist(
    (set, get) => ({
      permissions: [] as UserDocPermission[],
      getPermission: (userId, role) => {
        const saved = get().permissions.find(p => p.userId === userId);
        if (saved) return saved;
        // Admins und Editoren bekommen standardmäßig alles
        if (role === 'admin' || role === 'editor') return DEFAULT_PERM(userId);
        // Betrachter: nur ansehen, kein Upload/Löschen
        return { userId, canUploadPdf: false, canUploadImage: false, canDeleteDocs: false, canViewDocs: true, canImport: false, canBulkUpload: false, canViewDashboard: true, canEditDashboard: false, canOverrideDashboardLayout: false };
      },
      setPermission: (perm) => {
        const existing = get().permissions.find(p => p.userId === perm.userId);
        if (existing) {
          set({ permissions: get().permissions.map(p => p.userId === perm.userId ? perm : p) });
        } else {
          set({ permissions: [...get().permissions, perm] });
        }
      },
      resetPermission: (userId) => {
        set({ permissions: get().permissions.filter(p => p.userId !== userId) });
      },
    }),
    { name: 'fleet-doc-perms' }
  )
);

// ColumnConfigStore um visibleDetailFields erweitern
// (Store ist bereits definiert – wir exportieren eine Hilfsfunktion)
export function getDefaultDetailFields(): string[] { return []; }

// ============================================================
// Vehicle History Store – Automatischer Audit-Log
// ============================================================
interface VehicleHistoryStore {
  entries: VehicleHistoryEntry[];
  addEntry: (entry: Omit<VehicleHistoryEntry, 'id'>) => void;
  getVehicleHistory: (vin: string) => VehicleHistoryEntry[];
  clearVehicleHistory: (vin: string) => void;
}

export const useVehicleHistoryStore = create<VehicleHistoryStore>()(
  persist(
    (set, get) => ({
      entries: [] as VehicleHistoryEntry[],
      addEntry: (entry) => {
        const newEntry: VehicleHistoryEntry = { ...entry, id: generateId() };
        set({ entries: [newEntry, ...get().entries] });
      },
      getVehicleHistory: (vin) =>
        get().entries.filter(e => e.vehicleVin === vin),
      clearVehicleHistory: (vin) =>
        set({ entries: get().entries.filter(e => e.vehicleVin !== vin) }),
    }),
    { name: 'fleet-vehicle-history' }
  )
);

// ============================================================
// Vehicle Notes Store – Bemerkungen je Fahrzeug
// ============================================================
interface VehicleNotesStore {
  notes: VehicleNote[];
  addNote: (note: Omit<VehicleNote, 'id'>) => VehicleNote;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  getVehicleNotes: (vin: string) => VehicleNote[];
}

export const useVehicleNotesStore = create<VehicleNotesStore>()(
  persist(
    (set, get) => ({
      notes: [] as VehicleNote[],
      addNote: (note) => {
        const newNote: VehicleNote = { ...note, id: generateId() };
        set({ notes: [newNote, ...get().notes] });
        return newNote;
      },
      updateNote: (id, text) =>
        set({
          notes: get().notes.map(n =>
            n.id === id ? { ...n, text, editedAt: new Date().toISOString() } : n
          ),
        }),
      deleteNote: (id) =>
        set({ notes: get().notes.filter(n => n.id !== id) }),
      getVehicleNotes: (vin) =>
        get().notes.filter(n => n.vehicleVin === vin),
    }),
    { name: 'fleet-vehicle-notes' }
  )
);

// Suppress unused-import warnings for re-exported types
export type { HistoryEventType, HistoryFieldChange };

// ============================================================
// Vehicle Access Store – Fahrzeugzugang je Benutzer
// ============================================================
interface VehicleAccessStore {
  configs: UserVehicleAccess[];
  /** Setzt Modus + erlaubte VINs für einen Benutzer */
  setAccess: (userId: string, mode: 'all' | 'restricted', allowedVins: string[]) => void;
  /** Gibt die Zugangs-Konfiguration eines Benutzers zurück */
  getAccess: (userId: string) => UserVehicleAccess;
  /** Prüft, ob ein Benutzer ein bestimmtes Fahrzeug sehen darf */
  canSeeVehicle: (userId: string, role: string, vin: string) => boolean;
}

const DEFAULT_ACCESS: UserVehicleAccess = { userId: '', mode: 'all', allowedVins: [] };

export const useVehicleAccessStore = create<VehicleAccessStore>()(
  persist(
    (set, get) => ({
      configs: [] as UserVehicleAccess[],
      setAccess: (userId, mode, allowedVins) => {
        set(state => {
          const existing = state.configs.findIndex(c => c.userId === userId);
          const updated = [...state.configs];
          if (existing >= 0) updated[existing] = { userId, mode, allowedVins };
          else updated.push({ userId, mode, allowedVins });
          return { configs: updated };
        });
      },
      getAccess: (userId) =>
        get().configs.find(c => c.userId === userId) ?? { ...DEFAULT_ACCESS, userId },
      canSeeVehicle: (userId, role, vin) => {
        if (role === 'admin') return true;
        const cfg = get().configs.find(c => c.userId === userId);
        if (!cfg || cfg.mode === 'all') return true;
        return cfg.allowedVins.includes(vin);
      },
    }),
    { name: 'fleet-vehicle-access' }
  )
);

// ============================================================
// User Group Store – Benutzergruppen mit Berechtigungen
// ============================================================
const DEFAULT_GROUP_DOC_PERM: GroupDocPermissions = {
  canUploadPdf: true, canUploadImage: true, canDeleteDocs: false, canViewDocs: true, canImport: true, canBulkUpload: true,
};
const DEFAULT_GROUP_VEHICLE_ACCESS: GroupVehicleAccess = { mode: 'all', allowedVins: [] };
const DEFAULT_GROUP_COLUMN_SETTINGS: GroupColumnSettings = { visibleColumns: [], visibleDetailFields: [] };

interface UserGroupStore {
  groups: UserGroup[];
  addGroup: (data: Omit<UserGroup, 'id'>) => UserGroup;
  updateGroup: (id: string, data: Partial<Omit<UserGroup, 'id'>>) => void;
  deleteGroup: (id: string) => void;
  getGroup: (id: string) => UserGroup | undefined;
}

export const useUserGroupStore = create<UserGroupStore>()(
  persist(
    (set, get) => ({
      groups: [] as UserGroup[],
      addGroup: (data) => {
        const group: UserGroup = { ...data, id: generateId() };
        set(s => ({ groups: [...s.groups, group] }));
        return group;
      },
      updateGroup: (id, data) =>
        set(s => ({ groups: s.groups.map(g => g.id === id ? { ...g, ...data } : g) })),
      deleteGroup: (id) =>
        set(s => ({ groups: s.groups.filter(g => g.id !== id) })),
      getGroup: (id) => get().groups.find(g => g.id === id),
    }),
    { name: 'fleet-user-groups' }
  )
);

// Suppress unused-import warnings
export type { GroupDocPermissions, GroupVehicleAccess, GroupColumnSettings };

// ============================================================
// Custom Columns & Label-Overrides Store
// ============================================================
interface CustomColumnsStore {
  /** Admin-definierte Zusatzspalten */
  columns: CustomColumn[];
  /** Überschreibungen für bestehende Spaltentitel */
  labelOverrides: ColumnLabelOverrides;

  addColumn: (label: string, description?: string) => CustomColumn;
  updateColumn: (id: string, changes: Partial<Pick<CustomColumn, 'label' | 'description'>>) => void;
  deleteColumn: (id: string) => void;

  setLabelOverride: (key: string, label: string) => void;
  removeLabelOverride: (key: string) => void;
  getLabel: (key: string, fallback: string) => string;
}

export const useCustomColumnsStore = create<CustomColumnsStore>()(
  persist(
    (set, get) => ({
      columns: [] as CustomColumn[],
      labelOverrides: {} as ColumnLabelOverrides,

      addColumn: (label, description) => {
        const col: CustomColumn = {
          id: `_custom_${generateId()}`,
          label: label.trim(),
          description,
          createdAt: new Date().toISOString(),
        };
        set(s => ({ columns: [...s.columns, col] }));
        return col;
      },
      updateColumn: (id, changes) =>
        set(s => ({ columns: s.columns.map(c => c.id === id ? { ...c, ...changes } : c) })),
      deleteColumn: (id) =>
        set(s => ({ columns: s.columns.filter(c => c.id !== id) })),

      setLabelOverride: (key, label) =>
        set(s => ({ labelOverrides: { ...s.labelOverrides, [key]: label.trim() } })),
      removeLabelOverride: (key) =>
        set(s => {
          const next = { ...s.labelOverrides };
          delete next[key];
          return { labelOverrides: next };
        }),
      getLabel: (key, fallback) => get().labelOverrides[key] ?? fallback,
    }),
    { name: 'fleet-custom-columns' }
  )
);

// Suppress unused-import warnings
export type { CustomColumn, ColumnLabelOverrides };

// ============================================================
// Backup Store – verwaltet die Snapshot-Liste reaktiv
// ============================================================
import {
  listBackups, createBackup as _createBackup, restoreBackup as _restoreBackup,
  deleteBackup as _deleteBackup, downloadBackupFile as _downloadBackupFile,
  shouldAutoBackup, MAX_SNAPSHOTS,
} from '@/lib/backupManager';
import type { BackupSnapshot } from '@/lib/backupManager';

export type { BackupSnapshot };

interface BackupStoreState {
  snapshots: BackupSnapshot[];
  isCreating: boolean;
  isRestoring: boolean;

  refresh: () => void;
  createManual: (label: string) => Promise<void>;
  triggerAutoBackup: () => Promise<void>;
  restore: (id: string) => Promise<void>;
  remove: (id: string) => void;
  download: (id: string) => void;
}

export const useBackupStore = create<BackupStoreState>()((set, get) => ({
  snapshots: listBackups(),
  isCreating: false,
  isRestoring: false,

  refresh: () => set({ snapshots: listBackups() }),

  createManual: async (label: string) => {
    set({ isCreating: true });
    try {
      const updated = await _createBackup(label || 'Manuelles Backup', false);
      set({ snapshots: updated, isCreating: false });
    } catch (e) {
      console.error('[Backup] Fehler beim Erstellen:', e);
      set({ isCreating: false });
    }
  },

  triggerAutoBackup: async () => {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    if (!shouldAutoBackup(FOUR_HOURS)) return;
    try {
      const updated = await _createBackup('Auto-Backup', true);
      set({ snapshots: updated });
      console.info('[Backup] Auto-Backup erstellt:', updated[0]?.createdAt);
    } catch (e) {
      console.error('[Backup] Auto-Backup fehlgeschlagen:', e);
    }
  },

  restore: async (id: string) => {
    set({ isRestoring: true });
    await _restoreBackup(id); // löst page reload aus
  },

  remove: (id: string) => {
    const updated = _deleteBackup(id);
    set({ snapshots: updated });
  },

  download: (id: string) => _downloadBackupFile(id),
}));

// ============================================================
// Rollen-Store
// ============================================================
export type { CustomRole, BuiltinRole };

interface RolesStore {
  roles: CustomRole[];
  addRole: (r: Omit<CustomRole, 'id' | 'createdAt'>) => CustomRole;
  updateRole: (id: string, changes: Partial<Omit<CustomRole, 'id' | 'createdAt'>>) => void;
  deleteRole: (id: string) => void;
  getRole: (id: string) => CustomRole | undefined;
}

export const useRolesStore = create<RolesStore>()(
  persist(
    (set, get) => ({
      roles: [] as CustomRole[],

      addRole: (r) => {
        const newRole: CustomRole = {
          ...r,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        set({ roles: [...get().roles, newRole] });
        return newRole;
      },

      updateRole: (id, changes) => {
        set({ roles: get().roles.map(r => r.id === id ? { ...r, ...changes } : r) });
      },

      deleteRole: (id) => {
        set({ roles: get().roles.filter(r => r.id !== id) });
      },

      getRole: (id) => get().roles.find(r => r.id === id),
    }),
    { name: 'fleet-roles' }
  )
);

// ============================================================
// Vehicle Mail Store
// ============================================================
interface VehicleMailStore {
  mails: VehicleMail[];
  addMail: (mail: Omit<VehicleMail, 'id'>) => VehicleMail;
  markRead: (id: string) => void;
  markAllRead: (vin: string) => void;
  deleteMail: (id: string) => void;
  getMailsForVin: (vin: string) => VehicleMail[];
  getUnreadCount: (vin: string) => number;
  hasUnread: (vin: string) => boolean;
}

export const useVehicleMailStore = create<VehicleMailStore>()(
  persist(
    (set, get) => ({
      mails: [] as VehicleMail[],
      addMail: (mail) => {
        const newMail: VehicleMail = { ...mail, id: generateId() };
        set({ mails: [...get().mails, newMail] });
        return newMail;
      },
      markRead: (id) => {
        set({ mails: get().mails.map(m => m.id === id ? { ...m, read: true } : m) });
      },
      markAllRead: (vin) => {
        set({ mails: get().mails.map(m => m.vin === vin ? { ...m, read: true } : m) });
      },
      deleteMail: (id) => {
        set({ mails: get().mails.filter(m => m.id !== id) });
      },
      getMailsForVin: (vin) => get().mails.filter(m => m.vin === vin),
      getUnreadCount: (vin) => get().mails.filter(m => m.vin === vin && m.direction === 'in' && !m.read).length,
      hasUnread: (vin) => get().mails.some(m => m.vin === vin && m.direction === 'in' && !m.read),
    }),
    { name: 'fleet-vehicle-mails' }
  )
);

// ============================================================
// Dashboard Layout Store – Admin legt Standard-Layout je Nutzer fest
// ============================================================
export interface DashboardWidget {
  id: string;
  type: 'kpi_count'|'kpi_sum'|'kpi_avg'|'pie'|'bar_count'|'bar_sum'|'line_values';
  colKey: string;
  title?: string;
}
interface DashboardLayoutStore {
  adminLayouts: Record<string, DashboardWidget[]>; // userId → widgets
  globalLayout: DashboardWidget[];                 // gilt für alle die kein eigenes haben
  setAdminLayout: (userId: string, widgets: DashboardWidget[]) => void;
  setGlobalLayout: (widgets: DashboardWidget[]) => void;
  getLayoutForUser: (userId: string) => DashboardWidget[] | null;
}
export const useDashboardLayoutStore = create<DashboardLayoutStore>()(
  persist(
    (set, get) => ({
      adminLayouts: {} as Record<string, DashboardWidget[]>,
      globalLayout: [] as DashboardWidget[],
      setAdminLayout: (userId, widgets) =>
        set({ adminLayouts: { ...get().adminLayouts, [userId]: widgets } }),
      setGlobalLayout: (widgets) => set({ globalLayout: widgets }),
      getLayoutForUser: (userId) => {
        const { adminLayouts, globalLayout } = get();
        if (adminLayouts[userId]) return adminLayouts[userId];
        if (globalLayout.length > 0) return globalLayout;
        return null;
      },
    }),
    { name: 'fleet-dashboard-layouts' }
  )
);
