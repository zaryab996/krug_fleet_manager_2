import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Upload, CheckCircle2, XCircle, AlertTriangle, ArrowLeft,
  FileText, ImageIcon, File as FileIcon, ChevronDown, ChevronRight, Loader2,
  FolderUp, SkipForward, RotateCcw, Info, Plus, Trash2, FolderPlus, Lock,
} from 'lucide-react';
import { Button }                                      from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle }    from '@/components/ui/card';
import { Badge }                                       from '@/components/ui/badge';
import { useFleetStore, useDocsStore, useVehicleHistoryStore, useAuthStore, useDocPermStore } from '@/hooks/useStore';
import { saveFile }                                    from '@/lib/fileStorage';
import { generateId, ROUTE_PATHS }                     from '@/lib/index';
import type { VehicleDocument, DocumentFileType }      from '@/lib/types';
import { generateAndSaveVehicleQR, hasQRDocument }     from '@/lib/qrCodeUtils';

// ─── Typen ────────────────────────────────────────────────────────────
interface FolderGroup {
  vin: string;
  matched: boolean;
  files: File[];
  expanded: boolean;
}
interface ImportResult {
  vin: string;
  success: number;
  failed: number;
  errors: string[];
}
type Step = 'collect' | 'importing' | 'done';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────

function extractVin(relativePath: string, knownVins: Set<string>): string | null {
  const parts = relativePath.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    if (knownVins.has(parts[i].trim())) return parts[i].trim();
  }
  if (parts.length >= 2) return parts[0].trim();
  return null;
}

function fileIconEl(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-3.5 h-3.5 text-blue-400" />;
  if (mimeType === 'application/pdf')  return <FileText  className="w-3.5 h-3.5 text-red-400"  />;
  return <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />;
}

function fmtBytes(b: number) {
  if (b < 1024)          return `${b} B`;
  if (b < 1024 * 1024)   return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** Rekursives Einlesen eines Drag-&-Drop-Verzeichniseintrags */
async function readDirEntry(entry: FileSystemDirectoryEntry, prefix = ''): Promise<File[]> {
  const out: File[] = [];
  const reader = entry.createReader();
  await new Promise<void>(resolve => {
    const read = () =>
      reader.readEntries(async entries => {
        if (!entries.length) { resolve(); return; }
        for (const e of entries) {
          const relPath = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.isFile) {
            await new Promise<void>(r =>
              (e as FileSystemFileEntry).file(f => {
                Object.defineProperty(f, 'webkitRelativePath', {
                  value: `${entry.name}/${relPath}`,
                  writable: false, configurable: true,
                });
                out.push(f); r();
              })
            );
          } else if (e.isDirectory) {
            out.push(...await readDirEntry(e as FileSystemDirectoryEntry, relPath));
          }
        }
        read();
      });
    read();
  });
  return out;
}

// ─── Hauptkomponente ──────────────────────────────────────────────────
export default function FolderUploadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { fleetData, getVehicle }   = useFleetStore();
  const { addDocument, documents } = useDocsStore();
  const { addEntry: addHistory } = useVehicleHistoryStore();
  const { currentUser } = useAuthStore();
  const { getPermission } = useDocPermStore();

  const myPerm = currentUser ? getPermission(currentUser.id, currentUser.role) : null;
  const canBulkUpload = currentUser?.role === 'admin' || !!myPerm?.canBulkUpload;

  const [step,       setStep]       = useState<Step>('collect');
  /** Akkumulierte Gruppen – werden durch mehrere Auswahlen erweitert */
  const [groups,     setGroups]     = useState<FolderGroup[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress,   setProgress]   = useState({ current: 0, total: 0, vin: '' });
  const [results,    setResults]    = useState<ImportResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const knownVins = useMemo(
    () => new Set(fleetData.records.map(r => String(r.vin).trim())),
    [fleetData.records],
  );

  // ── Dateien in bestehende Gruppen einmergen ───────────────────────
  const mergeFiles = useCallback((newFiles: File[]) => {
    if (!newFiles.length) return;

    // Neue Dateien nach VIN gruppieren
    const incoming = new Map<string, File[]>();
    newFiles.forEach(file => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const vin = extractVin(rel, knownVins) ?? rel.split('/')[0];
      if (!vin) return;
      if (!incoming.has(vin)) incoming.set(vin, []);
      incoming.get(vin)!.push(file);
    });

    setGroups(prev => {
      const updated = [...prev];
      incoming.forEach((files, vin) => {
        const existing = updated.find(g => g.vin === vin);
        if (existing) {
          // Dateien hinzufügen, Duplikate (gleicher Name) überspringen
          const existingNames = new Set(existing.files.map(f => f.name));
          const fresh = files.filter(f => !existingNames.has(f.name));
          existing.files = [...existing.files, ...fresh];
        } else {
          updated.push({ vin, matched: knownVins.has(vin), files, expanded: false });
        }
      });
      // Sortierung: matched zuerst, dann alphabetisch
      return updated.sort((a, b) => {
        if (a.matched !== b.matched) return a.matched ? -1 : 1;
        return a.vin.localeCompare(b.vin);
      });
    });
  }, [knownVins]);

  // ── Input-Handler ─────────────────────────────────────────────────
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      mergeFiles(Array.from(e.target.files));
    }
    // Reset damit dieselbe Ordnerauswahl erneut ausgelöst werden kann
    e.target.value = '';
  };

  // ── Drag & Drop ───────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    // nur wenn der Cursor die Zone wirklich verlässt
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const allFiles: File[] = [];
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        allFiles.push(...await readDirEntry(entry as FileSystemDirectoryEntry));
      } else if (entry?.isFile) {
        await new Promise<void>(r =>
          (entry as FileSystemFileEntry).file(f => { allFiles.push(f); r(); }));
      }
    }
    if (allFiles.length)                   mergeFiles(allFiles);
    else if (e.dataTransfer.files.length)  mergeFiles(Array.from(e.dataTransfer.files));
  };

  // ── Gruppe / Datei entfernen ─────────────────────────────────────
  const removeGroup = (vin: string) =>
    setGroups(gs => gs.filter(g => g.vin !== vin));

  const toggleExpand = (vin: string) =>
    setGroups(gs => gs.map(g => g.vin === vin ? { ...g, expanded: !g.expanded } : g));

  // ── Import ────────────────────────────────────────────────────────
  const handleImport = async () => {
    const toImport   = groups.filter(g => g.matched);
    const totalFiles = toImport.reduce((s, g) => s + g.files.length, 0);
    setStep('importing');
    setProgress({ current: 0, total: totalFiles, vin: '' });

    const importResults: ImportResult[] = [];
    let done = 0;

    for (const group of toImport) {
      const res: ImportResult = { vin: group.vin, success: 0, failed: 0, errors: [] };
      setProgress(p => ({ ...p, vin: group.vin }));

      for (const file of group.files) {
        try {
          const buffer   = await file.arrayBuffer();
          const docId    = generateId();
          // MIME aus Dateiname ableiten wenn Browser keinen liefert
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          const mimeFromExt: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
            heif: 'image/heif', bmp: 'image/bmp', tiff: 'image/tiff',
            tif: 'image/tiff', svg: 'image/svg+xml',
            pdf: 'application/pdf',
          };
          const mimeType = file.type || mimeFromExt[ext] || 'application/octet-stream';
          const fileType: DocumentFileType = mimeType.startsWith('image/') ? 'image' : 'pdf';

          console.log('[FolderUpload] saving file', { name: file.name, size: file.size, mimeType, docId });
          await saveFile(docId, buffer);

          // vehicleRowId aus dem Fahrzeug-Record – damit getVehicleDocs (strict) funktioniert
          const vehicleRecord = getVehicle(group.vin);
          const vehicleRowId  = vehicleRecord?._rowId ? String(vehicleRecord._rowId) : undefined;

          const doc: VehicleDocument = {
            id: docId, vehicleVin: group.vin,
            vehicleRowId,
            label: file.name, originalFileName: file.name,
            fileType, mimeType, size: file.size,
            uploadedAt: new Date().toISOString(), storageKey: docId,
          };
          addDocument(doc);
          res.success++;
        } catch (err) {
          res.failed++;
          res.errors.push(`${file.name}: ${String(err)}`);
        }
        done++;
        setProgress({ current: done, total: totalFiles, vin: group.vin });
        if (done % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      importResults.push(res);
    }

    // History-Einträge je VIN schreiben
    importResults.forEach(res => {
      if (res.success > 0) {
        const group = toImport.find(g => g.vin === res.vin);
        const fileNames = (group?.files ?? []).map(f => f.name).slice(0, 20);
        addHistory({
          vehicleVin: res.vin,
          type: 'bulk_upload',
          timestamp: new Date().toISOString(),
          userId: currentUser?.id ?? 'system',
          userName: currentUser?.name ?? 'System',
          bulkFileCount: res.success,
          bulkFileNames: fileNames,
        });
      }
    });

    setResults(importResults);
    setStep('done');

    // QR-Codes für alle importierten Fahrzeuge generieren (im Hintergrund)
    importResults.forEach(async (res) => {
      if (res.success > 0) {
        try {
          if (!hasQRDocument(res.vin, documents)) {
            const { document: qrDoc } = await generateAndSaveVehicleQR(res.vin);
            addDocument(qrDoc);
          }
        } catch (e) {
          console.warn('QR-Code konnte nicht erstellt werden für', res.vin, e);
        }
      }
    });
  };

  // ── Statistiken ──────────────────────────────────────────────────
  const matchedCount   = groups.filter(g =>  g.matched).length;
  const unmatchedCount = groups.filter(g => !g.matched).length;
  const matchedFiles   = groups.filter(g =>  g.matched).reduce((s, g) => s + g.files.length, 0);
  const totalFiles     = groups.reduce((s, g) => s + g.files.length, 0);
  const pct            = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const totalSuccess   = results.reduce((s, r) => s + r.success, 0);
  const totalFailed    = results.reduce((s, r) => s + r.failed,  0);

  const isEmpty = groups.length === 0;

  // ─────────────────────────────────────────────────────────────────
  // ── Zugriff gesperrt ──────────────────────────────────────────────
  if (!canBulkUpload) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Lock className="w-10 h-10 opacity-40" />
        <p className="text-base font-medium">{t('common.noPermission')}</p>
        <p className="text-sm">{t('common.contactAdmin')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 pb-24 md:p-6 md:pb-12">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTE_PATHS.VEHICLES)}
          className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderUp className="w-5 h-5 text-primary" /> {t('folderUpload.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('folderUpload.subtitle')}
          </p>
        </div>
      </div>

      {/* ── SCHRITT: SAMMELN ─────────────────────────────────────── */}
      {step === 'collect' && (
        <div className="space-y-4">

          {/* Hinweis (nur wenn noch leer) */}
          <AnimatePresence>
            {isEmpty && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{t('folderUpload.infoTitle')}</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                      <li>{t('folderUpload.infoStep1')}</li>
                      <li>{t('folderUpload.infoStep2')}</li>
                      <li>{t('folderUpload.infoStep3')}</li>
                    </ol>
                    <p className="text-xs text-blue-600 mt-1">
                      {t('folderUpload.infoTip')}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Drop-Zone ──────────────────────────────────────────── */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl transition-all duration-200
              ${isDragOver
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : isEmpty
                  ? 'border-border hover:border-primary/50 hover:bg-muted/20 cursor-pointer'
                  : 'border-border/60 bg-muted/10'}`}
            onClick={isEmpty ? () => inputRef.current?.click() : undefined}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              // @ts-expect-error webkitdirectory fehlt in TS-Typen
              webkitdirectory="true"
              multiple
              onChange={handleInput}
            />

            {isEmpty ? (
              /* Leerer Zustand – große Zone */
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
                <motion.div
                  animate={isDragOver ? { scale: 1.15 } : { scale: 1 }}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center
                    ${isDragOver ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  <FolderOpen className="w-8 h-8" />
                </motion.div>
                <div className="text-center">
                  <p className="text-base font-semibold">
                    {isDragOver ? t('folderUpload.dropRelease') : t('folderUpload.dropHint')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('folderUpload.dropSub')}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {t('folderUpload.vehicleCount', { count: fleetData.records.length })}
                </Badge>
              </div>
            ) : (
              /* Gefüllter Zustand – kompakte Zone als Einschub-Bereich */
              <div className={`flex items-center gap-3 px-4 py-3 transition-colors
                ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                  ${isDragOver ? 'bg-primary/10' : 'bg-muted'}`}>
                  <FolderPlus className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {isDragOver ? t('folderUpload.dropRelease') : t('folderUpload.addMore')}
                  </p>
                  <p className="text-xs">{t('folderUpload.dropSub')}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('folderUpload.selectFolder')}
                </Button>
              </div>
            )}
          </div>

          {/* ── Ordner-Liste ──────────────────────────────────────── */}
          <AnimatePresence>
            {!isEmpty && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* Statistik */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: t('folderUpload.statsTotal'),   value: groups.length,   color: '' },
                    { label: t('folderUpload.statsMatched'),  value: matchedCount,    color: 'text-green-600',
                      icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
                    { label: t('folderUpload.statsFiles'),    value: matchedFiles,    color: 'text-primary' },
                  ].map(s => (
                    <Card key={s.label} className="border-border">
                      <CardContent className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {s.icon}
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                        <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Ordner-Tabelle */}
                <Card className="border-border">
                  <CardHeader className="py-2.5 px-4 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm">
                      {t('folderUpload.foldersTotal', { count: groups.length, files: totalFiles })}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => setGroups([])}
                    >
                      <Trash2 className="w-3 h-3" /> {t('folderUpload.removeAll')}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                      {groups.map(group => (
                        <div key={group.vin} className={group.matched ? '' : 'opacity-50'}>

                          {/* Zeilen-Kopf */}
                          <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/10 group/row">
                            <button
                              className="flex-none"
                              onClick={() => toggleExpand(group.vin)}
                            >
                              {group.expanded
                                ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>

                            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0
                              ${group.matched ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
                              onClick={() => toggleExpand(group.vin)}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </div>

                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(group.vin)}>
                              <span className="text-sm font-mono font-medium truncate block">{group.vin}</span>
                              <span className="text-xs text-muted-foreground">
                                {group.files.length} · {fmtBytes(group.files.reduce((s, f) => s + f.size, 0))}
                              </span>
                            </div>

                            {group.matched
                              ? <Badge className="text-xs bg-green-100 text-green-700 border border-green-200 shrink-0 gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> {t('folderUpload.folderFound')}
                                </Badge>
                              : <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 shrink-0 gap-1">
                                  <XCircle className="w-3 h-3" /> {t('folderUpload.folderNoMatch')}
                                </Badge>}

                            {/* Löschen-Button – nur im Hover sichtbar */}
                            <button
                              onClick={() => removeGroup(group.vin)}
                              className="w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-100
                                text-muted-foreground hover:text-destructive transition-opacity"
                              title={t('folderUpload.removeFolder')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Datei-Liste */}
                          <AnimatePresence>
                            {group.expanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="pl-14 pr-4 pb-2.5 pt-1 space-y-0.5 bg-muted/10">
                                  {group.files.map((file, i) => (
                                    <div key={i} className="flex items-center gap-2 py-0.5">
                                      {fileIconEl(file.type)}
                                      <span className="text-xs text-foreground truncate flex-1">{file.name}</span>
                                      <span className="text-xs text-muted-foreground shrink-0">{fmtBytes(file.size)}</span>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Warnung nicht zugeordneter Ordner */}
                {unmatchedCount > 0 && (
                  <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <SkipForward className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {t('folderUpload.unmatchedWarning', { count: unmatchedCount })}
                    </span>
                  </div>
                )}

                {/* Import-Aktionsleiste */}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-sm text-muted-foreground">
                    {t('folderUpload.importSummary', { vehicles: matchedCount, files: matchedFiles })}
                  </p>
                  <Button
                    onClick={handleImport}
                    disabled={matchedCount === 0}
                    className="gap-1.5"
                  >
                    <Upload className="w-4 h-4" /> {t('folderUpload.startImport')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {fleetData.records.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('folderUpload.noVehiclesWarning')}
            </div>
          )}
        </div>
      )}

      {/* ── SCHRITT: IMPORT LÄUFT ─────────────────────────────────── */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-semibold">{t('folderUpload.importing')}</p>
            <p className="text-sm text-muted-foreground">
              {t('folderUpload.importingProgress', { current: progress.current, total: progress.total })}
              {progress.vin && <>{t('folderUpload.importingVin', { vin: progress.vin })}</>}
            </p>
          </div>
          <div className="w-full max-w-sm">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ ease: 'linear' }}
              />
            </div>
            <p className="text-xs text-right text-muted-foreground mt-1">{pct} %</p>
          </div>
        </div>
      )}

      {/* ── SCHRITT: ERGEBNIS ────────────────────────────────────── */}
      {step === 'done' && (
        <div className="space-y-5">

          <div className={`flex items-center gap-4 p-5 rounded-xl border-2
            ${totalFailed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0
              ${totalFailed === 0 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              {totalFailed === 0 ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <p className="font-semibold text-base">
                {totalFailed === 0 ? t('folderUpload.doneSuccess') : t('folderUpload.doneWarning')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('folderUpload.doneImported', { success: totalSuccess })}
                {totalFailed > 0 && <>, {t('folderUpload.doneFailed', { failed: totalFailed })}</>}
                {' · '}{t('folderUpload.doneVehicles', { count: results.length })}
              </p>
            </div>
          </div>

          <Card className="border-border">
            <CardContent className="p-0">
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                {results.map(r => (
                  <div key={r.vin} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                      ${r.failed === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-600'}`}>
                      {r.failed === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </div>
                    <span className="font-mono text-sm flex-1 truncate">{r.vin}</span>
                    <span className="text-xs text-green-600 font-medium">{r.success} {t('folderUpload.imported')}</span>
                    {r.failed > 0 && <span className="text-xs text-red-500 font-medium">{r.failed} {t('folderUpload.errors')}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="text-sm text-muted-foreground bg-muted/30 border border-border rounded-lg px-3 py-2.5">
            {t('folderUpload.doneHint')}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="outline"
              onClick={() => { setGroups([]); setResults([]); setStep('collect'); }}
              className="gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> {t('folderUpload.anotherImport')}
            </Button>
            <Button onClick={() => navigate(ROUTE_PATHS.VEHICLES)} className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {t('folderUpload.toVehicles')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
