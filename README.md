# 🚗 Krug Fleet Manager

Eine professionelle, browserbasierte Fahrzeugflotten-Verwaltungsanwendung – entwickelt mit React, TypeScript, Vite und shadcn/ui.

---

## 📋 Inhaltsverzeichnis

- [Projektbeschreibung](#projektbeschreibung)
- [Features](#features)
- [Technologie-Stack](#technologie-stack)
- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Starten (Entwicklung)](#starten-entwicklung)
- [Build & Preview](#build--preview)
- [Konfiguration](#konfiguration)
- [E-Mail-System (EmailJS)](#e-mail-system-emailjs)
- [Standardzugangsdaten](#standardzugangsdaten)
- [Projektstruktur](#projektstruktur)

---

## Projektbeschreibung

Der **Krug Fleet Manager** ist eine vollständig clientseitige React-Anwendung zur Verwaltung von Fahrzeugflotten. Alle Daten werden im `localStorage` des Browsers gespeichert – es ist kein Backend erforderlich. Die Anwendung unterstützt mehrsprachige Oberflächen (Deutsch/Englisch), Benutzerverwaltung mit Rollensystem, CSV-Import, Dokumentenverwaltung und ein fahrzeugspezifisches E-Mail-System.

---

## Features

### Fahrzeugverwaltung
- Fahrzeugliste mit konfigurierbaren Spalten, Sortierung und Filterung
- Detailansicht mit vollständiger Fahrzeugakte
- VIN-basierte Suche und Identifikation
- Farbmarkierung und individuelle Kennzeichnung
- QR-Code-Generierung pro Fahrzeug
- Massenimport via CSV-Datei
- Ordner-Massenupload (VIN = Ordnername)

### Dokumentenverwaltung
- PDF- und Bilddateien pro Fahrzeug hochladen
- Lightbox-Ansicht für Bilder
- PDF-Viewer im Browser
- Dokumenten-Labels und Kategorisierung

### Verlauf & Bemerkungen
- Automatische Protokollierung aller Feldänderungen
- Manuelle Bemerkungen (Notizen) pro Fahrzeug
- Vollständige Änderungshistorie mit Benutzerangabe

### E-Mail-System (fahrzeugspezifisch)
- Jedes Fahrzeug erhält eine eindeutige E-Mail-Adresse: `fzg.VIN@domain.com`
- E-Mails verfassen und versenden (via EmailJS)
- Posteingang und Postausgang pro Fahrzeug
- Manuelle Erfassung eingehender E-Mails
- Ungelesen-Badge in der Fahrzeugübersicht

### Benutzerverwaltung
- Admin, Editor, Viewer Rollen + benutzerdefinierte Rollen
- Benutzergruppen mit gemeinsamen Berechtigungen
- Fahrzeugzugriffssteuerung (welcher Benutzer sieht welches Fahrzeug)
- Spalten- und Dokumentenberechtigungen pro Benutzer/Gruppe

### Weitere Features
- Vollständige Mehrsprachigkeit (Deutsch / Englisch)
- Helles und dunkles Theme
- Datensicherung (Backup/Restore als JSON)
- Datenexport (Excel/CSV/ZIP)
- Responsive Layout

---

## Technologie-Stack

| Technologie | Version | Verwendung |
|---|---|---|
| React | 18.3.x | UI-Framework |
| TypeScript | 5.5.x | Typsicherheit |
| Vite | 5.4.x | Build-Tool |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | – | UI-Komponenten (Radix UI) |
| Zustand | 5.x | State Management |
| React Router DOM | 6.x | Routing |
| Framer Motion | 11.x | Animationen |
| i18next | 26.x | Internationalisierung |
| EmailJS | 4.x | E-Mail-Versand |
| JSZip | 3.x | ZIP-Export |
| jsPDF | 4.x | PDF-Generierung |
| PapaParse | 5.x | CSV-Parsing |
| XLSX | 0.18.x | Excel-Export |
| Lucide React | 0.462.x | Icons |

---

## Voraussetzungen

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0 (oder yarn / pnpm)

---

## Installation

```bash
# 1. Repository klonen
git clone https://github.com/IHR-USERNAME/krug-fleet-manager.git
cd krug-fleet-manager

# 2. Abhängigkeiten installieren
npm install
```

---

## Starten (Entwicklung)

```bash
npm run dev
```

Die Anwendung ist dann unter **http://localhost:8080** erreichbar.

---

## Build & Preview

```bash
# Produktions-Build erstellen
npm run build

# Build lokal vorschauen
npm run preview
```

Der Build-Output landet im Ordner `dist/`. Diese Dateien können auf jeden statischen Webserver (nginx, Apache, GitHub Pages, Netlify, Vercel, etc.) hochgeladen werden.

---

## Konfiguration

### Umgebungsvariablen

Erstellen Sie eine `.env.local`-Datei im Projektroot (wird nicht in Git eingecheckt):

```env
# EmailJS – Willkommens-E-Mails
VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxx

# EmailJS – Fahrzeug-E-Mails
VITE_EMAILJS_VEHICLE_TEMPLATE_ID=template_xxxxxxx
```

> **Hinweis:** Die Konfiguration kann alternativ vollständig über den Admin-Bereich der Anwendung vorgenommen werden (Admin → E-Mail). Die Werte werden dann im `localStorage` gespeichert.

---

## E-Mail-System (EmailJS)

### Einrichtung

1. Kostenloses Konto anlegen auf [emailjs.com](https://www.emailjs.com) (200 E-Mails/Monat gratis)
2. E-Mail-Dienst verbinden (Gmail, Outlook oder SMTP)
3. **Template 1** – Willkommens-E-Mail erstellen:
   - Variablen: `{{to_name}}`, `{{to_email}}`, `{{password}}`, `{{role}}`, `{{app_url}}`, `{{sender_name}}`
4. **Template 2** – Fahrzeug-E-Mail erstellen:
   - Variablen: `{{from_email}}`, `{{from_name}}`, `{{to_email}}`, `{{subject}}`, `{{message}}`, `{{vin}}`, `{{reply_to}}`
   - ⚠️ **Reply-To muss auf `{{reply_to}}` gesetzt werden**
5. Service-ID, beide Template-IDs und Public Key in Admin → E-Mail eintragen

### Fahrzeug-E-Mail-Adressen

Jedes Fahrzeug erhält automatisch eine Adresse nach dem Schema:
```
fzg.VINNNNNNNNNNN@ksmeu.com
```
Die Domain kann im Admin-Bereich geändert werden.

---

## Standardzugangsdaten

```
E-Mail:   admin@fleetmanager.de
Passwort: Admin2026!
```

> ⚠️ **Bitte das Passwort nach dem ersten Login im Admin-Bereich ändern.**

---

## Projektstruktur

```
krug-fleet-manager/
├── public/                    # Statische Assets
│   ├── favicon.ico
│   ├── amazon_van_logo.png
│   ├── placeholder.svg
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/                # shadcn/ui Komponenten (Radix UI)
│   │   └── Layout.tsx         # App-Layout (Sidebar, Navigation)
│   ├── hooks/
│   │   ├── useStore.ts        # Zustand Stores (Fleet, Auth, Users, Docs, Mail…)
│   │   ├── useEffectivePermissions.ts
│   │   └── useColumnLabel.ts
│   ├── i18n/
│   │   ├── de.json            # Deutsche Übersetzungen
│   │   ├── en.json            # Englische Übersetzungen
│   │   └── index.ts           # i18next Konfiguration
│   ├── lib/
│   │   ├── types.ts           # TypeScript-Typen & Interfaces
│   │   ├── index.ts           # Hilfsfunktionen
│   │   ├── emailService.ts    # EmailJS-Integration
│   │   ├── vehicleMailUtils.ts # Fahrzeug-E-Mail-Hilfsfunktionen
│   │   ├── backupManager.ts   # Backup/Restore-Logik
│   │   ├── csvParser.ts       # CSV-Import-Parser
│   │   ├── downloadUtils.ts   # Export-Funktionen (ZIP, Excel)
│   │   ├── fileStorage.ts     # IndexedDB für Dokumente/Bilder
│   │   ├── qrCodeUtils.ts     # QR-Code-Generierung
│   │   └── utils.ts           # cn() Utility
│   ├── pages/
│   │   ├── Vehicles.tsx       # Fahrzeugübersicht
│   │   ├── VehicleDetail.tsx  # Fahrzeugakte
│   │   ├── Import.tsx         # CSV-Import
│   │   ├── FolderUpload.tsx   # Massenupload
│   │   ├── Admin.tsx          # Benutzerverwaltung & Einstellungen
│   │   └── Login.tsx          # Anmeldeseite
│   ├── App.tsx                # Routing
│   ├── main.tsx               # Entry Point
│   ├── index.css              # Globale Styles (Tailwind)
│   └── vite-env.d.ts
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── postcss.config.js
├── eslint.config.js
└── components.json
```

---

## Datenspeicherung

Die Anwendung ist **vollständig clientseitig** – es gibt keinen Server und keine Datenbank:

| Datenspeicher | Inhalt |
|---|---|
| `localStorage` | Fahrzeugdaten, Benutzer, Einstellungen, E-Mails, Verlauf |
| `IndexedDB` | Hochgeladene Dokumente und Bilder (Binärdaten) |

> **Hinweis:** Daten sind browserspezifisch. Für teamweiten Einsatz die Backup/Export-Funktion nutzen.

---

## Deployment

### Statischer Webserver (nginx, Apache)

```bash
npm run build
# dist/-Ordner auf den Server hochladen
```

Nginx-Konfiguration (SPA-Routing):
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

### GitHub Pages / Netlify / Vercel

- Einfach das Repository verbinden
- Build-Befehl: `npm run build`
- Output-Ordner: `dist`

---

## Lizenz

Dieses Projekt ist proprietär und ausschließlich für den internen Einsatz bestimmt.

---

*Krug Fleet Manager – Entwickelt für professionelle Fahrzeugflotten-Verwaltung*
