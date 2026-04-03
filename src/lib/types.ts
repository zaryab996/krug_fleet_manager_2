// ============================================================
// Types für das Fahrzeugflotten-Verwaltungssystem
// ============================================================

/** Eingebaute Rollen */
export type BuiltinRole = 'admin' | 'editor' | 'viewer';
/** Alle Rollen: eingebaut + benutzerdefinierte (gespeichert als ID-String) */
export type UserRole = BuiltinRole | string;

/** Benutzerdefinierte Rolle */
export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  /** Basisrolle für Standard-Berechtigungen */
  basedOn: BuiltinRole;
  color: string;   // Tailwind-Farbklasse z.B. "bg-purple-100 text-purple-700"
  createdAt: string;
}

export interface User {
  /** Optionale Zugehörigkeit zu einer Benutzergruppe */
  groupId?: string;
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  passwordHash: string; // simple hash for demo
}

export interface VehicleRecord {
  vin: string;
  /** Optionale Farbmarkierung (CSS-Hex oder benannte Farbe) */
  _color?: string;
  /** Archiv-Felder (soft-delete) */
  _archived?: boolean;
  _archivedAt?: string;
  _archivedBy?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
}

export interface ImportSession {
  id: string;
  fileName: string;
  importedAt: string;
  recordCount: number;
  newColumns: string[];
}

export interface FleetData {
  columns: ColumnDefinition[];
  records: VehicleRecord[];
  importHistory: ImportSession[];
}

export type DocumentFileType = 'pdf' | 'image';

export interface VehicleDocument {
  id: string;
  vehicleVin: string;
  /** Vom Benutzer vergebener Name/Bezeichnung */
  label: string;
  /** Originaler Dateiname */
  originalFileName: string;
  fileType: DocumentFileType;
  mimeType: string;
  /** Dateigröße in Bytes */
  size: number;
  uploadedAt: string;
  /** Schlüssel für IndexedDB-Abfrage (= id) */
  storageKey: string;
}

export interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
}

export interface AppState {
  auth: AuthState;
  users: User[];
  fleetData: FleetData;
  searchQuery: string;
  activeFilters: Record<string, string>;
}

// ─── Farblegende ───────────────────────────────────────────────────────
export interface ColorLegendEntry {
  /** CSS-Hex+Alpha wie '#ef444420' – identisch mit _color-Wert */
  color: string;
  /** Farbname z. B. 'Rot' */
  label: string;
  /** Benutzer-Beschreibung z. B. 'Fahrzeuge in Reparatur' */
  description: string;
}

// ─── Spalten-Konfiguration je Benutzer ────────────────────────────────
export interface UserColumnConfig {
  userId: string;
  /** Geordnete Liste der sichtbaren Spaltenschlüssel in der Listenansicht */
  visibleColumns: string[];
  /** Sichtbare Datenfelder in der Fahrzeugdetail-Ansicht (leer = alle) */
  visibleDetailFields?: string[];
}

// ─── Dokument-Rechte je Benutzer ──────────────────────────────────────
export interface UserDocPermission {
  userId: string;
  /** Darf PDFs hochladen */
  canUploadPdf: boolean;
  /** Darf Bilder/Fotos hochladen */
  canUploadImage: boolean;
  /** Darf Dokumente löschen */
  canDeleteDocs: boolean;
  /** Darf Dokumente herunterladen / ansehen */
  canViewDocs: boolean;
  /** Darf Dateien via CSV/Import importieren */
  canImport: boolean;
  /** Darf Massenupload (FolderUpload) nutzen */
  canBulkUpload: boolean;
  /** Dashboard: sichtbar */
  canViewDashboard: boolean;
  /** Dashboard: eigenes Layout ändern */
  canEditDashboard: boolean;
  /** Dashboard: vorgegebenes Admin-Layout überschreiben */
  canOverrideDashboardLayout: boolean;
}

// ─── Fahrzeug-Verlauf (Audit-Log) ─────────────────────────────────────
export type HistoryEventType =
  | 'field_change'      // Datenfeld geändert
  | 'document_upload'   // Dokument hochgeladen
  | 'document_delete'   // Dokument gelöscht
  | 'color_change'      // Farbmarkierung gesetzt/geändert
  | 'note'              // Bemerkung hinzugefügt
  | 'note_edit'         // Bemerkung bearbeitet
  | 'note_delete'       // Bemerkung gelöscht
  | 'bulk_upload'       // Massenupload (FolderUpload)
  | 'vehicle_created';  // Fahrzeug neu angelegt (Import)

export interface HistoryFieldChange {
  field: string;
  label?: string;       // Lesbarer Spaltenname
  oldValue: string;
  newValue: string;
}

export interface VehicleHistoryEntry {
  id: string;
  vehicleVin: string;
  type: HistoryEventType;
  timestamp: string;          // ISO-String
  userId: string;
  userName: string;
  /** Bei field_change: Liste der geänderten Felder */
  changes?: HistoryFieldChange[];
  /** Bei document_upload / document_delete: Dateiname */
  documentLabel?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentSize?: number;
  /** Bei color_change: neuer Farbname */
  colorLabel?: string;
  /** Bei note / note_edit / note_delete: Bemerkungstext */
  noteText?: string;
  noteOldText?: string;        // Bei note_edit: alter Text
  noteId?: string;
  /** Bei bulk_upload: Anzahl importierter Dateien */
  bulkFileCount?: number;
  bulkFileNames?: string[];    // Dateinamen (max. 20)
  /** Bei vehicle_created: Import-Session-Info */
  importSource?: string;
}

// ─── Fahrzeug-Bemerkungen ─────────────────────────────────────────────
export interface VehicleNote {
  id: string;
  vehicleVin: string;
  timestamp: string;       // ISO-String Erstellungsdatum
  editedAt?: string;       // ISO-String letztes Edit
  userId: string;
  userName: string;
  text: string;
}

// ─── Fahrzeugzugang je Benutzer ───────────────────────────────────────
export interface UserVehicleAccess {
  userId: string;
  /** 'all' = alle Fahrzeuge sichtbar (Standard), 'restricted' = nur allowedVins */
  mode: 'all' | 'restricted';
  allowedVins: string[];
}

// ─── Benutzergruppen ──────────────────────────────────────────────────
export interface GroupDocPermissions {
  canUploadPdf: boolean;
  canUploadImage: boolean;
  canDeleteDocs: boolean;
  canViewDocs: boolean;
  canImport: boolean;
  canBulkUpload: boolean;
  canViewDashboard?: boolean;
  canEditDashboard?: boolean;
  canOverrideDashboardLayout?: boolean;
}

export interface GroupVehicleAccess {
  mode: 'all' | 'restricted';
  allowedVins: string[];
}

export interface GroupColumnSettings {
  /** Sichtbare Spalten in der Listenansicht (leer = alle) */
  visibleColumns: string[];
  /** Sichtbare Felder in der Detailansicht (leer = alle) */
  visibleDetailFields: string[];
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;              // Hex-Farbe für die Anzeige
  docPermissions: GroupDocPermissions;
  vehicleAccess: GroupVehicleAccess;
  columnSettings: GroupColumnSettings;
}

// ─── Benutzerdefinierte Spalten & Label-Überschreibungen ──────────────
export interface CustomColumn {
  id: string;           // interner Schlüssel (z. B. "_custom_abc123")
  label: string;        // angezeigter Name
  createdAt: string;    // ISO-Datum
  description?: string; // optionale Erklärung
}

/** Überschreibt den Anzeigetext einer beliebigen Spalte (key → eigener Label) */
export type ColumnLabelOverrides = Record<string, string>;

// ─── Fahrzeug-E-Mail ───────────────────────────────────────────────────
export interface VehicleMail {
  id: string;
  vin: string;
  /** 'in' = empfangen, 'out' = gesendet */
  direction: 'in' | 'out';
  from: string;
  to: string;
  subject: string;
  body: string;
  /** ISO-Timestamp */
  date: string;
  /** false = noch nicht gelesen (nur bei direction='in') */
  read: boolean;
}
