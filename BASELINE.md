# MUTTERPROGRAMM – Baseline v1.0
**Krug Fleet Manager**
Datum: 2026-03-29
Git-Tag: `mutterprogramm-v1.0`
Git-Branch: `baseline/mutterprogramm-v1.0`
Physische Kopie: `/workspace/mutterprogramm_v1.0/`

---

## Zweck
Dieser Stand ist die **stabile Referenzversion** des Krug Fleet Managers.
Alle zukünftigen Entwicklungen erfolgen **ausschließlich additiv** auf Basis
dieser Version. Es werden keine bestehenden Funktionen gelöscht, ersetzt oder
überschrieben.

---

## Enthaltene Funktionen (vollständige Liste)

### Authentifizierung
- Login mit E-Mail + Passwort (hash-basiert, localStorage)
- Standard-Admin: `admin@fleetmanager.de` / `Admin2026!`
- 3 Rollen: Administrator, Bearbeiter, Betrachter
- Geschützte Routen je nach Rolle

### Fahrzeugliste (`/vehicles`)
- Tabellenansicht aller Fahrzeuge mit allen Spalten
- Volltext-Suche über alle Felder
- Filter: Hersteller, Motorart, Haupttyp (Dropdowns)
- Spaltensortierung (auf-/absteigend)
- Pagination (20 Einträge/Seite)
- Drag & Drop Spaltenreihenfolge
- Elektrofahrzeug-Markierung: gelber Hintergrund, ⚡ + ❗ Symbol
- Farbmarkierung je Fahrzeug (9 Farben) mit farbigem Rand in Listenzeile
- Farblegende unterhalb der Tabellenkopfzeile
- Multi-Selektion mit Checkboxen (Einzel + Alle auf Seite)
- Bulk-Aktionsleiste bei Selektion mit Fortschrittsanzeige
- Export: CSV (UTF-8 BOM), Excel (.xlsx)
- Klick auf Zeile → Fahrzeugdetail

### Fahrzeugdetail (`/vehicles/:vin`)
- Alle Datenfelder gruppiert anzeigen
- Bearbeiten (Admin + Bearbeiter), Löschen (nur Admin)
- Farbpicker (9 Farben, wirkt auf Listenzeile)
- **Dokumente & Fotos** (IndexedDB-Speicherung, bis 50 MB/Datei)
  - Upload: PDF + Bilder, mit Bezeichnung vor Upload
  - Bildvorschau: Lightbox mit Blättern + Download
  - PDF-Vorschau: inline via `<embed>` + data-URL (Chrome-kompatibel)
  - „Neuer Tab"-Button + Download je Dokument
  - Löschen einzelner Dokumente (mit Bestätigung)
- **Akte herunterladen** → ZIP mit:
  - `Fahrzeugdaten.csv` (alle Felder)
  - `Dokumente/` (alle Uploads)
  - `README.txt`

### Fahrzeug-Übersicht – Bulk-Download
- Mehrere Fahrzeuge per Checkbox wählen
- ZIP mit einem Ordner pro Fahrzeug + Übersichts-CSV

### Import (`/import`)
- Drag & Drop oder Dateiauswahl (CSV, TXT)
- Automatisches Spalten-Alias-Mapping:
  - `Net damage amount` → `Reparaturkosten netto`
- VIN-basiertes Merging (neue Spalten werden ergänzt)
- Import-Verlauf

### Admin-Bereich (`/admin`) – nur Administratoren
**Tab Benutzer:**
- Benutzer anlegen, bearbeiten, Passwort zurücksetzen, löschen
- System-Admin (admin-1) kann nicht gelöscht werden

**Tab Farblegende:**
- 9 Farben mit frei definierbarer Beschreibung
- Wird in der Fahrzeugliste als Legende angezeigt

**Tab Spalten:**
- Spalten-Konfiguration je Benutzer (Sichtbarkeit + Reihenfolge)
- Drag & Drop im Konfigurator
- „Alle einblenden / ausblenden" + „Standard"-Reset

### Mehrsprachigkeit
- Standardsprache: Deutsch
- Englisch per Umschalter in der Sidebar
- Alle UI-Texte übersetzt (i18next)

### Branding
- Name: „Krug Fleet Manager"
- Logo: Amazon-Lieferfahrzeug (SVG/PNG)
- Farbschema: Dashboard-Ästhetik (Inter + IBM Plex Mono)

### Download-Technologie
- Alle Downloads via `data:` Base64-URLs (sandbox-sicher, kein `blob:`)
- ZIP: JSZip `{ type: 'base64' }`
- Excel: XLSX `{ type: 'base64' }`
- CSV: btoa + encodeURIComponent

---

## Datei-Struktur
```
fleetmanager/
├── src/
│   ├── components/
│   │   ├── Layout.tsx            Sidebar-Navigation, Sprachumschalter
│   │   └── ui/                   shadcn/ui Komponenten
│   ├── hooks/
│   │   └── useStore.ts           Zustand-Stores (Auth, Users, Fleet, Docs,
│   │                             ColorLegend, ColumnConfig)
│   ├── i18n/
│   │   ├── index.ts              i18next Konfiguration
│   │   ├── de.json               Deutsche Übersetzungen
│   │   └── en.json               Englische Übersetzungen
│   ├── lib/
│   │   ├── types.ts              Interfaces (User, VehicleRecord, ...)
│   │   ├── index.ts              Hilfsfunktionen, Konstanten
│   │   ├── csvParser.ts          CSV-Import + -Export
│   │   ├── fileStorage.ts        IndexedDB-Wrapper
│   │   └── downloadUtils.ts      ZIP-Download (Einzel + Bulk)
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Vehicles.tsx          Liste + Multi-Selektion
│   │   ├── VehicleDetail.tsx     Akte + Dokumente + Farbpicker
│   │   ├── Import.tsx
│   │   └── Admin.tsx             Benutzer + Farblegende + Spalten
│   ├── App.tsx                   Routing
│   └── main.tsx
├── public/
│   └── amazon_van_logo.png
└── index.html
```

---

## Wiederherstellung

### Option A – Git-Tag auschecken
```bash
cd /workspace/fleetmanager
git checkout mutterprogramm-v1.0
```

### Option B – Baseline-Branch
```bash
cd /workspace/fleetmanager
git checkout baseline/mutterprogramm-v1.0
```

### Option C – Physische Kopie
```bash
cp -r /workspace/mutterprogramm_v1.0 /workspace/fleetmanager_restored
cd /workspace/fleetmanager_restored
npm install
npm run dev
```

---

## Entwicklungsregeln ab dieser Version
1. **Ausschließlich additive Erweiterungen** – keine bestehenden Funktionen löschen
2. **Neue Features = neue Dateien oder neue Abschnitte** in bestehenden Dateien
3. **Neue Routen** in `App.tsx` nur ergänzen, nicht ersetzen
4. **Store-Erweiterungen** nur durch neue Stores oder neue Felder
5. **Bei Problemen**: zurück zu `mutterprogramm-v1.0` und neu aufbauen
