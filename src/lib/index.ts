// ============================================================
// Routen-Konstanten
// ============================================================
export const ROUTE_PATHS = {
  HOME: '/',
  LOGIN: '/login',
  VEHICLES: '/vehicles',
  VEHICLE_DETAIL: '/vehicles/:vin',
  ADMIN: '/admin',
  IMPORT: '/import',
  FOLDER_UPLOAD: '/folder-upload',
  DASHBOARD: '/dashboard',
} as const;

// ============================================================
// Hilfsfunktionen
// ============================================================
import type { User, VehicleRecord, ColumnDefinition } from './types';

/** Simpler deterministischer Hash (kein echtes Krypto – nur Demo) */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return String(Math.abs(hash));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return dateStr;
}

/** Parst einen Währungsstring (de/en Format) in eine Zahl. Gibt NaN zurück wenn nicht parsebar. */
export function parseCurrencyValue(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  const raw = val.trim().replace(/[€$£¥\s]/g, '');
  if (raw === '') return NaN;
  const lastComma = raw.lastIndexOf(',');
  const lastDot   = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }
  return parseFloat(normalized);
}

export function formatCurrency(val: string | number | null | undefined): string {
  const num = parseCurrencyValue(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function detectColumnType(values: (string | null | undefined)[]): 'text' | 'number' | 'date' {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'text';
  const datePattern = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
  const numberPattern = /^-?\d+([.,]\d+)?$/;
  const dateCount = nonEmpty.filter(v => datePattern.test(String(v))).length;
  const numberCount = nonEmpty.filter(v => numberPattern.test(String(v))).length;
  if (dateCount / nonEmpty.length > 0.6) return 'date';
  if (numberCount / nonEmpty.length > 0.6) return 'number';
  return 'text';
}

export function buildColumnDefs(records: VehicleRecord[]): ColumnDefinition[] {
  const allKeys = new Set<string>();
  records.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
  return Array.from(allKeys).map(key => ({
    key,
    label: key,
    type: key === 'vin' ? 'text' : detectColumnType(records.map(r => String(r[key] ?? ''))),
  }));
}

/** Filtert Records nach Suchbegriff (durchsucht alle Felder) */
export function filterRecords(
  records: VehicleRecord[],
  query: string,
  filters: Record<string, string>
): VehicleRecord[] {
  let result = records;
  if (query.trim()) {
    const q = query.toLowerCase();
    result = result.filter(r =>
      Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }
  Object.entries(filters).forEach(([key, val]) => {
    if (val && val !== '__all__') {
      result = result.filter(r => String(r[key] ?? '').toLowerCase().includes(val.toLowerCase()));
    }
  });
  return result;
}

/** Mergt eine neue Liste in bestehende Records (VIN-basiert) */
export function mergeRecords(
  existing: VehicleRecord[],
  incoming: VehicleRecord[]
): { merged: VehicleRecord[]; newColumns: string[] } {
  const map = new Map<string, VehicleRecord>();
  existing.forEach(r => map.set(r.vin, { ...r }));

  const existingKeys = existing.length > 0 ? Object.keys(existing[0]) : [];
  const newColumnSet = new Set<string>();

  incoming.forEach(r => {
    const existing = map.get(r.vin) ?? { vin: r.vin };
    const merged = { ...existing };
    Object.entries(r).forEach(([k, v]) => {
      if (!(k in merged) || merged[k] === null || merged[k] === '') {
        merged[k] = v;
        if (!existingKeys.includes(k) && k !== 'vin') newColumnSet.add(k);
      }
    });
    map.set(r.vin, merged);
  });

  // Neue VINs hinzufügen
  incoming.forEach(r => {
    if (!map.has(r.vin)) {
      map.set(r.vin, { ...r });
      Object.keys(r).forEach(k => { if (!existingKeys.includes(k) && k !== 'vin') newColumnSet.add(k); });
    }
  });

  return { merged: Array.from(map.values()), newColumns: Array.from(newColumnSet) };
}

/** Erzeugt unveränderliche Vordefinitionen für Admins und Testdaten */
export function getDefaultUsers(): User[] {
  return [
    {
      id: 'admin-1',
      email: 'admin@fleetmanager.de',
      name: 'Administrator',
      role: 'admin',
      createdAt: new Date().toISOString(),
      passwordHash: simpleHash('Admin2026!'),
    },
    {
      id: 'admin-ck',
      email: 'christian.krug@gutachter-krug.de',
      name: 'Christian Krug',
      role: 'admin',
      createdAt: new Date().toISOString(),
      passwordHash: simpleHash('Hauptstrasse441'),
    },
    // ── KSM – Betrachter ──────────────────────────────────────────
    { id: 'ksm-1', email: 'ksm.user1@fleet.local', name: 'ksm.user1', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('KSM#4831zQa') },
    { id: 'ksm-2', email: 'ksm.user2@fleet.local', name: 'ksm.user2', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('KSM#9921tYu') },
    { id: 'ksm-3', email: 'ksm.user3@fleet.local', name: 'ksm.user3', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('KSM#6617pLo') },
    { id: 'ksm-4', email: 'ksm.user4@fleet.local', name: 'ksm.user4', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('KSM#2048wEr') },
    { id: 'ksm-5', email: 'ksm.user5@fleet.local', name: 'ksm.user5', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('KSM#7782xCv') },
    // ── Mosolf – Betrachter ───────────────────────────────────────
    { id: 'msf-1', email: 'mosolf.user1@fleet.local', name: 'mosolf.user1', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('MSL!6732aSd') },
    { id: 'msf-2', email: 'mosolf.user2@fleet.local', name: 'mosolf.user2', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('MSL!1189qWe') },
    { id: 'msf-3', email: 'mosolf.user3@fleet.local', name: 'mosolf.user3', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('MSL!5521zXc') },
    { id: 'msf-4', email: 'mosolf.user4@fleet.local', name: 'mosolf.user4', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('MSL!9904rTy') },
    { id: 'msf-5', email: 'mosolf.user5@fleet.local', name: 'mosolf.user5', role: 'viewer', createdAt: new Date().toISOString(), passwordHash: simpleHash('MSL!3478uIo') },
    // ── Krug – Admins & Bearbeiter ────────────────────────────────
    { id: 'krg-a1', email: 'krug.admin1@fleet.local', name: 'krug.admin1', role: 'admin',  createdAt: new Date().toISOString(), passwordHash: simpleHash('Krg@Admin771') },
    { id: 'krg-a2', email: 'krug.admin2@fleet.local', name: 'krug.admin2', role: 'admin',  createdAt: new Date().toISOString(), passwordHash: simpleHash('Krg@Admin552') },
    { id: 'krg-b1', email: 'krug.bearb1@fleet.local', name: 'krug.bearb1', role: 'editor', createdAt: new Date().toISOString(), passwordHash: simpleHash('Krg@Edit339') },
    { id: 'krg-b2', email: 'krug.bearb2@fleet.local', name: 'krug.bearb2', role: 'editor', createdAt: new Date().toISOString(), passwordHash: simpleHash('Krg@Edit884') },
  ];
}
