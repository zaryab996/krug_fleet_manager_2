-- ============================================================
-- Krug Fleet Manager – Supabase Schema
-- Migration: 001_initial_schema.sql
--
-- Ausführen in Supabase Dashboard:
--   SQL-Editor → Inhalt einfügen → Run
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Tabelle: store_state
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_state (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.store_state     IS 'Persistente Zustand-Stores (ersetzt localStorage)';
COMMENT ON COLUMN public.store_state.key IS 'Store-Schlüssel, z. B. fleet-data, fleet-docs';

ALTER TABLE public.store_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon and authenticated"
  ON public.store_state
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.store_state;


-- ──────────────────────────────────────────────────────────────
-- Tabelle: fleet_users
--
-- Speichert alle Benutzer des Systems mit gehashtem Passwort.
-- Geräteübergreifender Login: Prüfung erfolgt gegen diese Tabelle.
-- Kein Supabase-Auth – das System nutzt ein eigenes Rollen-System.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fleet_users (
  id            TEXT        PRIMARY KEY,          -- z. B. 'admin-1' oder generateId()
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'viewer',  -- 'admin' | 'editor' | 'viewer'
  password_hash TEXT        NOT NULL,             -- simpleHash(passwort) – kein Klartext
  group_id      TEXT        DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.fleet_users IS 'Benutzer des Fleet-Managers – geräteübergreifender Login';
COMMENT ON COLUMN public.fleet_users.password_hash IS 'Deterministischer Hash (simpleHash) – kein bcrypt, da clientseitig';

ALTER TABLE public.fleet_users ENABLE ROW LEVEL SECURITY;

-- Alle Benutzer dürfen die Tabelle lesen und schreiben
-- (App-seitiges Rollen-System regelt Zugriffsrechte)
CREATE POLICY "Allow all fleet_users operations"
  ON public.fleet_users
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Realtime für fleet_users (damit neue Benutzer sofort sichtbar sind)
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_users;


-- ──────────────────────────────────────────────────────────────
-- Supabase Storage: Bucket für Fahrzeugdokumente
-- ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vehicle-docs',
  'vehicle-docs',
  false,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow all storage operations"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'vehicle-docs')
  WITH CHECK (bucket_id = 'vehicle-docs');


-- ──────────────────────────────────────────────────────────────
-- Hilfsfunktion: Benutzer per E-Mail suchen (Login)
-- Gibt nur die für den Login benötigten Felder zurück.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_by_email(p_email TEXT)
RETURNS TABLE(
  id            TEXT,
  email         TEXT,
  name          TEXT,
  role          TEXT,
  password_hash TEXT,
  group_id      TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT id, email, name, role, password_hash, group_id, created_at
  FROM public.fleet_users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;


-- ──────────────────────────────────────────────────────────────
-- Hilfsfunktion: Alle Store-Keys auflisten (Debug)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fleet_store_keys()
RETURNS TABLE(key TEXT, updated_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT key, updated_at
  FROM public.store_state
  WHERE key LIKE 'fleet-%'
  ORDER BY key;
$$;
