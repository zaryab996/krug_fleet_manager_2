import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, CheckCircle, AlertCircle, X, History,
  Plus, Merge, Info, Lock, AlertTriangle, RefreshCw, SkipForward,
  ChevronDown, ChevronUp, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useFleetStore, useVehicleHistoryStore, useAuthStore, useDocsStore, useDocPermStore } from '@/hooks/useStore';
import { parseFile } from '@/lib/csvParser';
import type { ImportSession, VehicleRecord } from '@/lib/types';
import { generateAndSaveVehicleQR, hasQRDocument } from '@/lib/qrCodeUtils';
import { useTranslation } from 'react-i18next';

interface ImportResult {
  newCount: number;
  updatedCount: number;
  newColumns: string[];
  fileName: string;
}

interface DuplicateEntry {
  incoming: VehicleRecord;
  existing: VehicleRecord;
}

type DuplicateAction = 'replace' | 'skip' | 'merge';

/** Zeige die wichtigsten Felder eines Records als Diff */
function DiffRow({ label, oldVal, newVal }: { label: string; oldVal: unknown; newVal: unknown }) {
  const o = String(oldVal ?? '—');
  const n = String(newVal ?? '—');
  if (o === n) return null;
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-1 pr-3 text-xs text-muted-foreground font-medium w-36 shrink-0">{label}</td>
      <td className="py-1 pr-2 text-xs text-destructive/80 line-through">{o}</td>
      <td className="py-1 text-xs"><ArrowRight className="w-3 h-3 inline text-muted-foreground mr-1" /></td>
      <td className="py-1 text-xs text-green-700 font-medium">{n}</td>
    </tr>
  );
}

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  const { fleetData, importData, previewImport } = useFleetStore();
  const { addEntry: addHistory } = useVehicleHistoryStore();
  const { addDocument, documents } = useDocsStore();
  const { currentUser } = useAuthStore();
  const { getPermission } = useDocPermStore();

  const myPerm = currentUser ? getPermission(currentUser.id, currentUser.role) : null;
  const canImport = currentUser?.role === 'admin' || !!myPerm?.canImport;

  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Duplikat-Dialog State ─────────────────────────────────────────
  const [pendingFile,   setPendingFile]   = useState<string>('');
  const [pendingAll,    setPendingAll]    = useState<VehicleRecord[]>([]);
  const [duplicates,    setDuplicates]    = useState<DuplicateEntry[]>([]);
  const [newCount,      setNewCount]      = useState(0);
  const [actions,       setActions]       = useState<Record<string, DuplicateAction>>({});
  const [expandedVin,   setExpandedVin]   = useState<string | null>(null);
  const [showDupDialog, setShowDupDialog] = useState(false);

  // ── Datei analysieren ─────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'txt'].includes(ext)) { setError(t('import.errorOnlyCSV')); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const records = await parseFile(file);
      if (records.length === 0) { setError(t('import.errorNoData')); setLoading(false); return; }

      const preview = previewImport(records);

      if (preview.duplicates.length > 0) {
        // Duplikate gefunden → Dialog zeigen
        const defaultActions: Record<string, DuplicateAction> = {};
        preview.duplicates.forEach(d => { defaultActions[String(d.incoming.vin)] = 'merge'; });
        setActions(defaultActions);
        setDuplicates(preview.duplicates);
        setNewCount(preview.newCount);
        setPendingAll(records);
        setPendingFile(file.name);
        setLoading(false);
        setShowDupDialog(true);
        return;
      }

      // Keine Duplikate → direkt importieren
      await runImport(records, file.name);
    } catch (err) {
      setError(t('import.errorParse', { error: String(err) }));
    }
    setLoading(false);
  };

  // ── Import ausführen (nach Bestätigung) ──────────────────────────
  const runImport = async (records: VehicleRecord[], fileName: string) => {
    const res = importData(records, fileName);
    setResult({ ...res, fileName });
    const ts = new Date().toISOString();
    res.newVins.forEach(vin => {
      addHistory({
        vehicleVin: vin, type: 'vehicle_created', timestamp: ts,
        userId: currentUser?.id ?? 'system', userName: currentUser?.name ?? 'System',
        importSource: fileName,
      });
    });
    res.newVins.forEach(async vin => {
      try {
        if (!hasQRDocument(vin, documents)) {
          const { document: qrDoc } = await generateAndSaveVehicleQR(vin);
          addDocument(qrDoc);
        }
      } catch { /* ignore */ }
    });
  };

  // ── Duplikat-Dialog: Bestätigen ───────────────────────────────────
  const confirmDuplicates = async () => {
    setShowDupDialog(false);
    setLoading(true);

    // Datensätze zusammenstellen je nach Aktion
    // existing map für merge
    const { fleetData: fd } = useFleetStore.getState();
    const existingMap = new Map(fd.records.map(r => [String(r.vin), r]));

    const toImport: VehicleRecord[] = [];
    pendingAll.forEach(r => {
      const vin = String(r.vin);
      const action = actions[vin];
      if (action === 'skip') return;                          // überspringen
      if (action === 'replace' || !action) {
        toImport.push(r);                                     // komplett ersetzen
      } else if (action === 'merge') {
        const existing = existingMap.get(vin);
        if (existing) {
          // Zusammenführen: bestehende Felder behalten, neue/geänderte Felder überschreiben
          // Leere Werte in "incoming" behalten den Bestandswert
          const merged: VehicleRecord = { ...existing };
          Object.entries(r).forEach(([k, v]) => {
            if (k.startsWith('_')) return;
            const strVal = String(v ?? '').trim();
            if (strVal !== '' && strVal !== '—' && strVal !== 'undefined' && strVal !== 'null') {
              merged[k] = v;
            }
          });
          toImport.push(merged);
        } else {
          toImport.push(r);
        }
      }
    });

    if (toImport.length > 0) {
      await runImport(toImport, pendingFile);
    }

    setLoading(false);
    setPendingAll([]); setDuplicates([]); setPendingFile('');
  };

  // ── Alle auf replace/skip setzen ─────────────────────────────────
  const setAllActions = (action: DuplicateAction) => {
    const next: Record<string, DuplicateAction> = {};
    duplicates.forEach(d => { next[String(d.incoming.vin)] = action; });
    setActions(next);
  };

  // ── Diff-Felder ermitteln ─────────────────────────────────────────
  const getDiffFields = (incoming: VehicleRecord, existing: VehicleRecord) => {
    const allKeys = new Set([...Object.keys(incoming), ...Object.keys(existing)].filter(k => !k.startsWith('_')));
    return Array.from(allKeys).filter(k => String(incoming[k] ?? '') !== String(existing[k] ?? ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));

  if (!canImport) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Lock className="w-10 h-10 opacity-40" />
        <p className="text-base font-medium">{t('common.noPermission')}</p>
        <p className="text-sm">{t('common.contactAdmin')}</p>
      </div>
    );
  }

  const replaceCount = Object.values(actions).filter(a => a === 'replace').length;
  const mergeCount   = Object.values(actions).filter(a => a === 'merge').length;
  const skipCount    = Object.values(actions).filter(a => a === 'skip').length;

  return (
    <>
    <div className="max-w-3xl mx-auto p-3 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          {t('import.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('import.subtitle')}</p>
      </div>

      {/* Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-all duration-200 cursor-pointer ${
          dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${dragging ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {loading
              ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Upload className="w-6 h-6" /></motion.div>
              : <Upload className="w-6 h-6" />
            }
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">
              {loading ? t('import.processing') : t('import.dropHint')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('import.dropOr')} <span className="text-primary underline underline-offset-2">{t('import.dropSelect')}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">{t('import.dropTypes')}</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </CardContent>
      </Card>

      {/* Info-Box */}
      <Card className="mt-4 border-border bg-muted/30">
        <CardContent className="flex gap-3 py-4">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong className="text-foreground">{t('import.infoFormat1Title')}</strong> {t('import.infoFormat1')}</p>
            <p><strong className="text-foreground">{t('import.infoFormat2Title')}</strong> {t('import.infoFormat2')}</p>
            <p>{t('import.infoMerge')}</p>
            <p className="pt-1 border-t border-border/50 text-xs">
              <strong className="text-foreground">{t('import.infoMappingTitle')}</strong>{' '}
              <span className="font-mono bg-muted px-1 rounded">Net damage amount</span>{' '}
              {t('import.infoMappingText')}{' '}
              <span className="font-mono bg-muted px-1 rounded">Reparaturkosten netto</span>{' '}
              {t('import.infoMappingText2')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Fehler */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-4 flex items-start gap-3 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
            <button className="ml-auto" onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ergebnis */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="mt-4 border-accent/30 bg-accent/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{t('import.successTitle')} <span className="font-mono text-sm">{result.fileName}</span></p>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <Badge variant="secondary" className="gap-1">
                        <Plus className="w-3 h-3" /> {t('import.newVehicles', { count: result.newCount })}
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Merge className="w-3 h-3" /> {t('import.updated', { count: result.updatedCount })}
                      </Badge>
                      {result.newColumns.length > 0 && (
                        <Badge variant="outline" className="gap-1 text-accent border-accent/30">
                          {t('import.newColumns', { count: result.newColumns.length })} {result.newColumns.slice(0, 3).join(', ')}{result.newColumns.length > 3 ? '…' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setResult(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import-Historie */}
      {fleetData.importHistory.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            {t('import.historyTitle')}
          </h2>
          <div className="space-y-2">
            {fleetData.importHistory.map((session: ImportSession) => (
              <Card key={session.id} className="border-border">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{session.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(session.importedAt)}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{t('import.entries', { count: session.recordCount })}</Badge>
                  {session.newColumns.length > 0 && (
                    <Badge variant="outline" className="text-xs shrink-0 text-accent border-accent/30">
                      {t('import.columns', { count: session.newColumns.length })}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* ── Duplikat-Dialog ─────────────────────────────────────────── */}
    <Dialog open={showDupDialog} onOpenChange={v => { if (!v) setShowDupDialog(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Duplikate erkannt – {duplicates.length} Fahrzeug{duplicates.length !== 1 ? 'e' : ''} bereits vorhanden
          </DialogTitle>
          <DialogDescription>
            Die Datei <strong className="text-foreground">{pendingFile}</strong> enthält{' '}
            <strong>{duplicates.length}</strong> bereits vorhandene VIN{duplicates.length !== 1 ? 's' : ''}{' '}
            und <strong>{newCount}</strong> neue Fahrzeuge.
            Wähle für jedes Duplikat, ob die vorhandenen Daten ersetzt oder übersprungen werden sollen.
          </DialogDescription>
        </DialogHeader>

        {/* Schnellauswahl */}
        <div className="flex items-center gap-2 py-2 border-b border-border">
          <span className="text-xs text-muted-foreground mr-1">Alle:</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
            onClick={() => setAllActions('merge')}>
            <Merge className="w-3 h-3" /> Alle zusammenführen
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
            onClick={() => setAllActions('replace')}>
            <RefreshCw className="w-3 h-3" /> Alle ersetzen
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-muted-foreground"
            onClick={() => setAllActions('skip')}>
            <SkipForward className="w-3 h-3" /> Alle überspringen
          </Button>
          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {mergeCount   > 0 && <span className="text-blue-700 font-medium">{mergeCount} zusammenführen</span>}
            {mergeCount   > 0 && (replaceCount > 0 || skipCount > 0) && ' · '}
            {replaceCount > 0 && <span className="text-green-700 font-medium">{replaceCount} ersetzen</span>}
            {replaceCount > 0 && skipCount > 0 && ' · '}
            {skipCount    > 0 && <span className="text-muted-foreground">{skipCount} überspringen</span>}
          </span>
        </div>

        {/* Duplikat-Liste */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {duplicates.map(({ incoming, existing }) => {
            const vin    = String(incoming.vin);
            const action = actions[vin] ?? 'replace';
            const isOpen = expandedVin === vin;
            const diffs  = getDiffFields(incoming, existing);
            const label  = `${String(incoming['Hersteller'] ?? '')} ${String(incoming['Haupttyp'] ?? '')}`.trim() || vin;

            return (
              <div key={vin}
                className={`rounded-lg border transition-colors ${action === 'replace' ? 'border-green-300 bg-green-50/50' : action === 'merge' ? 'border-blue-300 bg-blue-50/50' : 'border-border bg-muted/30'}`}>

                {/* Kopfzeile */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{vin}</p>
                  </div>

                  {/* Geänderte Felder Badge */}
                  {diffs.length > 0 ? (
                    <Badge variant="outline" className="text-xs shrink-0 cursor-pointer hover:bg-muted"
                      onClick={() => setExpandedVin(isOpen ? null : vin)}>
                      {diffs.length} Feld{diffs.length !== 1 ? 'er'  : ''} geändert
                      {isOpen ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                      Identisch
                    </Badge>
                  )}

                  {/* Aktion wählen */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setActions(a => ({ ...a, [vin]: 'merge' }))}
                      title="Bestehende Felder behalten, neue/geänderte Felder ergänzen"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        action === 'merge'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-border text-muted-foreground hover:border-blue-400 hover:text-blue-700'
                      }`}
                    >
                      <Merge className="w-3 h-3" /> Zusammenführen
                    </button>
                    <button
                      onClick={() => setActions(a => ({ ...a, [vin]: 'replace' }))}
                      title="Vorhandene Daten komplett mit den neuen Daten ersetzen"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        action === 'replace'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'border-border text-muted-foreground hover:border-green-400 hover:text-green-700'
                      }`}
                    >
                      <RefreshCw className="w-3 h-3" /> Ersetzen
                    </button>
                    <button
                      onClick={() => setActions(a => ({ ...a, [vin]: 'skip' }))}
                      title="Dieses Fahrzeug beim Import überspringen"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        action === 'skip'
                          ? 'bg-muted text-foreground border-border'
                          : 'border-border text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      <SkipForward className="w-3 h-3" /> Überspringen
                    </button>
                  </div>
                </div>

                {/* Diff-Tabelle (aufklappbar) */}
                <AnimatePresence>
                  {isOpen && diffs.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border/40">
                      <div className="px-3 pb-3 pt-2">
                        <p className="text-[11px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wide">{action === 'merge' ? 'Felder mit neuen Werten (leere Felder bleiben erhalten)' : 'Unterschiede (Vorhanden → Komplett ersetzt durch Neu)'}</p>
                        <table className="w-full">
                          <tbody>
                            {diffs.map(key => (
                              <DiffRow key={key} label={key}
                                oldVal={existing[key]} newVal={incoming[key]} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground flex-1">
            {newCount > 0 && <span className="text-blue-600 font-medium">+ {newCount} neue Fahrzeuge werden hinzugefügt</span>}
          </div>
          <Button variant="outline" onClick={() => { setShowDupDialog(false); setPendingAll([]); }}>
            Abbrechen
          </Button>
          <Button onClick={confirmDuplicates}
            className="gap-2"
            disabled={replaceCount === 0 && mergeCount === 0 && newCount === 0}>
            <Upload className="w-4 h-4" />
            {`${[mergeCount > 0 ? mergeCount + ' zusammenführen' : '', replaceCount > 0 ? replaceCount + ' ersetzen' : '', skipCount > 0 ? skipCount + ' überspringen' : ''].filter(Boolean).join(', ')}${newCount > 0 ? ' + ' + newCount + ' neue' : ''} importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
