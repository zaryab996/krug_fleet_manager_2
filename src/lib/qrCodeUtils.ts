/**
 * QR-Code-Utilities für Fahrzeugakten
 *
 * Erzeugt je Fahrzeug einen einzigartigen QR-Code (kodiert: https://www.ksmeu.com/<VIN>),
 * der visuell ein weißes Zentrum mit dem Text „www.ksmeu.com" trägt.
 * Der Code wird als PNG-Blob geliefert und kann direkt in der Fahrzeugakte gespeichert werden.
 */

import QRCode from 'qrcode';
import { saveFile } from './fileStorage';
import { generateId } from './index';
import type { VehicleDocument } from './types';

// ─── Konstanten ──────────────────────────────────────────────────────────────

/** Seiten-URL, die im QR-Code kodiert wird */
const BASE_URL = 'https://www.ksmeu.com';

/** Anzeigetext für das visuelle Label im QR-Code-Zentrum */
const CENTER_TEXT = 'www.ksmeu.com';

/** Größe des QR-Canvas in Pixeln (wird später für PDF skaliert) */
const QR_SIZE = 512;

/** Breite des weißen Zentrumskastens als Bruchteil der Gesamtgröße */
const CENTER_BOX_RATIO = 0.30;

// ─── QR-Code als PNG-DataURL generieren ──────────────────────────────────────

/**
 * Erzeugt einen QR-Code für die gegebene VIN als PNG-DataURL.
 * Der QR kodiert  https://www.ksmeu.com/<VIN>.
 * In der Mitte erscheint ein weißer Bereich mit dem Text „www.ksmeu.com".
 */
export async function generateQRDataUrl(vin: string): Promise<string> {
  // 1) QR-Code auf temporären Canvas zeichnen
  const canvas = document.createElement('canvas');
  canvas.width  = QR_SIZE;
  canvas.height = QR_SIZE;

  await QRCode.toCanvas(canvas, `${BASE_URL}/${vin}`, {
    width: QR_SIZE,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
    errorCorrectionLevel: 'H',   // hohes Error-Correction-Level nötig für Logo-Überlagerung
  });

  const ctx = canvas.getContext('2d')!;

  // 2) Weißes Zentrum zeichnen
  const boxSize  = QR_SIZE * CENTER_BOX_RATIO;
  const boxX     = (QR_SIZE - boxSize) / 2;
  const boxY     = (QR_SIZE - boxSize) / 2;
  const radius   = 8;

  ctx.fillStyle = '#ffffff';
  // Abgerundetes Rechteck (Fallback für Browser ohne roundRect)
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxSize, boxSize, radius);
    ctx.fill();
  } else {
    ctx.fillRect(boxX, boxY, boxSize, boxSize);
  }

  // 3) Rand des Zentrums-Kastens
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth   = 2;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxSize, boxSize, radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(boxX, boxY, boxSize, boxSize);
  }

  // 4) Text "www.ksmeu.com" mehrzeilig ins Zentrum
  const line1 = 'www.';
  const line2 = 'ksmeu';
  const line3 = '.com';
  const cx    = QR_SIZE / 2;
  const cy    = QR_SIZE / 2;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#1a1a2e';

  const fontSize = Math.round(boxSize * 0.195);
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

  ctx.fillText(line1, cx, cy - fontSize * 1.05);
  ctx.fillText(line2, cx, cy);
  ctx.fillText(line3, cx, cy + fontSize * 1.05);

  // 5) VIN klein unter dem Mittelkasten
  const vinFontSize = Math.round(QR_SIZE * 0.028);
  ctx.font      = `${vinFontSize}px monospace`;
  ctx.fillStyle = '#475569';
  ctx.fillText(vin, cx, boxY + boxSize + vinFontSize * 1.4);

  return canvas.toDataURL('image/png');
}

// ─── QR-Code als ArrayBuffer ─────────────────────────────────────────────────

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res   = await fetch(dataUrl);
  return res.arrayBuffer();
}

// ─── QR-Code für ein Fahrzeug erzeugen & speichern ───────────────────────────

export interface QRSaveResult {
  document: VehicleDocument;
}

/**
 * Erzeugt den QR-Code für `vin` und speichert ihn in IndexedDB.
 * Gibt ein fertiges `VehicleDocument`-Objekt zurück, das direkt
 * dem useDocsStore hinzugefügt werden kann.
 */
export async function generateAndSaveVehicleQR(vin: string): Promise<QRSaveResult> {
  const dataUrl   = await generateQRDataUrl(vin);
  const buffer    = await dataUrlToArrayBuffer(dataUrl);
  const docId     = generateId();
  const fileName  = `qr-${vin}.png`;
  const storageKey = docId;

  await saveFile(storageKey, buffer);

  const document: VehicleDocument = {
    id:              docId,
    vehicleVin:      vin,
    label:           'QR-Code',
    originalFileName: fileName,
    fileType:        'image',
    mimeType:        'image/png',
    size:            buffer.byteLength,
    uploadedAt:      new Date().toISOString(),
    storageKey,
  };

  return { document };
}

// ─── Prüfen ob ein QR-Code bereits existiert ─────────────────────────────────

/** Gibt true zurück wenn für diese VIN bereits ein QR-Dokument vorhanden ist */
export function hasQRDocument(vin: string, documents: VehicleDocument[]): boolean {
  return documents.some(
    d => d.vehicleVin === vin && d.label === 'QR-Code' && d.fileType === 'image'
  );
}

// ─── PDF-Druck: 8 QR-Codes pro A4-Seite ─────────────────────────────────────

/**
 * Erstellt ein PDF mit je 8 QR-Codes pro DIN-A4-Seite (2 Spalten × 4 Reihen).
 * Jeder QR-Code ist ca. 60 × 60 mm groß mit VIN als Unterschrift.
 *
 * @param vins  Liste der zu druckenden VINs
 * @param onProgress  Callback mit aktuellem Fortschritt (0–1)
 */
export async function printQRCodesPDF(
  vins: string[],
  onProgress?: (p: number) => void
): Promise<void> {
  // Dynamisch laden um Bundle-Größe zu sparen
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // A4: 210 × 297 mm
  const PAGE_W = 210;
  const PAGE_H = 297;

  // Layout: 2 Spalten × 4 Reihen = 8 QR-Codes pro Seite
  const COLS       = 2;
  const ROWS       = 4;
  const PER_PAGE   = COLS * ROWS;        // 8

  const MARGIN_X   = 15;                 // seitlicher Seitenrand in mm
  const MARGIN_TOP = 18;                 // oberer Rand in mm
  const MARGIN_BOT = 14;                 // unterer Rand in mm

  const QR_W       = 60;                 // QR-Breite in mm
  const QR_H       = 60;                 // QR-Höhe in mm
  const VIN_H      = 5;                  // Höhe der VIN-Beschriftung in mm
  const CELL_H     = QR_H + VIN_H + 4;  // Zellhöhe inkl. Abstand

  // Horizontaler Abstand zwischen den Zellen
  const USABLE_W   = PAGE_W - 2 * MARGIN_X;
  const GAP_X      = (USABLE_W - COLS * QR_W) / (COLS - 1);

  // Vertikaler Abstand zwischen Zellen
  const USABLE_H   = PAGE_H - MARGIN_TOP - MARGIN_BOT;
  const GAP_Y      = (USABLE_H - ROWS * CELL_H) / (ROWS - 1);

  for (let i = 0; i < vins.length; i++) {
    const vin       = vins[i];
    const pageIndex = Math.floor(i / PER_PAGE);
    const cellIndex = i % PER_PAGE;

    // Neue Seite ab dem 2. Batch
    if (cellIndex === 0 && i > 0) {
      pdf.addPage();
    }

    // Kopfzeile auf jeder Seite
    if (cellIndex === 0) {
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      pdf.text('Krug Fleet Manager · QR-Codes', PAGE_W / 2, 10, { align: 'center' });
      pdf.setTextColor(0, 0, 0);
      // Trennlinie
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN_X, 13, PAGE_W - MARGIN_X, 13);
      void pageIndex; // unused warning suppress
    }

    // Position der Zelle berechnen
    const col  = cellIndex % COLS;
    const row  = Math.floor(cellIndex / COLS);
    const x    = MARGIN_X + col * (QR_W + GAP_X);
    const y    = MARGIN_TOP + row * (CELL_H + GAP_Y);

    // QR-Code-Bild erzeugen
    const dataUrl = await generateQRDataUrl(vin);
    pdf.addImage(dataUrl, 'PNG', x, y, QR_W, QR_H, undefined, 'FAST');

    // VIN-Beschriftung unter dem QR-Code
    pdf.setFontSize(7.5);
    pdf.setFont('courier', 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text(vin, x + QR_W / 2, y + QR_H + 3.5, { align: 'center' });

    // Leichter Rahmen um die Zelle
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.rect(x - 1, y - 1, QR_W + 2, CELL_H);

    if (onProgress) onProgress((i + 1) / vins.length);
  }

  // Fußzeile letzte Seite
  const totalPages = Math.ceil(vins.length / PER_PAGE);
  pdf.setFontSize(7);
  pdf.setTextColor(160, 160, 160);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `${vins.length} QR-Codes · ${totalPages} Seite${totalPages !== 1 ? 'n' : ''}`,
    PAGE_W / 2,
    PAGE_H - 6,
    { align: 'center' }
  );

  // Dateiname mit Zeitstempel
  const ts = new Date().toISOString().slice(0, 10);
  pdf.save(`KrugFleet_QR_Codes_${ts}.pdf`);
}
