# Supabase-Integration – Einrichtungsanleitung

## Überblick

Der Krug Fleet Manager unterstützt **Supabase als persistentes Backend**.  
Wenn konfiguriert:
- ✅ Daten werden dauerhaft in der Supabase-Datenbank gespeichert
- ✅ Alle Browser und Geräte greifen auf dieselben Daten zu
- ✅ Daten überleben Server-Updates / Browser-Caches
- ✅ Live-Updates: Änderungen in Browser A sind sofort in Browser B sichtbar
- ✅ Dateien (PDFs, Bilder) werden in Supabase Storage gespeichert

Ohne Supabase funktioniert die App weiterhin mit localStorage/IndexedDB (browserspezifisch).

---

## Schritt 1: Supabase-Projekt erstellen

1. [supabase.com](https://supabase.com) → **New Project**
2. Name eingeben, Datenbank-Passwort merken
3. Region wählen (z. B. Frankfurt für DE)

---

## Schritt 2: Datenbank-Schema einrichten

1. Supabase Dashboard → **SQL Editor**
2. Inhalt von `supabase/migrations/001_initial_schema.sql` hineinkopieren
3. **Run** klicken

Das erstellt:
- Tabelle `store_state` (alle App-Daten als JSON-Blobs)
- Storage-Bucket `vehicle-docs` (Fahrzeugdokumente)
- Row Level Security (RLS) Policies

---

## Schritt 3: API-Schlüssel holen

Supabase Dashboard → **Project Settings → API**:

| Variable | Wo zu finden |
|---|---|
| `VITE_SUPABASE_URL` | Project URL (z. B. `https://abcd1234.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | `anon` `public` Key |

---

## Schritt 4: Umgebungsvariablen setzen

```bash
# .env.example → .env.local kopieren
cp .env.example .env.local
# Werte eintragen
nano .env.local
```

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

---

## Schritt 5: App starten / bauen

```bash
npm install
npm run dev      # Entwicklung
# oder
npm run build    # Produktion
```

Beim **ersten Start** mit konfiguriertem Supabase:
1. Bestehende localStorage-Daten werden **automatisch einmalig** nach Supabase migriert
2. Dateien aus IndexedDB werden in Supabase Storage hochgeladen
3. Ab sofort speichert alles direkt in Supabase

---

## Architektur

```
Browser A                    Supabase                 Browser B
─────────────────────        ──────────────────────   ─────────────────────
Zustand Store (RAM)          store_state Tabelle      Zustand Store (RAM)
     ↕ supabaseStorage  →→→  key / value / updated  ←←← supabaseStorage ↕
     
FileStorage.ts          →→→  vehicle-docs Bucket   ←←← FileStorage.ts

Realtime Subscription   ←←← UPDATE events          ←←← Realtime Subscription
     ↓                                                        ↓
persist.rehydrate()                                   persist.rehydrate()
```

### Datentabelle

| Store-Key | Inhalt |
|---|---|
| `fleet-data` | Fahrzeuge, Spalten, Import-Daten |
| `fleet-users` | Benutzerkonten, Rollen |
| `fleet-docs` | Dokument-Metadaten |
| `fleet-vehicle-history` | Änderungsverlauf |
| `fleet-vehicle-notes` | Fahrzeugnotizen |
| `fleet-color-legend` | Farbzuordnungen |
| `fleet-column-config` | Spalten-Einstellungen pro User |
| `fleet-doc-perms` | Dokument-Berechtigungen |
| `fleet-vehicle-access` | Fahrzeug-Zugriffsrechte |
| `fleet-user-groups` | Benutzergruppen |
| `fleet-custom-columns` | Benutzerdefinierte Spalten |
| `fleet-roles` | Rollendefintionen |
| `fleet-vehicle-mails` | Fahrzeug-E-Mails |
| `fleet-email-settings` | EmailJS-Konfiguration |
| `fleet-backups` | Backup-Snapshots |
| `fleet-auth` | ⚠️ bleibt **immer in localStorage** (browserspezifisch) |

---

## Row Level Security (RLS)

Die aktuelle Konfiguration erlaubt allen anonymen und authentifizierten Benutzern Lese- und Schreibzugriff, da die App ihr eigenes Rollen-System mitbringt.

Für höhere Sicherheit kann RLS restriktiver gestaltet werden – z. B. wenn Supabase Auth für Login genutzt werden soll:

```sql
-- Beispiel: Nur authentifizierte Benutzer dürfen schreiben
DROP POLICY "Allow all for anon and authenticated" ON public.store_state;

CREATE POLICY "Read public" ON public.store_state
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Write authenticated" ON public.store_state
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Update authenticated" ON public.store_state
  FOR UPDATE TO authenticated USING (true);
```

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Daten erscheinen nicht | Prüfe ob VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY korrekt sind |
| `store_state` Tabelle fehlt | SQL-Schema erneut ausführen |
| RLS-Fehler (403) | RLS-Policy prüfen (`Allow all for anon` muss aktiv sein) |
| Realtime funktioniert nicht | `supabase_realtime` Publication prüfen: `SELECT * FROM pg_publication_tables;` |
| Dateien laden nicht | Storage-Bucket `vehicle-docs` + Policy prüfen |

---

## Ohne Supabase (Fallback)

Wenn keine Supabase-Variablen gesetzt sind, verwendet die App automatisch:
- `localStorage` für Store-Daten
- `IndexedDB` für Dateien

Der Fallback ist vollständig funktionsfähig, aber nur browserspezifisch.
