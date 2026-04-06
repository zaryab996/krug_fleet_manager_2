/**
 * Download-Utilities für Fahrzeugakten
 *
 * "Akten herunterladen" erzeugt:
 *   Fahrzeugakten_N_<datum>.zip
 *   ├── Fahrzeugübersicht.xlsx   ← alle Fahrzeugdaten wie Übersicht + Dokumente-Spalte
 *   └── Dokumente/
 *       └── <VIN>/
 *           ├── Schadensbericht.pdf
 *           └── Frontansicht.jpg
 */

import * as XLSX from 'xlsx';
import JSZip    from 'jszip';
import { loadFile, formatFileSize } from '@/lib/fileStorage';
import type { VehicleRecord, VehicleDocument } from '@/lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function triggerDownload(base64: string, mimeType: string, filename: string) {
  const a = document.createElement('a');
  a.href = `data:${mimeType};base64,${base64}`;
  a.download = filename;
  a.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 600);
}

function safe(s: string) {
  return String(s).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80);
}

// ─── Excel-Workbook ───────────────────────────────────────────────────────────

function buildExcel(vehicles: VehicleRecord[], allDocs: VehicleDocument[]): Uint8Array {
  // Alle Spalten (ohne _-Felder)
  const colSet = new Set<string>();
  vehicles.forEach(v =>
    Object.keys(v)
      .filter(k => !k.startsWith('_'))
      .forEach(k => colSet.add(k))
  );
  const cols = Array.from(colSet);

  // Header
  const header = [...cols, 'Dokumente (Pfad im ZIP)'];

  // Zeilen
  const rows = vehicles.map(v => {
    const vin  = String(v.vin ?? '');
    const docs = allDocs.filter(d => d.vehicleVin === vin);

    const cells = cols.map(c => {
      const val = v[c];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'Ja' : 'Nein';
      return val;               // string | number → direkt übergeben
    });

    const docPaths = docs.length === 0
      ? 'Keine Dokumente'
      : docs.map(d => {
          const ext = d.originalFileName.split('.').pop() ?? 'bin';
          return `Dokumente/${vin}/${safe(d.label)}.${ext}`;
        }).join('\n');

    return [...cells, docPaths];
  });

  // Sheet + Workbook
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Spaltenbreiten
  ws['!cols'] = [
    ...cols.map(c => ({ wch: Math.min(40, Math.max(10, c.length + 2)) })),
    { wch: 55 },  // Dokumente-Spalte
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fahrzeugübersicht');

  // Als Uint8Array ausgeben (funktioniert mit JSZip)
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
}

// ─── Mehrere Fahrzeuge (Bulk) ─────────────────────────────────────────────────

export async function downloadMultipleAkten(
  vehicles: VehicleRecord[],
  allDocs: VehicleDocument[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (vehicles.length === 0) return;

  const zip = new JSZip();

  // 1. Dokumente einsammeln
  let fileCount = 0;
  for (let i = 0; i < vehicles.length; i++) {
    const vin      = String(vehicles[i].vin ?? 'UNBEKANNT');
    const vinDocs  = allDocs.filter(d => d.vehicleVin === vin);

    for (const doc of vinDocs) {
      try {
        const buf = await loadFile(doc.storageKey);
        if (buf) {
          const ext  = doc.originalFileName.split('.').pop() ?? 'bin';
          const name = `${safe(doc.label)}.${ext}`;
          zip.file(`Dokumente/${vin}/${name}`, buf);
          fileCount++;
        }
      } catch { /* Datei nicht verfügbar – überspringen */ }
    }

    onProgress?.(i + 1, vehicles.length);
  }

  // 2. Excel-Übersicht
  const xlsxBytes = buildExcel(vehicles, allDocs);
  zip.file('Fahrzeugübersicht.xlsx', xlsxBytes);

  // 3. README
  const dateStr = new Date().toLocaleString('de-DE');
  zip.file('README.txt', [
    '═══════════════════════════════════════════════',
    '  Krug Fleet Manager – Fahrzeugakten Export',
    '═══════════════════════════════════════════════',
    `  Erstellt am : ${dateStr}`,
    `  Fahrzeuge   : ${vehicles.length}`,
    `  Dokumente   : ${fileCount}`,
    '',
    'INHALT:',
    '  Fahrzeugübersicht.xlsx',
    '    → Alle Fahrzeugdaten wie in der Übersicht.',
    '    → Letzte Spalte "Dokumente" zeigt den Pfad',
    '      zur jeweiligen Datei im Ordner Dokumente/.',
    '',
    '  Dokumente/<VIN>/<Dateiname>',
    '    → PDFs und Bilder je Fahrzeug.',
    '',
    'TIPP: ZIP entpacken → Excel öffnen → Pfad in',
    '      der Dokumente-Spalte im Datei-Explorer öffnen.',
    '═══════════════════════════════════════════════',
  ].join('\r\n'));

  // 4. Download
  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const ts = new Date().toISOString().slice(0, 10);
  triggerDownload(
    base64,
    'application/zip',
    `Fahrzeugakten_${vehicles.length}_Fahrzeuge_${ts}.zip`
  );
}

// ─── Einzelfahrzeug (für VehicleDetail) ──────────────────────────────────────

export async function downloadSingleAkte(
  vehicle: VehicleRecord,
  docs: VehicleDocument[]
): Promise<void> {
  const vin = String(vehicle.vin ?? 'UNBEKANNT');
  const zip = new JSZip();

  // Dokumente
  for (const doc of docs) {
    try {
      const buf = await loadFile(doc.storageKey);
      if (buf) {
        const ext  = doc.originalFileName.split('.').pop() ?? 'bin';
        const name = `${safe(doc.label)}.${ext}`;
        zip.file(`Dokumente/${name}`, buf);
      }
    } catch { /* überspringen */ }
  }

  // Excel
  const xlsxBytes = buildExcel([vehicle], docs);
  zip.file('Fahrzeugdaten.xlsx', xlsxBytes);

  // README
  const dateStr = new Date().toLocaleString('de-DE');
  zip.file('README.txt', [
    `Fahrzeugakte: ${String(vehicle['Hersteller'] ?? '')} ${String(vehicle['Haupttyp'] ?? '')}`,
    `VIN         : ${vin}`,
    `Erstellt am : ${dateStr}`,
    '',
    `Dokumente: ${docs.length}`,
    ...docs.map(d =>
      `  [${d.fileType.toUpperCase()}] ${d.label} → ${d.originalFileName} (${formatFileSize(d.size)})`
    ),
  ].join('\r\n'));

  const base64 = await zip.generateAsync({ type: 'base64' });
  triggerDownload(base64, 'application/zip', `Fahrzeugakte_${vin}.zip`);
}
