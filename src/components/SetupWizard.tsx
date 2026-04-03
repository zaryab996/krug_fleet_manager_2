/**
 * SetupWizard – Erscheint automatisch wenn keine Datenbank konfiguriert ist.
 * 
 * Führt den Admin Schritt für Schritt durch die Firebase-Einrichtung.
 * Nach erfolgreicher Verbindung lädt die App neu und startet im Online-Modus.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi, Database, CheckCircle, AlertCircle, Loader2,
  ExternalLink, Copy, Check, ChevronRight, ChevronDown,
  ChevronUp, Eye, EyeOff, ArrowRight, Zap, Lock, Globe, Users
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { testConnection, saveConfig, type DbConfig } from '@/db/client';

type Step = 'intro' | 'create' | 'database' | 'rules' | 'apikey' | 'connect';
type TestState = 'idle' | 'testing' | 'ok' | 'error';

const FIREBASE_RULES = `{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}`;

export default function SetupWizard() {
  const [step,    setStep]    = useState<Step>('intro');
  const [cfg,     setCfg]     = useState<Partial<DbConfig>>({});
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [testDetails, setTestDetails] = useState('');
  const [copied,  setCopied]  = useState('');
  const [showKey, setShowKey] = useState(false);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2500);
  }

  async function handleTest() {
    if (!cfg.apiKey || !cfg.databaseURL || !cfg.projectId) {
      setTestState('error');
      setTestMsg('Bitte alle Pflichtfelder ausfüllen.');
      return;
    }
    setTestState('testing');
    setTestMsg('Verbindung wird getestet…');
    const result = await testConnection(cfg as DbConfig);
    setTestState(result.ok ? 'ok' : 'error');
    setTestMsg(result.message);
    setTestDetails(result.details ?? '');
  }

  function handleConnect() {
    saveConfig(cfg as DbConfig);
    window.location.reload();
  }

  const steps: Record<Step, { title: string; n: number }> = {
    intro:    { title: 'Willkommen',            n: 0 },
    create:   { title: 'Projekt erstellen',     n: 1 },
    database: { title: 'Datenbank aktivieren',  n: 2 },
    rules:    { title: 'Regeln setzen',         n: 3 },
    apikey:   { title: 'API-Key kopieren',      n: 4 },
    connect:  { title: 'Verbinden',             n: 5 },
  };
  const totalSteps = 5;
  const currentN = steps[step].n;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
            <Database className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Fleet Manager</h1>
          <p className="text-slate-400 text-sm">Online-Datenbank einrichten</p>
        </div>

        {/* Progress */}
        {currentN > 0 && (
          <div className="flex items-center gap-1.5 mb-6 px-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i < currentN ? 'bg-primary' : i === currentN - 1 ? 'bg-primary/60' : 'bg-slate-700'}`} />
            ))}
            <span className="text-xs text-slate-400 ml-1 whitespace-nowrap">{currentN}/{totalSteps}</span>
          </div>
        )}

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-2xl backdrop-blur-sm"
          >

            {/* ── INTRO ── */}
            {step === 'intro' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Datenspeicherung einrichten</h2>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Damit alle Daten dauerhaft gespeichert werden und von jedem Browser aus
                    zugänglich sind, wird eine kostenlose Online-Datenbank benötigt.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: <Globe className="w-4 h-4 text-blue-400" />, title: 'Von überall', desc: 'Alle Browser, alle Geräte' },
                    { icon: <Users className="w-4 h-4 text-green-400" />, title: 'Alle Nutzer', desc: 'Login funktioniert überall' },
                    { icon: <Zap className="w-4 h-4 text-yellow-400" />, title: 'Echtzeit', desc: 'Änderungen sofort sichtbar' },
                    { icon: <Lock className="w-4 h-4 text-purple-400" />, title: 'Kostenlos', desc: 'Firebase Free Tier reicht' },
                  ].map(item => (
                    <div key={item.title} className="bg-slate-700/50 rounded-xl p-3 border border-slate-600/50">
                      <div className="flex items-center gap-2 mb-1">
                        {item.icon}
                        <span className="text-sm font-semibold text-white">{item.title}</span>
                      </div>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 text-xs text-amber-300">
                  <strong className="text-amber-200">Ohne Datenbank:</strong> Daten sind nur im Browser gespeichert 
                  und gehen beim Wechsel des Geräts oder Browsers verloren.
                </div>
                <Button className="w-full gap-2 h-11" onClick={() => setStep('create')}>
                  Einrichtung starten <ArrowRight className="w-4 h-4" />
                </Button>
                <button
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-400 py-1"
                  onClick={() => {
                    // Überspringen – localStorage-Modus
                    localStorage.setItem('fleet-setup-skipped', '1');
                    window.location.reload();
                  }}
                >
                  Überspringen (nur lokale Speicherung – nicht empfohlen)
                </button>
              </div>
            )}

            {/* ── CREATE ── */}
            {step === 'create' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Schritt 1: Firebase-Projekt erstellen</h2>
                  <p className="text-slate-300 text-sm">Google Firebase ist kostenlos und braucht nur ein Google-Konto.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { n: 1, text: 'Gehe zu', link: { label: 'console.firebase.google.com', href: 'https://console.firebase.google.com' } },
                    { n: 2, text: 'Klicke auf „Projekt erstellen"' },
                    { n: 3, text: 'Gib einen Namen ein, z. B. krug-fleet' },
                    { n: 4, text: 'Google Analytics: kann übersprungen werden' },
                    { n: 5, text: 'Warte bis das Projekt fertig ist (~30 Sekunden)' },
                  ].map(item => (
                    <div key={item.n} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{item.n}</span>
                      <p className="text-sm text-slate-300 flex-1">
                        {item.text}
                        {item.link && (
                          <a href={item.link.href} target="_blank" rel="noopener noreferrer"
                            className="ml-1 text-primary underline inline-flex items-center gap-0.5">
                            {item.link.label} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={() => setStep('intro')}>Zurück</Button>
                  <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button className="w-full gap-2">Firebase öffnen <ExternalLink className="w-3.5 h-3.5" /></Button>
                  </a>
                </div>
                <Button variant="ghost" className="w-full text-slate-400 gap-2" onClick={() => setStep('database')}>
                  Projekt bereits erstellt – weiter <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* ── DATABASE ── */}
            {step === 'database' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Schritt 2: Realtime Database aktivieren</h2>
                  <p className="text-slate-300 text-sm">Die Realtime Database ist die Datenbank für alle App-Daten.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { n: 1, text: 'Im Firebase-Projekt: Linke Leiste → Build → Realtime Database' },
                    { n: 2, text: '„Datenbank erstellen" klicken' },
                    { n: 3, text: 'Region auswählen: europe-west1 (Belgien) – am nächsten zu Deutschland' },
                    { n: 4, text: '„Im Testmodus starten" auswählen' },
                    { n: 5, text: 'Fertig – die Datenbank ist aktiv' },
                  ].map(item => (
                    <div key={item.n} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{item.n}</span>
                      <p className="text-sm text-slate-300">{item.text}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-3 text-xs text-blue-300">
                  💡 Der Testmodus ermöglicht 30 Tage freien Zugriff. Danach Regeln auf dauerhaften Zugriff setzen (Schritt 3).
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setStep('create')}>Zurück</Button>
                  <Button className="flex-1 gap-2" onClick={() => setStep('rules')}>Weiter <ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {/* ── RULES ── */}
            {step === 'rules' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Schritt 3: Datenbankregeln setzen</h2>
                  <p className="text-slate-300 text-sm">Diese Regeln erlauben der App dauerhaften Zugriff (auch nach 30 Tagen).</p>
                </div>
                <div className="space-y-3">
                  {[
                    { n: 1, text: 'Realtime Database → Tab „Regeln" (oben)' },
                    { n: 2, text: 'Alles löschen und folgendes einfügen:' },
                    { n: 3, text: '„Veröffentlichen" klicken' },
                  ].map(item => (
                    <div key={item.n} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{item.n}</span>
                      <p className="text-sm text-slate-300">{item.text}</p>
                    </div>
                  ))}
                </div>
                {/* Code-Block */}
                <div className="relative">
                  <pre className="bg-slate-900 border border-slate-600 rounded-xl p-4 text-sm font-mono text-green-400 overflow-x-auto">
                    {FIREBASE_RULES}
                  </pre>
                  <button
                    className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-500"
                    onClick={() => copy(FIREBASE_RULES, 'rules')}
                  >
                    {copied === 'rules' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === 'rules' ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setStep('database')}>Zurück</Button>
                  <Button className="flex-1 gap-2" onClick={() => setStep('apikey')}>Weiter <ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {/* ── API KEY ── */}
            {step === 'apikey' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Schritt 4: Verbindungsdaten kopieren</h2>
                  <p className="text-slate-300 text-sm">Diese Werte brauchst du aus den Firebase-Projekteinstellungen.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { n: 1, text: 'Zahnrad-Symbol (⚙️) neben „Projektübersicht" → „Projekteinstellungen"' },
                    { n: 2, text: 'Tab „Allgemein" → ganz unten „Ihre Apps"' },
                    { n: 3, text: 'Falls keine App vorhanden: </> (Web) klicken → Namen eingeben → registrieren' },
                    { n: 4, text: 'Du siehst jetzt ein Objekt firebaseConfig – kopiere die Werte in Schritt 5' },
                  ].map(item => (
                    <div key={item.n} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{item.n}</span>
                      <p className="text-sm text-slate-300">{item.text}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-900 border border-slate-600 rounded-xl p-3 text-xs font-mono text-slate-400">
                  <span className="text-slate-500">// firebaseConfig sieht so aus:</span>{'\n'}
                  <span className="text-yellow-400">apiKey</span>: <span className="text-green-400">"AIzaSy..."</span>,{'\n'}
                  <span className="text-yellow-400">databaseURL</span>: <span className="text-green-400">"https://PROJEKT-default-rtdb..."</span>,{'\n'}
                  <span className="text-yellow-400">projectId</span>: <span className="text-green-400">"mein-projekt"</span>,{'\n'}
                  <span className="text-yellow-400">storageBucket</span>: <span className="text-green-400">"mein-projekt.appspot.com"</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setStep('rules')}>Zurück</Button>
                  <Button className="flex-1 gap-2" onClick={() => setStep('connect')}>Werte eintragen <ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {/* ── CONNECT ── */}
            {step === 'connect' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">Schritt 5: Verbindung einrichten</h2>
                  <p className="text-slate-300 text-sm">Trage die Werte aus deiner Firebase-Konfiguration ein.</p>
                </div>

                {[
                  {
                    id: 'apiKey',
                    label: 'API Key *',
                    ph: 'AIzaSyB...',
                    hint: 'firebaseConfig.apiKey',
                    val: cfg.apiKey ?? '',
                    set: (v: string) => setCfg(c => ({ ...c, apiKey: v })),
                  },
                  {
                    id: 'databaseURL',
                    label: 'Database URL *',
                    ph: 'https://PROJEKT-default-rtdb.europe-west1.firebasedatabase.app',
                    hint: 'firebaseConfig.databaseURL – die wichtigste Angabe!',
                    val: cfg.databaseURL ?? '',
                    set: (v: string) => setCfg(c => ({ ...c, databaseURL: v })),
                  },
                  {
                    id: 'projectId',
                    label: 'Project ID *',
                    ph: 'mein-fleet-projekt',
                    hint: 'firebaseConfig.projectId',
                    val: cfg.projectId ?? '',
                    set: (v: string) => setCfg(c => ({ ...c, projectId: v })),
                  },
                  {
                    id: 'storageBucket',
                    label: 'Storage Bucket (optional)',
                    ph: 'mein-fleet-projekt.appspot.com',
                    hint: 'firebaseConfig.storageBucket – für Datei-Uploads',
                    val: cfg.storageBucket ?? '',
                    set: (v: string) => setCfg(c => ({ ...c, storageBucket: v })),
                  },
                ].map(f => (
                  <div key={f.id}>
                    <Label className="text-xs font-medium text-slate-300 mb-1 block">{f.label}</Label>
                    <Input
                      value={f.val}
                      onChange={e => { f.set(e.target.value); setTestState('idle'); }}
                      placeholder={f.ph}
                      className="bg-slate-900 border-slate-600 text-slate-200 placeholder:text-slate-600 h-9 font-mono text-xs"
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">{f.hint}</p>
                  </div>
                ))}

                {/* Test-Ergebnis */}
                <AnimatePresence>
                  {testState !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={`rounded-xl p-3 text-sm flex gap-2 items-start ${
                        testState === 'ok'      ? 'bg-green-900/40 border border-green-700 text-green-300'
                        : testState === 'error' ? 'bg-red-900/40 border border-red-700 text-red-300'
                        : 'bg-slate-700/50 border border-slate-600 text-slate-300'
                      }`}
                    >
                      {testState === 'testing' && <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
                      {testState === 'ok'      && <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />}
                      {testState === 'error'   && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                      <div>
                        <p className="font-medium">{testMsg}</p>
                        {testDetails && <p className="text-xs opacity-70 mt-0.5">{testDetails}</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Buttons */}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => setStep('apikey')}>Zurück</Button>
                  <Button
                    variant="outline"
                    className="border-slate-600 text-slate-300 gap-1.5"
                    onClick={handleTest}
                    disabled={testState === 'testing'}
                  >
                    {testState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                    Testen
                  </Button>
                  <Button
                    className="flex-1 gap-2 bg-green-600 hover:bg-green-500"
                    onClick={handleConnect}
                    disabled={!cfg.apiKey || !cfg.databaseURL || !cfg.projectId || testState === 'testing'}
                  >
                    {testState === 'ok' ? <CheckCircle className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                    {testState === 'ok' ? 'Verbinden!' : 'Verbinden & Starten'}
                  </Button>
                </div>

                {testState === 'ok' && (
                  <p className="text-xs text-green-400 text-center">
                    ✅ Verbindung erfolgreich – klicke „Verbinden!" um fortzufahren
                  </p>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-4">
          Krug Fleet Manager · Firebase Realtime Database · Kostenlos
        </p>
      </div>
    </div>
  );
}
