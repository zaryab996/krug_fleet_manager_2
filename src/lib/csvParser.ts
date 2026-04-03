import Papa from 'papaparse';
import type { VehicleRecord } from '@/lib/types';

/**
 * Spalten-Mapping: Externe Spaltennamen werden auf interne Namen normiert.
 * Groß-/Kleinschreibung sowie führende/nachfolgende Leerzeichen werden ignoriert.
 *
 * Beispiel: "Net damage amount" → "Reparaturkosten netto"
 */
const COLUMN_ALIASES: Record<string, string> = {
  'net damage amount':      'Reparaturkosten netto',
  'net repair cost':        'Reparaturkosten netto',
  'repair cost net':        'Reparaturkosten netto',
  'reparaturkosten netto':  'Reparaturkosten netto',
  'wbwert netto':           'WBWert netto',
  'wb value net':           'WBWert netto',
  'vehicle identification number': 'vin',
  'vehicle id':             'vin',
};

/** Normiert einen Spaltennamen anhand des Alias-Mappings */
function normalizeColumnName(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return COLUMN_ALIASES[lower] ?? trimmed;
}

/**
 * Liest eine CSV- oder Excel-Datei und gibt VehicleRecords zurück.
 * Unterstützt zwei Formate:
 *  1. "Normal": Erste Zeile = Spaltenüberschriften, folgende Zeilen = Datensätze
 *  2. "Spalten-Format": Erste Spalte enthält Feldnamen, folgende Spalten sind je ein Fahrzeug (identifiziert durch VIN in Zeile 1)
 */
export function parseFile(file: File): Promise<VehicleRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const result = Papa.parse<string[]>(text, {
          skipEmptyLines: true,
          delimiter: '',   // Auto-detect
        });
        const rows: string[][] = result.data as string[][];
        if (rows.length < 2) { resolve([]); return; }

        // Erkenne Format: Wenn erste Zelle "VIN" ist → normales Zeilenformat
        // Wenn erste Spalte VIN-artige Werte enthält → Spaltenformat
        const firstRow = rows[0];
        const firstCell = (firstRow[0] ?? '').trim().toUpperCase();

        if (firstCell === 'VIN') {
          // --- Normales Zeilenformat ---
          const headers = firstRow.map(h => normalizeColumnName(h));
          const records: VehicleRecord[] = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const record: VehicleRecord = { vin: '' };
            headers.forEach((h, idx) => {
              const key = h.toLowerCase() === 'vin' ? 'vin' : h;
              const val = (row[idx] ?? '').trim();
              record[key] = val;
            });
            // Ensure vin is lowercase key
            if (record['VIN']) { record.vin = String(record['VIN']); delete record['VIN']; }
            if (record.vin) records.push(record);
          }
          resolve(records);
          return;
        }

        // --- Spaltenformat: Erste Zeile enthält Feldnamen, 2+ Spalten = Fahrzeuge ---
        // Prüfe ob das aussieht wie ein Spaltenformat (erste Spalte = Feldname, erste Werte-Spalte = VIN)
        // Suche VIN-Zeile
        const vinRowIdx = rows.findIndex(row => row[0]?.trim().toUpperCase() === 'VIN');

        if (vinRowIdx >= 0) {
          // Spaltenformat: Zeile mit "VIN" als Feldname
          const records: VehicleRecord[] = [];
          const colCount = Math.max(...rows.map(r => r.length));
          for (let col = 1; col < colCount; col++) {
            const record: VehicleRecord = { vin: '' };
            rows.forEach(row => {
              const rawField = (row[0] ?? '').trim();
              if (!rawField) return;
              const fieldName = normalizeColumnName(rawField);
              const val = (row[col] ?? '').trim();
              const key = fieldName.toUpperCase() === 'VIN' ? 'vin' : fieldName;
              record[key] = val;
            });
            if (record.vin) records.push(record);
          }
          resolve(records);
          return;
        }

        // Fallback: Normales Zeilenformat ohne expliziten VIN-Header
        const headers = firstRow.map(h => normalizeColumnName(h));
        const vinIdx = headers.findIndex(h => h.toUpperCase() === 'VIN');
        const records: VehicleRecord[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const record: VehicleRecord = { vin: '' };
          headers.forEach((h, idx) => {
            const key = h.toUpperCase() === 'VIN' ? 'vin' : h;
            record[key] = (row[idx] ?? '').trim();
          });
          if (vinIdx >= 0) record.vin = (row[vinIdx] ?? '').trim();
          if (record.vin) records.push(record);
        }
        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

/** Exportiert Records als CSV-Download (optionale Spaltenreihenfolge) */
export function exportToCSV(
  records: VehicleRecord[],
  filename = 'fahrzeugdaten.csv',
  columnOrder?: string[]
): void {
  if (records.length === 0) return;
  const headers = columnOrder ?? Object.keys(records[0]);
  const csv = Papa.unparse({ fields: headers, data: records.map(r => headers.map(h => r[h] ?? '')) });
  // data:-URL statt blob:-URL – funktioniert auch in sandboxed Frames
  const base64 = btoa(unescape(encodeURIComponent('\uFEFF' + csv)));
  const a = document.createElement('a');
  a.href = `data:text/csv;charset=utf-8;base64,${base64}`;
  a.download = filename;
  a.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}
