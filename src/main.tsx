import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n/index';

import { isConfigured }              from '@/db/client';
import { loadAllStores, startStoreSync, startLiveUpdates } from '@/db/sync';
import { ensureDefaultUsers, migrateLocalUsers }          from '@/db/users';
import { useUsersStore } from '@/hooks/useStore';

let rendered = false;
function render() {
  if (rendered) return;
  rendered = true;
  createRoot(document.getElementById('root')!).render(<App />);
}

async function init() {
  // Kein Backend → sofort starten (localStorage-Modus)
  if (!isConfigured()) {
    console.log('[App] localStorage-Modus (kein Backend konfiguriert)');
    render();
    return;
  }

  // ── 1. Alle Daten aus Firebase laden ──────────────────────────────────────
  try {
    await loadAllStores();
  } catch (err) {
    console.error('[App] Fehler beim Laden:', err);
  }

  // ── 2. Benutzer: lokale Daten migrieren + Standard-User sicherstellen ─────
  try {
    const localUsers = useUsersStore.getState().users;
    await migrateLocalUsers(localUsers);
    await ensureDefaultUsers();
  } catch (err) {
    console.warn('[App] Benutzer-Setup:', err);
  }

  // ── 3. Sync starten (Store → Firebase) ────────────────────────────────────
  startStoreSync();

  // ── 4. Live-Updates starten (Firebase → alle Browser) ────────────────────
  startLiveUpdates();

  // ── 5. App rendern ────────────────────────────────────────────────────────
  render();
  console.log('[App] ✅ Online-Modus aktiv');
}

// Fehler-Fallback: App startet immer
init().catch((err) => {
  console.error('[App] Kritischer Fehler:', err);
  render();
});
