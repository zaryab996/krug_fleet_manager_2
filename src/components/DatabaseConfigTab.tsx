/**
 * DatabaseConfigTab – Admin-Panel Tab für die Datenbankverbindung.
 * Zeigt Status + ermöglicht Credentials zu ändern.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Database, CheckCircle, AlertCircle, Loader2, Trash2, RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge }  from '@/components/ui/badge';
import { isConfigured, loadConfig, saveConfig, clearConfig, testConnection, getProjectId, type DbConfig } from '@/db/client';

const FIREBASE_RULES = `{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}`;

export default function DatabaseConfigTab() {
  const online    = isConfigured();
  const existing  = loadConfig();
  const projectId = getProjectId();

  const [cfg, setCfg] = useState<Partial<DbConfig>>(existing ?? {});
  const [testState, setTestState] = useState<'idle'|'testing'|'ok'|'error'>('idle');
  const [testMsg,   setTestMsg]   = useState('');
  const [testDet,   setTestDet]   = useState('');
  const [copied, setCopied] = useState('');

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(''), 2000);
  }

  async function handleTest() {
    if (!cfg.apiKey || !cfg.databaseURL || !cfg.projectId) {
      setTestState('error'); setTestMsg('Pflichtfelder ausfüllen.'); return;
    }
    setTestState('testing'); setTestMsg('Verbindung wird getestet…');
    const r = await testConnection(cfg as DbConfig);
    setTestState(r.ok ? 'ok' : 'error');
    setTestMsg(r.message); setTestDet(r.details ?? '');
  }

  function handleSave() {
    saveConfig(cfg as DbConfig);
    window.location.reload();
  }

  function handleDisconnect() {
    if (confirm('Verbindung trennen? App wechselt zu lokalem Speicher.')) {
      clearConfig(); window.location.reload();
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Status-Banner */}
      <Card className={`border-2 ${online ? 'border-green-400 bg-green-50/50' : 'border-amber-400 bg-amber-50/50'}`}>
        <CardContent className="py-3 px-5">
          <div className="flex items-center gap-3">
            {online ? <Wifi className="w-5 h-5 text-green-600 shrink-0" /> : <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />}
            <div className="flex-1">
              <p className={`font-semibold text-sm ${online ? 'text-green-800' : 'text-amber-800'}`}>
                {online ? `✅ Verbunden mit Firebase (${projectId})` : '⚠️ Nicht verbunden – Daten nur im Browser'}
              </p>
              {online && <p className="text-xs text-green-600 mt-0.5">Live-Sync aktiv · Alle Browser sehen dieselben Daten</p>}
              {!online && <p className="text-xs text-amber-700 mt-0.5">Trage unten die Firebase-Daten ein oder öffne den Setup-Assistenten.</p>}
            </div>
            <div className="flex items-center gap-2">
              {online && <Badge className="bg-green-100 text-green-700 border-green-300">Online</Badge>}
              {online && (
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 h-8 text-xs" onClick={handleDisconnect}>
                  <Trash2 className="w-3 h-3" /> Trennen
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nicht verbunden: Setup-Wizard-Link */}
      {!online && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 px-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Erstmalige Einrichtung?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Der Setup-Assistent führt dich Schritt für Schritt durch die Firebase-Einrichtung.</p>
            </div>
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => { localStorage.removeItem('fleet-setup-skipped'); window.location.reload(); }}>
              <Database className="w-3.5 h-3.5" /> Setup-Assistent öffnen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Konfiguration bearbeiten */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Firebase-Verbindungsdaten {online ? '(Verbindung ändern)' : '(eintragen)'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Werte aus: Firebase Console → Projekteinstellungen → Allgemein → firebaseConfig
            {' '}<a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5 underline"><ExternalLink className="w-3 h-3" />Firebase öffnen</a>
          </p>

          {[
            { id: 'apiKey',       label: 'API Key *',             ph: 'AIzaSy...',                           hint: 'firebaseConfig.apiKey' },
            { id: 'databaseURL',  label: 'Database URL *',        ph: 'https://PROJEKT-default-rtdb.europe-west1.firebasedatabase.app', hint: 'firebaseConfig.databaseURL' },
            { id: 'projectId',    label: 'Project ID *',          ph: 'mein-fleet-projekt',                  hint: 'firebaseConfig.projectId' },
            { id: 'storageBucket',label: 'Storage Bucket (opt.)', ph: 'mein-fleet-projekt.appspot.com',      hint: 'firebaseConfig.storageBucket' },
          ].map(f => (
            <div key={f.id}>
              <Label className="text-xs font-medium mb-1 block">{f.label}</Label>
              <Input
                value={(cfg as Record<string,string>)[f.id] ?? ''}
                onChange={e => { setCfg(c => ({ ...c, [f.id]: e.target.value })); setTestState('idle'); }}
                placeholder={f.ph} className="h-9 font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">{f.hint}</p>
            </div>
          ))}

          {/* Datenbankregeln */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-foreground mb-1">Datenbankregeln (einmalig setzen):</p>
            <div className="relative">
              <pre className="bg-muted/50 border border-border rounded-lg p-3 text-xs font-mono overflow-x-auto text-muted-foreground">{FIREBASE_RULES}</pre>
              <button className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[10px] bg-background border border-border rounded px-1.5 py-1 text-muted-foreground hover:text-foreground"
                onClick={() => copy(FIREBASE_RULES, 'rules')}>
                {copied === 'rules' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied === 'rules' ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Firebase Console → Realtime Database → Tab „Regeln" → einfügen → Veröffentlichen</p>
          </div>

          {/* Test-Ergebnis */}
          <AnimatePresence>
            {testState !== 'idle' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`rounded-lg p-3 text-sm flex gap-2 items-start ${testState === 'ok' ? 'bg-green-50 border border-green-200 text-green-800' : testState === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-muted border border-border text-muted-foreground'}`}>
                {testState === 'testing' && <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
                {testState === 'ok'      && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />}
                {testState === 'error'   && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />}
                <div>
                  <p className="font-medium">{testMsg}</p>
                  {testDet && <p className="text-xs mt-0.5 opacity-80">{testDet}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleTest} disabled={testState === 'testing' || !cfg.apiKey || !cfg.databaseURL || !cfg.projectId}>
              {testState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Verbindung testen
            </Button>
            <Button size="sm" className="gap-1.5 flex-1" onClick={handleSave} disabled={!cfg.apiKey || !cfg.databaseURL || !cfg.projectId}>
              <Database className="w-3.5 h-3.5" />
              {online ? 'Verbindung aktualisieren' : 'Verbinden & Aktivieren'}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
