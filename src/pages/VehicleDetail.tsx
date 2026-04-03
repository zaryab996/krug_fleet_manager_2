import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadSingleAkte } from '@/lib/downloadUtils';
import {
  ArrowLeft, Car, Edit2, Edit3, Save, X, Trash2, AlertTriangle,
  Paperclip, Upload, FileText, ImageIcon, Download, Eye,
  ZoomIn, ChevronLeft, ChevronRight, Loader2, Plus, Palette,
  PackageOpen, ExternalLink, Check, History, MessageSquare,
  FolderUp, CheckCircle2, Mail, Send, Inbox, Reply, CornerUpLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFleetStore, useAuthStore, useDocsStore, useDocPermStore, useColumnConfigStore, useVehicleHistoryStore, useVehicleNotesStore, useVehicleAccessStore, useCustomColumnsStore, useVehicleMailStore } from '@/hooks/useStore';
import { getVehicleEmail, sendVehicleMail } from '@/lib/vehicleMailUtils';
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';
import { useColumnLabel } from '@/hooks/useColumnLabel';
import { formatCurrency, ROUTE_PATHS, generateId, formatDate } from '@/lib/index';
import {
  saveFile, loadFile, downloadBuffer,
  arrayBufferToBlobUrl, arrayBufferToDataUrl, formatFileSize
} from '@/lib/fileStorage';
import type { VehicleDocument, VehicleRecord } from '@/lib/types';

// ─── Farbpalette ──────────────────────────────────────────────────────
const COLOR_PALETTE = [
  { value: '#ef444420', label: 'Rot',      border: '#ef4444' },
  { value: '#f9731620', label: 'Orange',   border: '#f97316' },
  { value: '#eab30820', label: 'Gelb',     border: '#eab308' },
  { value: '#22c55e20', label: 'Grün',     border: '#22c55e' },
  { value: '#06b6d420', label: 'Cyan',     border: '#06b6d4' },
  { value: '#3b82f620', label: 'Blau',     border: '#3b82f6' },
  { value: '#8b5cf620', label: 'Violett',  border: '#8b5cf6' },
  { value: '#ec489920', label: 'Pink',     border: '#ec4899' },
  { value: '#64748b20', label: 'Grau',     border: '#64748b' },
];

const CURRENCY_KEYS = [
  'reparaturkosten netto',
  'wbwert netto',
  'market value excluding vat',
  'market value excl. vat',
  'market value excl vat',
];
function isCurrencyKey(key: string): boolean {
  return CURRENCY_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()));
}

// ─── PDF-Viewer Dialog ─────────────────────────────────────────────────
interface PdfViewerProps {
  doc: VehicleDocument;
  onClose: () => void;
}
function PdfViewer({ doc, onClose }: PdfViewerProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoke: string | null = null;
    loadFile(doc.storageKey).then(buf => {
      if (buf) {
        // Data-URL für <embed> (Chrome-kompatibel, kein Iframe-Block)
        setDataUrl(arrayBufferToDataUrl(buf, doc.mimeType));
        // Blob-URL nur für "Neuer Tab"-Button
        revoke = arrayBufferToBlobUrl(buf, doc.mimeType);
        setBlobUrl(revoke);
      }
      setLoading(false);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [doc]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-6 py-3 bg-black/60 shrink-0">
        <div>
          <p className="text-white font-medium text-sm">{doc.label}</p>
          <p className="text-white/50 text-xs">{doc.originalFileName} · {formatFileSize(doc.size)}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Im neuen Tab öffnen (Blob-URL – funktioniert immer) */}
          {blobUrl && (
            <Button
              variant="ghost" size="sm"
              className="text-white/70 hover:text-white gap-1.5"
              onClick={e => { e.stopPropagation(); window.open(blobUrl, '_blank'); }}
            >
              <ExternalLink className="w-4 h-4" /> Neuer Tab
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            className="text-white/70 hover:text-white gap-1.5"
            onClick={async e => {
              e.stopPropagation();
              const buf = await loadFile(doc.storageKey);
              if (buf) downloadBuffer(buf, doc.mimeType, doc.originalFileName);
            }}
          >
            <Download className="w-4 h-4" /> Herunterladen
          </Button>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors ml-2">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
        {loading ? (
          <Loader2 className="w-10 h-10 text-white/50 animate-spin" />
        ) : dataUrl ? (
          <embed
            src={dataUrl}
            type="application/pdf"
            className="w-full h-full"
            title={doc.label}
          />
        ) : (
          <div className="text-center text-white/60 space-y-3">
            <FileText className="w-12 h-12 mx-auto opacity-40" />
            <p className="text-sm">Vorschau nicht verfügbar</p>
            {blobUrl && (
              <Button variant="secondary" size="sm" onClick={() => window.open(blobUrl, '_blank')} className="gap-1.5">
                <ExternalLink className="w-4 h-4" /> Im Browser öffnen
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lightbox für Bilder ──────────────────────────────────────────────
interface LightboxProps { images: VehicleDocument[]; startIndex: number; onClose: () => void; }
function Lightbox({ images, startIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIndex);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url: string | null = null;
    setLoading(true); setBlobUrl(null);
    loadFile(images[idx].storageKey).then(buf => {
      if (buf) { url = arrayBufferToBlobUrl(buf, images[idx].mimeType); setBlobUrl(url); }
      setLoading(false);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [idx, images]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [images.length, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center" onClick={onClose}>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/60 to-transparent z-10">
        <div>
          <p className="text-white font-medium text-sm">{images[idx].label}</p>
          <p className="text-white/50 text-xs">{images[idx].originalFileName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs">{idx + 1} / {images.length}</span>
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white gap-1"
            onClick={async e => {
              e.stopPropagation();
              const buf = await loadFile(images[idx].storageKey);
              if (buf) downloadBuffer(buf, images[idx].mimeType, images[idx].originalFileName);
            }}>
            <Download className="w-4 h-4" />
          </Button>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      </div>
      <div className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {loading ? <Loader2 className="w-10 h-10 text-white/50 animate-spin" />
          : blobUrl ? <img src={blobUrl} alt={images[idx].label} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
          : <p className="text-white/50">Vorschau nicht verfügbar</p>}
      </div>
      {images.length > 1 && (
        <>
          <button className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            onClick={e => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }} disabled={idx === 0}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            onClick={e => { e.stopPropagation(); setIdx(i => Math.min(images.length - 1, i + 1)); }} disabled={idx === images.length - 1}>
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Upload-Dialog (Multi-Datei) ───────────────────────────────────────
interface QueuedFile { file: File; label: string; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string; }
interface UploadDialogProps {
  vin: string; open: boolean; onClose: () => void;
  canUploadPdf: boolean; canUploadImage: boolean;
  onUploaded?: (label: string, fileName: string, mimeType: string, size: number) => void;
}
function UploadDialog({ vin, open, onClose, canUploadPdf, canUploadImage, onUploaded }: UploadDialogProps) {
  const { t } = useTranslation();
  const { addDocument } = useDocsStore();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // accept-Attribut je nach Berechtigung
  const acceptAttr = [
    canUploadPdf ? '.pdf' : '',
    canUploadImage ? 'image/*' : '',
  ].filter(Boolean).join(',');

  const resetForm = () => { setQueue([]); };
  const handleClose = () => { resetForm(); onClose(); };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const ALLOWED_PDF = ['application/pdf'];
    const ALLOWED_IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    const newItems: QueuedFile[] = [];
    Array.from(files).forEach(f => {
      const isPdf = ALLOWED_PDF.includes(f.type);
      const isImg = ALLOWED_IMG.includes(f.type);
      if (isPdf && !canUploadPdf) return;
      if (isImg && !canUploadImage) return;
      if (!isPdf && !isImg) return;
      if (f.size > 50 * 1024 * 1024) { newItems.push({ file: f, label: f.name.replace(/\.[^.]+$/, ''), status: 'error', error: 'Max. 50 MB' }); return; }
      newItems.push({ file: f, label: f.name.replace(/\.[^.]+$/, ''), status: 'pending' });
    });
    setQueue(prev => [...prev, ...newItems]);
  };

  const updateLabel = (idx: number, label: string) =>
    setQueue(prev => prev.map((q, i) => i === idx ? { ...q, label } : q));

  const removeFromQueue = (idx: number) =>
    setQueue(prev => prev.filter((_, i) => i !== idx));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleUploadAll = async () => {
    const pending = queue.filter(q => q.status === 'pending');
    if (pending.length === 0) return;
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'pending') continue;
      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading' } : q));
      try {
        const q = queue[i];
        const id = generateId();
        const label = q.label.trim() || q.file.name.replace(/\.[^.]+$/, '');
        await saveFile(id, await q.file.arrayBuffer());
        addDocument({
          id, vehicleVin: vin,
          label,
          originalFileName: q.file.name,
          fileType: q.file.type === 'application/pdf' ? 'pdf' : 'image',
          mimeType: q.file.type, size: q.file.size,
          uploadedAt: new Date().toISOString(), storageKey: id,
        });
        onUploaded?.(label, q.file.name, q.file.type, q.file.size);
        setQueue(prev => prev.map((qItem, idx) => idx === i ? { ...qItem, status: 'done' } : qItem));
      } catch {
        setQueue(prev => prev.map((qItem, idx) => idx === i ? { ...qItem, status: 'error', error: 'Speicherfehler' } : qItem));
      }
    }
    setUploading(false);
    // Wenn alle fertig → nach kurzer Pause schließen
    setTimeout(() => { resetForm(); onClose(); }, 800);
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" /> Dateien hochladen
          </DialogTitle>
          <DialogDescription>
            Mehrere Dateien gleichzeitig auswählen oder per Drag & Drop hinzufügen.
            {!canUploadPdf && <span className="text-yellow-600 ml-1">· PDFs nicht erlaubt</span>}
            {!canUploadImage && <span className="text-yellow-600 ml-1">· Bilder nicht erlaubt</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Drop-Zone */}
        <div
          className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors hover:border-primary/60 hover:bg-primary/5 border-border"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Paperclip className="w-8 h-8 opacity-40" />
            <p className="text-sm font-medium">Klicken oder Dateien hierher ziehen</p>
            <p className="text-xs opacity-70">
              {[canUploadPdf && 'PDF', canUploadImage && 'JPG, PNG, GIF, WebP'].filter(Boolean).join(' · ')} · max. 50 MB pro Datei
            </p>
          </div>
          <input
            ref={fileRef} type="file"
            accept={acceptAttr}
            multiple
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />
        </div>

        {/* Warteschlange */}
        {queue.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2 mt-1 pr-1">
            {queue.map((q, idx) => (
              <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm transition-colors ${
                q.status === 'done' ? 'border-green-200 bg-green-50/60' :
                q.status === 'error' ? 'border-red-200 bg-red-50/60' :
                q.status === 'uploading' ? 'border-primary/30 bg-primary/5' :
                'border-border bg-card'
              }`}>
                {/* Icon */}
                <div className="shrink-0">
                  {q.status === 'done' ? <Check className="w-4 h-4 text-green-500" /> :
                   q.status === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500" /> :
                   q.status === 'uploading' ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> :
                   q.file.type === 'application/pdf'
                     ? <FileText className="w-4 h-4 text-red-400" />
                     : <ImageIcon className="w-4 h-4 text-blue-400" />}
                </div>
                {/* Label-Eingabe */}
                <div className="flex-1 min-w-0">
                  {q.status === 'pending' ? (
                    <Input
                      value={q.label}
                      onChange={e => updateLabel(idx, e.target.value)}
                      placeholder="Bezeichnung …"
                      className="h-7 text-xs"
                    />
                  ) : (
                    <p className="text-xs font-medium truncate">{q.label || q.file.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{q.file.name} · {formatFileSize(q.file.size)}</p>
                  {q.error && <p className="text-xs text-red-500">{q.error}</p>}
                </div>
                {/* Entfernen */}
                {(q.status === 'pending' || q.status === 'error') && (
                  <button onClick={() => removeFromQueue(idx)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>Abbrechen</Button>
          <Button
            onClick={handleUploadAll}
            disabled={uploading || pendingCount === 0}
            className="gap-1.5"
          >
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wird hochgeladen …</>
              : <><Upload className="w-3.5 h-3.5" /> {pendingCount} Datei{pendingCount !== 1 ? 'en' : ''} hochladen</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Erkennt Mobile-Viewport */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

// ─── Dokument-Karte ────────────────────────────────────────────────────
interface DocCardProps { doc: VehicleDocument; onPreview: () => void; onDelete: () => void; canDelete: boolean; isAdmin?: boolean; }
function DocCard({ doc, onPreview, onDelete, canDelete, isAdmin }: DocCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (doc.fileType !== 'image') return;
    let url: string | null = null;
    loadFile(doc.storageKey).then(buf => { if (buf) { url = arrayBufferToBlobUrl(buf, doc.mimeType); setThumbUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const buf = await loadFile(doc.storageKey);
    if (buf) downloadBuffer(buf, doc.mimeType, doc.originalFileName);
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="group relative border border-border rounded-lg overflow-hidden bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
      onClick={onPreview}
    >
      <div className="h-32 bg-muted/40 flex items-center justify-center relative overflow-hidden">
        {doc.fileType === 'image' && thumbUrl ? (
          <img src={thumbUrl} alt={doc.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        ) : doc.fileType === 'pdf' ? (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <FileText className="w-10 h-10 text-red-400" />
            <span className="text-xs font-medium text-red-500">PDF</span>
          </div>
        ) : <ImageIcon className="w-10 h-10 text-muted-foreground/40" />}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button className="bg-white/90 text-foreground rounded-full p-1.5 hover:bg-white" onClick={e => { e.stopPropagation(); onPreview(); }}>
            {doc.fileType === 'pdf' ? <Eye className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </button>
          <button className="bg-white/90 text-foreground rounded-full p-1.5 hover:bg-white" onClick={handleDownload}>
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground truncate" title={doc.label}>{doc.label}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.originalFileName}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-muted-foreground">{formatFileSize(doc.size)}</span>
          <span className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
        </div>
      </div>
      {canDelete && (
        <button
          className={`absolute top-2 right-2 text-white rounded-full p-1 transition-all ${
            isAdmin
              ? 'bg-red-500/80 hover:bg-red-600 opacity-100 shadow-sm'
              : 'bg-black/50 hover:bg-red-500 opacity-0 group-hover:opacity-100'
          }`}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Dokument löschen"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

// ─── Haupt-Seite ───────────────────────────────────────────────────────
export default function VehicleDetailPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { vin } = useParams<{ vin: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle, deleteVehicle, setVehicleColor } = useFleetStore();
  const { currentUser } = useAuthStore();
  const { getVehicleDocs, deleteDocument } = useDocsStore();
  const { addEntry: addHistory, getVehicleHistory } = useVehicleHistoryStore();
  const { addNote, updateNote, deleteNote, getVehicleNotes } = useVehicleNotesStore();
  const { canSeeVehicle } = useVehicleAccessStore();
  const { columns: customCols } = useCustomColumnsStore();
  const getLabel = useColumnLabel();

  // ── Effektive Berechtigungen (Individual > Gruppe > Standard) ────
  const { docPerm, columnConfig: userColConfig } = useEffectivePermissions(
    currentUser?.id ?? '', currentUser?.role ?? 'viewer'
  );

  const decodedVin = decodeURIComponent(vin ?? '');
  const vehicle = getVehicle(decodedVin);
  // Zugriffsschutz: kein Zugriff wenn Benutzer dieses Fahrzeug nicht sehen darf
  const accessDenied = currentUser && currentUser.role !== 'admin'
    ? !canSeeVehicle(currentUser.id, currentUser.role, decodedVin)
    : false;
  const docs = getVehicleDocs(decodedVin);

  // Sichtbare Detail-Felder für diesen Nutzer (leer = alle)
  const visibleDetailFields = userColConfig?.visibleDetailFields ?? [];

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'editor';
  const canUpload = docPerm.canUploadPdf || docPerm.canUploadImage;
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showDelete, setShowDelete] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<VehicleDocument | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteAllDocsConfirm, setDeleteAllDocsConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Verlauf + Bemerkungen + E-Mail
  const historyEntries = getVehicleHistory(decodedVin);
  const vehicleNotes   = getVehicleNotes(decodedVin);
  const [activeTab, setActiveTab] = useState<'history' | 'notes' | 'mail'>('history');
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // E-Mail-System
  const { addMail, markRead, markAllRead, deleteMail, getMailsForVin } = useVehicleMailStore();
  const vehicleMails = getMailsForVin(decodedVin);
  const vehicleEmail = getVehicleEmail(decodedVin);
  const unreadCount  = vehicleMails.filter(m => m.direction === 'in' && !m.read).length;

  const [mailView, setMailView] = useState<'inbox' | 'sent' | 'compose' | 'read'>('inbox');
  const [selectedMail, setSelectedMail] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<'new' | 'reply'>('new');
  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailSendStatus, setMailSendStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [mailSendError, setMailSendError] = useState('');
  // Manuelle Eingangsmail
  const [showIncomingDialog, setShowIncomingDialog] = useState(false);
  const [inFromEmail, setInFromEmail] = useState('');
  const [inSubject, setInSubject] = useState('');
  const [inBody, setInBody] = useState('');

  // Wenn Mail-Tab geöffnet wird -> alle als gelesen markieren
  const handleMailTabOpen = () => {
    setActiveTab('mail');
    markAllRead(decodedVin);
  };

  // Hilfsfunktion: History-Eintrag erzeugen
  const logHistory = (entry: Parameters<typeof addHistory>[0]) => {
    if (!currentUser) return;
    addHistory({ ...entry, userId: currentUser.id, userName: currentUser.name });
  };

  const images = docs.filter(d => d.fileType === 'image');
  const pdfs   = docs.filter(d => d.fileType === 'pdf');

  useEffect(() => {
    if (vehicle) {
      const vals: Record<string, string> = {};
      Object.entries(vehicle).forEach(([k, v]) => { vals[k] = String(v ?? ''); });
      setEditValues(vals);
    }
  }, [vehicle]);

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Car className="w-16 h-16 opacity-20" />
        <p className="text-lg font-medium">Kein Zugriff</p>
        <p className="text-sm text-center max-w-xs">Sie haben keine Berechtigung, dieses Fahrzeug einzusehen. Bitte wenden Sie sich an Ihren Administrator.</p>
        <Button variant="outline" onClick={() => navigate(ROUTE_PATHS.VEHICLES)}>Zurück zur Übersicht</Button>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Car className="w-16 h-16 opacity-20" />
        <p className="text-lg font-medium">{t('vehicleDetail.notFound')}</p>
        <p className="text-sm font-mono">{decodedVin}</p>
        <Button variant="outline" onClick={() => navigate(ROUTE_PATHS.VEHICLES)}>{t('vehicleDetail.notFoundBack')}</Button>
      </div>
    );
  }

  const handleSave = () => {
    if (!vehicle) return;
    const changes: Partial<VehicleRecord> = {};
    const histChanges: { field: string; oldValue: string; newValue: string }[] = [];
    Object.entries(editValues).forEach(([k, v]) => {
      if (k === 'vin') return;
      const oldVal = String(vehicle[k] ?? '');
      if (v !== oldVal) {
        changes[k] = v;
        histChanges.push({ field: k, oldValue: oldVal, newValue: v });
      }
    });
    if (histChanges.length > 0) {
      logHistory({
        vehicleVin: decodedVin,
        type: 'field_change',
        timestamp: new Date().toISOString(),
        userId: currentUser?.id ?? '',
        userName: currentUser?.name ?? '',
        changes: histChanges,
      });
    }
    updateVehicle(decodedVin, changes);
    setEditing(false);
  };

  const handleDeleteVehicle = () => { deleteVehicle(decodedVin); navigate(ROUTE_PATHS.VEHICLES); };
  const handleDeleteDoc = async () => {
    if (!deleteDocId) return;
    const doc = docs.find(d => d.id === deleteDocId);
    await deleteDocument(deleteDocId);
    if (doc) {
      logHistory({
        vehicleVin: decodedVin, type: 'document_delete',
        timestamp: new Date().toISOString(),
        userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
        documentLabel: doc.label, documentFileName: doc.originalFileName,
      });
    }
    setDeleteDocId(null);
  };

  const handleDeleteAllDocs = async () => {
    for (const doc of docs) {
      await deleteDocument(doc.id);
      logHistory({
        vehicleVin: decodedVin, type: 'document_delete',
        timestamp: new Date().toISOString(),
        userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
        documentLabel: doc.label, documentFileName: doc.originalFileName,
      });
    }
    setDeleteAllDocsConfirm(false);
  };

  // ── Gesamtdownload als ZIP ──────────────────────────────
  const handleDownloadAkte = async () => {
    if (!vehicle) return;
    setDownloading(true);
    try {
      await downloadSingleAkte(vehicle, docs);
    } catch (err) {
      console.error('ZIP-Download fehlgeschlagen:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Felder filtern – wenn Admin visibleDetailFields konfiguriert hat, nur diese zeigen
  const entries = Object.entries(vehicle).filter(([k]) => {
    if (k === 'vin' || k.startsWith('_')) return false;
    if (visibleDetailFields.length > 0 && currentUser?.role !== 'admin') {
      return visibleDetailFields.includes(k);
    }
    return true;
  });
  const groups = [
    { labelKey: 'vehicleDetail.groupVehicle', keys: ['Hersteller', 'Haupttyp', 'Motorart'] },
    { labelKey: 'vehicleDetail.groupCosts',   keys: ['Reparaturkosten netto', 'WBWert netto', 'Erstzulassung', 'Besichtigung1 Datum', 'Besichtigungsort'] },
  ];
  const grouped = new Map<string, [string, unknown][]>();
  const ungrouped: [string, unknown][] = [];
  groups.forEach(g => grouped.set(g.labelKey, []));
  entries.forEach(([key, val]) => {
    const group = groups.find(g => g.keys.some(k => k.toLowerCase() === key.toLowerCase()));
    if (group) grouped.get(group.labelKey)!.push([key, val]);
    else ungrouped.push([key, val]);
  });

  const formatDisplayValue = (key: string, val: unknown): string => {
    const s = String(val ?? '');
    if (s === '') return '—';
    if (isCurrencyKey(key)) return formatCurrency(s);
    return s;
  };

  const activeColor = COLOR_PALETTE.find(c => c.value === vehicle._color);

  return (
    <div className={`max-w-5xl mx-auto ${isMobile ? "p-3 pb-24" : "p-6 pb-12"}`}>
      {/* Breadcrumb + Aktionen */}
      <div className={`${isMobile ? "flex flex-col gap-2 mb-4" : "flex items-center justify-between gap-2 mb-6"}`}>
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTE_PATHS.VEHICLES)} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> {t('vehicleDetail.back')}
        </Button>
        <div className="flex items-center gap-2">
          {/* ── Farbmarkierung ── */}
          {canEdit && (
            <div className="relative">
              <Button
                variant="outline" size="sm"
                className="gap-1.5 h-8"
                style={activeColor ? { borderColor: activeColor.border, color: activeColor.border } : {}}
                onClick={() => setShowColorPicker(v => !v)}
              >
                <Palette className="w-3.5 h-3.5" />
                {activeColor ? activeColor.label : 'Farbe'}
              </Button>
              <AnimatePresence>
                {showColorPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-10 z-30 bg-popover border border-border rounded-xl shadow-xl p-3 min-w-[220px]"
                  >
                    <p className="text-xs font-medium text-muted-foreground mb-2">Zeilenfarbe in der Übersicht</p>
                    <div className="grid grid-cols-3 gap-2">
                      {COLOR_PALETTE.map(col => (
                        <button
                          key={col.value}
                          onClick={() => {
                            setVehicleColor(decodedVin, col.value);
                            setShowColorPicker(false);
                            logHistory({
                              vehicleVin: decodedVin, type: 'color_change',
                              timestamp: new Date().toISOString(),
                              userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
                              colorLabel: col.label,
                            });
                          }}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors border border-transparent hover:border-border"
                          style={{ background: col.value, borderColor: vehicle._color === col.value ? col.border : undefined }}
                          title={col.label}
                        >
                          <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ background: col.border }} />
                          {col.label}
                          {vehicle._color === col.value && <span className="ml-auto text-[10px]">✓</span>}
                        </button>
                      ))}
                    </div>
                    {vehicle._color && (
                      <button
                        onClick={() => {
                          setVehicleColor(decodedVin, null);
                          setShowColorPicker(false);
                          logHistory({
                            vehicleVin: decodedVin, type: 'color_change',
                            timestamp: new Date().toISOString(),
                            userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
                            colorLabel: 'keine',
                          });
                        }}
                        className="mt-2 w-full text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 justify-center py-1 rounded-lg hover:bg-muted transition-colors"
                      >
                        <X className="w-3 h-3" /> Farbe entfernen
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {/* ── Gesamtdownload ── */}
          <Button
            variant="outline" size="sm"
            className="gap-1.5 h-8"
            onClick={handleDownloadAkte}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageOpen className="w-3.5 h-3.5" />}
            Akte herunterladen
          </Button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 35 }}>

        {/* ── Fahrzeug-Header ─────────────────────────────── */}
        <Card className="mb-6 border-border shadow-sm" style={vehicle._color ? { borderLeftWidth: 4, borderLeftColor: COLOR_PALETTE.find(c => c.value === vehicle._color)?.border } : {}}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Car className="w-5 h-5 text-primary" />
                  <Badge variant="outline" className="text-xs font-normal">{String(vehicle['Motorart'] ?? '')}</Badge>
                  {activeColor && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: activeColor.value, color: activeColor.border, border: `1px solid ${activeColor.border}` }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: activeColor.border }} />
                      {activeColor.label}
                    </span>
                  )}
                </div>
                <CardTitle className="text-xl">{String(vehicle['Hersteller'] ?? '')} {String(vehicle['Haupttyp'] ?? '')}</CardTitle>
                <p className="font-mono text-sm text-accent mt-1">{vehicle.vin}</p>
              </div>
              <div className="flex gap-2">
                {canEdit && !editing && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> {t('vehicleDetail.edit')}
                    </Button>
                    {currentUser?.role === 'admin' && (
                      <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="gap-1.5 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" /> {t('vehicleDetail.delete')}
                      </Button>
                    )}
                  </>
                )}
                {editing && (
                  <>
                    <Button size="sm" onClick={handleSave} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {t('vehicleDetail.save')}</Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="gap-1.5"><X className="w-3.5 h-3.5" /> {t('vehicleDetail.cancel')}</Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* ── Datenfelder ─────────────────────────────────── */}
        <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 gap-4 mb-6"}`}>
          {Array.from(grouped.entries()).map(([groupName, fields]) =>
            fields.length > 0 && (
              <Card key={groupName} className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm text-muted-foreground font-medium">{t(groupName)}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {fields.map(([key, val]) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground">{getLabel(key, key)}</Label>
                      {editing && !['Hersteller', 'Haupttyp', 'Motorart'].includes(key) ? (
                        <Input value={editValues[key] ?? ''} onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))} className="h-8 mt-1 text-sm" />
                      ) : (
                        <p className={`text-sm mt-0.5 ${key.toLowerCase() === 'vin' ? 'font-mono text-accent' : 'text-foreground'}`}>{formatDisplayValue(key, val)}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          )}
          {ungrouped.length > 0 && (
            <Card className="border-border md:col-span-2">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm text-muted-foreground font-medium">{t('vehicleDetail.groupOther')}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3"}`}>
                  {ungrouped.map(([key, val]) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground">{getLabel(key, key)}</Label>
                      {editing ? (
                        <Input value={editValues[key] ?? ''} onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))} className="h-8 mt-1 text-sm" />
                      ) : (
                        <p className="text-sm mt-0.5 text-foreground">{formatDisplayValue(key, val)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Benutzerdefinierte Spalten (Admin-Felder) ──────── */}
        {(customCols.length > 0 && (currentUser?.role === 'admin' || customCols.some(c => String(vehicle[c.id] ?? '') !== ''))) && (
          <Card className="border-border mb-6" style={{ borderLeft: '3px solid #8b5cf6' }}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
                Benutzerdefinierte Felder
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {customCols.map(col => (
                  <div key={col.id}>
                    <Label className="text-xs text-muted-foreground">{col.label}</Label>
                    {col.description && <p className="text-xs text-muted-foreground/70 mb-1">{col.description}</p>}
                    {(editing && canEdit) ? (
                      <Input
                        value={editValues[col.id] ?? String(vehicle[col.id] ?? '')}
                        onChange={e => setEditValues(prev => ({ ...prev, [col.id]: e.target.value }))}
                        className="h-8 mt-1 text-sm"
                        placeholder={`${col.label} eingeben…`}
                      />
                    ) : (
                      <p className="text-sm mt-0.5 text-foreground">
                        {String(vehicle[col.id] ?? '') || '—'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Dokumente & Fotos ────────────────────────────── */}
        <Card className="border-border">
          <CardHeader className="pb-3 px-5 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">{t('vehicleDetail.docs.title')}</CardTitle>
                {docs.length > 0 && <Badge variant="secondary" className="font-mono text-xs">{docs.length}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {currentUser?.role === 'admin' && docs.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                    onClick={() => setDeleteAllDocsConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Alle löschen ({docs.length})
                  </Button>
                )}
                {canUpload && (
                  <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5 h-8">
                    <Plus className="w-3.5 h-3.5" /> Hochladen
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {docs.length === 0 ? (
              <div className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors" onClick={() => canEdit && setShowUpload(true)}>
                <Paperclip className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t('vehicleDetail.docs.empty')}</p>
                {canEdit && <p className="text-xs text-muted-foreground/70 mt-1">{t('vehicleDetail.docs.emptyHint')}</p>}
              </div>
            ) : (
              <div className="space-y-5">
                {images.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('vehicleDetail.docs.photos', { count: images.length })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {images.map((doc, i) => (
                        <DocCard key={doc.id} doc={doc} onPreview={() => setLightboxIdx(i)} onDelete={() => setDeleteDocId(doc.id)} canDelete={docPerm.canDeleteDocs} isAdmin={currentUser?.role === 'admin'} />
                      ))}
                    </div>
                  </div>
                )}
                {pdfs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('vehicleDetail.docs.pdfs', { count: pdfs.length })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {pdfs.map(doc => (
                        <DocCard key={doc.id} doc={doc} onPreview={() => setPdfDoc(doc)} onDelete={() => setDeleteDocId(doc.id)} canDelete={docPerm.canDeleteDocs} isAdmin={currentUser?.role === 'admin'} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════════
          Verlauf & Bemerkungen
      ═══════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-6">
        <Card className="border border-border shadow-sm overflow-hidden">
          {/* Tab-Header */}
          <div className="flex border-b border-border bg-muted/20 overflow-x-auto">
            {(['history', 'notes', 'mail'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => tab === 'mail' ? handleMailTabOpen() : setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-b-2 border-primary text-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {tab === 'history' ? (
                  <><History className="w-4 h-4" /> {t('vehicleDetail.tabHistory')} <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{historyEntries.length}</span></>
                ) : tab === 'notes' ? (
                  <><MessageSquare className="w-4 h-4" /> {t('vehicleDetail.tabNotes')} <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{vehicleNotes.length}</span></>
                ) : (
                  <span className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {t('vehicleDetail.tabMail')}
                    {unreadCount > 0 && (
                      <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">{unreadCount}</span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>

          <CardContent className="p-0">
            {/* ─── Tab: Verlauf ─── */}
            {activeTab === 'history' && (
              <div className="divide-y divide-border">
                {historyEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <History className="w-8 h-8 opacity-30" />
                    <p className="text-sm">{t('vehicleDetail.historyEmpty')}</p>
                  </div>
                ) : (
                  historyEntries.map(entry => {
                    const dt = new Date(entry.timestamp);
                    const dateStr = dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

                    // Icon + Farbe je Event-Typ
                    const iconEl = (() => {
                      switch (entry.type) {
                        case 'field_change':    return <Edit3        className="w-4 h-4 text-blue-500" />;
                        case 'document_upload': return <Upload        className="w-4 h-4 text-green-500" />;
                        case 'document_delete': return <Trash2        className="w-4 h-4 text-red-400" />;
                        case 'color_change':    return <Palette       className="w-4 h-4 text-purple-500" />;
                        case 'note':            return <MessageSquare className="w-4 h-4 text-yellow-500" />;
                        case 'note_edit':       return <Edit3         className="w-4 h-4 text-yellow-400" />;
                        case 'note_delete':     return <Trash2        className="w-4 h-4 text-orange-400" />;
                        case 'bulk_upload':     return <FolderUp      className="w-4 h-4 text-teal-500" />;
                        case 'vehicle_created': return <CheckCircle2  className="w-4 h-4 text-emerald-500" />;
                        default:                return <History        className="w-4 h-4 text-muted-foreground" />;
                      }
                    })();

                    const dotColor = (() => {
                      switch (entry.type) {
                        case 'field_change':    return 'bg-blue-100';
                        case 'document_upload': return 'bg-green-100';
                        case 'document_delete': return 'bg-red-100';
                        case 'color_change':    return 'bg-purple-100';
                        case 'note':            return 'bg-yellow-100';
                        case 'note_edit':       return 'bg-yellow-50';
                        case 'note_delete':     return 'bg-orange-100';
                        case 'bulk_upload':     return 'bg-teal-100';
                        case 'vehicle_created': return 'bg-emerald-100';
                        default:                return 'bg-muted';
                      }
                    })();

                    return (
                      <div key={entry.id} className="px-6 py-3.5 flex gap-3 hover:bg-muted/10 transition-colors group/entry">
                        {/* Icon-Dot */}
                        <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${dotColor}`}>
                          {iconEl}
                        </div>

                        {/* Inhalt */}
                        <div className="flex-1 min-w-0">
                          {/* Kopfzeile */}
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="font-semibold text-sm text-foreground">{entry.userName}</span>
                            <span className="text-xs text-muted-foreground">{dateStr} · {timeStr}</span>
                          </div>

                          {/* ── field_change ── */}
                          {entry.type === 'field_change' && entry.changes && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">
                                {t('vehicleDetail.historyFieldChanged', { count: entry.changes.length })}
                              </p>
                              <ul className="space-y-1">
                                {entry.changes.map((c, i) => (
                                  <li key={i} className="text-xs flex flex-wrap items-center gap-1.5">
                                    <span className="font-medium text-foreground">{c.label || c.field}</span>
                                    <span className="text-muted-foreground">{t('vehicleDetail.historyFieldFrom')}</span>
                                    <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-mono max-w-[200px] truncate">
                                      {c.oldValue || '—'}
                                    </span>
                                    <span className="text-muted-foreground">{t('vehicleDetail.historyFieldTo')}</span>
                                    <span className="bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-mono max-w-[200px] truncate">
                                      {c.newValue || '—'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* ── document_upload ── */}
                          {entry.type === 'document_upload' && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {t('vehicleDetail.historyDocUploaded')}
                                <span className="ml-1 font-medium text-foreground">{entry.documentLabel}</span>
                              </p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {entry.documentFileName && (
                                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{entry.documentFileName}</span>
                                )}
                                {entry.documentMimeType && (
                                  <span className="bg-muted px-1.5 py-0.5 rounded">{entry.documentMimeType}</span>
                                )}
                                {entry.documentSize != null && (
                                  <span className="bg-muted px-1.5 py-0.5 rounded">
                                    {entry.documentSize < 1024 * 1024
                                      ? `${(entry.documentSize / 1024).toFixed(1)} KB`
                                      : `${(entry.documentSize / 1024 / 1024).toFixed(2)} MB`}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── document_delete ── */}
                          {entry.type === 'document_delete' && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {t('vehicleDetail.historyDocDeleted')}
                                <span className="ml-1 font-medium text-red-600">{entry.documentLabel}</span>
                              </p>
                              {entry.documentFileName && (
                                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  {entry.documentFileName}
                                </span>
                              )}
                            </div>
                          )}

                          {/* ── color_change ── */}
                          {entry.type === 'color_change' && (
                            <p className="text-xs text-muted-foreground">
                              {t('vehicleDetail.historyColorSet')}
                              <span className="ml-1 font-medium text-foreground">{entry.colorLabel}</span>
                            </p>
                          )}

                          {/* ── note (neu) ── */}
                          {entry.type === 'note' && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground font-medium">{t('vehicleDetail.historyNoteAdded')}</p>
                              {entry.noteText && (
                                <blockquote className="text-xs text-foreground bg-yellow-50 border-l-2 border-yellow-300 pl-2.5 py-1.5 rounded-r-md whitespace-pre-wrap">
                                  {entry.noteText}
                                </blockquote>
                              )}
                            </div>
                          )}

                          {/* ── note_edit ── */}
                          {entry.type === 'note_edit' && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground font-medium">{t('vehicleDetail.historyNoteEdited')}</p>
                              {entry.noteOldText && (
                                <div>
                                  <p className="text-[11px] text-muted-foreground mb-0.5">{t('vehicleDetail.historyNoteEditedBefore')}</p>
                                  <blockquote className="text-xs text-muted-foreground bg-red-50 border-l-2 border-red-300 pl-2.5 py-1.5 rounded-r-md line-through whitespace-pre-wrap">
                                    {entry.noteOldText}
                                  </blockquote>
                                </div>
                              )}
                              {entry.noteText && (
                                <div>
                                  <p className="text-[11px] text-muted-foreground mb-0.5">{t('vehicleDetail.historyNoteEditedAfter')}</p>
                                  <blockquote className="text-xs text-foreground bg-yellow-50 border-l-2 border-yellow-300 pl-2.5 py-1.5 rounded-r-md whitespace-pre-wrap">
                                    {entry.noteText}
                                  </blockquote>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── note_delete ── */}
                          {entry.type === 'note_delete' && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground font-medium">{t('vehicleDetail.historyNoteDeleted')}</p>
                              {entry.noteText && (
                                <blockquote className="text-xs text-muted-foreground bg-red-50 border-l-2 border-red-300 pl-2.5 py-1.5 rounded-r-md line-through whitespace-pre-wrap">
                                  {entry.noteText}
                                </blockquote>
                              )}
                            </div>
                          )}

                          {/* ── bulk_upload ── */}
                          {entry.type === 'bulk_upload' && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {t('vehicleDetail.historyBulkUpload')}
                                <span className="ml-1 font-medium text-foreground">
                                  {t('vehicleDetail.historyBulkFiles', { count: entry.bulkFileCount ?? 0 })}
                                </span>
                              </p>
                              {entry.bulkFileNames && entry.bulkFileNames.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {entry.bulkFileNames.map((fn, i) => (
                                    <span key={i} className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                      {fn}
                                    </span>
                                  ))}
                                  {(entry.bulkFileCount ?? 0) > (entry.bulkFileNames?.length ?? 0) && (
                                    <span className="text-[11px] text-muted-foreground px-1.5 py-0.5">
                                      {t('vehicleDetail.historyBulkMore', { count: (entry.bulkFileCount ?? 0) - (entry.bulkFileNames?.length ?? 0) })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── vehicle_created ── */}
                          {entry.type === 'vehicle_created' && (
                            <p className="text-xs text-muted-foreground">
                              {t('vehicleDetail.historyVehicleCreated')}
                              {entry.importSource && (
                                <span className="ml-1">{t('vehicleDetail.historyVehicleCreatedVia')} <span className="font-medium text-foreground">{entry.importSource}</span></span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ─── Tab: Bemerkungen ─── */}
            {activeTab === 'notes' && (
              <div>
                {/* Neue Bemerkung eingeben */}
                <div className="p-4 border-b border-border bg-muted/10">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('vehicleDetail.noteAdd')}</p>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder={t('vehicleDetail.notePlaceholder')}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      size="sm"
                      disabled={!noteText.trim()}
                      onClick={() => {
                        if (!noteText.trim() || !currentUser) return;
                        const newNote = addNote({
                          vehicleVin: decodedVin,
                          timestamp: new Date().toISOString(),
                          userId: currentUser.id,
                          userName: currentUser.name,
                          text: noteText.trim(),
                        });
                        logHistory({
                          vehicleVin: decodedVin, type: 'note',
                          timestamp: new Date().toISOString(),
                          userId: currentUser.id, userName: currentUser.name,
                          noteId: newNote.id,
                          noteText: noteText.trim(),
                        });
                        setNoteText('');
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('vehicleDetail.noteSave')}
                    </Button>
                  </div>
                </div>
                {/* Liste der Bemerkungen */}
                <div className="divide-y divide-border">
                  {vehicleNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                      <MessageSquare className="w-8 h-8 opacity-30" />
                      <p className="text-sm">{t('vehicleDetail.noteEmpty')}</p>
                    </div>
                  ) : (
                    vehicleNotes.map(note => {
                      const dt = new Date(note.timestamp);
                      const dateStr = dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                      const isOwn = currentUser?.id === note.userId;
                      const isAdmin = currentUser?.role === 'admin';
                      const canManage = isOwn || isAdmin;
                      return (
                        <div key={note.id} className="px-6 py-4 hover:bg-muted/10 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                              {note.userName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="font-semibold text-sm">{note.userName}</span>
                                <span className="text-xs text-muted-foreground">{dateStr} · {timeStr}</span>
                                {note.editedAt && <span className="text-xs text-muted-foreground italic">({t('vehicleDetail.noteEdited')})</span>}
                              </div>
                              {editingNoteId === note.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingNoteText}
                                    onChange={e => setEditingNoteText(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => {
                                      const oldText = note.text;
                                      updateNote(note.id, editingNoteText);
                                      if (editingNoteText !== oldText) {
                                        logHistory({
                                          vehicleVin: decodedVin, type: 'note_edit',
                                          timestamp: new Date().toISOString(),
                                          userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
                                          noteId: note.id,
                                          noteText: editingNoteText,
                                          noteOldText: oldText,
                                        });
                                      }
                                      setEditingNoteId(null);
                                    }} className="gap-1"><Check className="w-3 h-3" /> {t('vehicleDetail.save')}</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>{t('vehicleDetail.cancel')}</Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                              )}
                            </div>
                            {canManage && editingNoteId !== note.id && (
                              <div className="flex gap-1 shrink-0">
                                {isOwn && (
                                  <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}>
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => {
                                    logHistory({
                                      vehicleVin: decodedVin, type: 'note_delete',
                                      timestamp: new Date().toISOString(),
                                      userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
                                      noteId: note.id,
                                      noteText: note.text,
                                    });
                                    deleteNote(note.id);
                                  }}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ─── Tab: E-Mails ─── */}
            {activeTab === 'mail' && (
              <div className="flex flex-col">

                {/* Info-Leiste: Fahrzeug-E-Mail-Adresse */}
                <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-muted/20 border-b border-border">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Mail className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('vehicleDetail.mail.vehicleAddress')}</p>
                      <code className="text-sm font-mono font-semibold text-foreground">{vehicleEmail}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                      onClick={() => { navigator.clipboard.writeText(vehicleEmail); }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('vehicleDetail.mail.copyAddress')}
                    </Button>
                    <Button size="sm" className="h-8 gap-1.5 text-xs"
                      onClick={() => { setMailView('compose'); setComposeMode('new'); setMailTo(''); setMailSubject(''); setMailBody(''); setMailSendStatus('idle'); }}
                    >
                      <Send className="w-3.5 h-3.5" /> {t('vehicleDetail.mail.compose')}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => setShowIncomingDialog(true)}
                      title={t('vehicleDetail.mail.addIncomingTitle')}
                    >
                      <Inbox className="w-3.5 h-3.5" /> {t('vehicleDetail.mail.addIncoming')}
                    </Button>
                  </div>
                </div>

                {/* Sub-Navigation: Posteingang / Postausgang */}
                {mailView !== 'compose' && mailView !== 'read' && (
                  <div className="flex border-b border-border bg-background">
                    {(['inbox', 'sent'] as const).map(v => {
                      const inboxCount = vehicleMails.filter(m => m.direction === 'in').length;
                      const sentCount  = vehicleMails.filter(m => m.direction === 'out').length;
                      return (
                        <button key={v} onClick={() => setMailView(v)}
                          className={`px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                            mailView === v ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {v === 'inbox' ? <Inbox className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                          {v === 'inbox' ? t('vehicleDetail.mail.inbox') : t('vehicleDetail.mail.sent')}
                          <span className="ml-1 text-xs bg-muted rounded-full px-1.5">
                            {v === 'inbox' ? inboxCount : sentCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Posteingang ── */}
                {mailView === 'inbox' && (
                  <div className="divide-y divide-border">
                    {vehicleMails.filter(m => m.direction === 'in').length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <Inbox className="w-8 h-8 opacity-30" />
                        <p className="text-sm">{t('vehicleDetail.mail.noInbox')}</p>
                      </div>
                    ) : (
                      vehicleMails
                        .filter(m => m.direction === 'in')
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(mail => (
                          <div key={mail.id}
                            onClick={() => { setSelectedMail(mail.id); setMailView('read'); markRead(mail.id); }}
                            className={`flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!mail.read ? 'bg-primary/3' : ''}`}
                          >
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!mail.read ? 'bg-primary' : 'bg-transparent'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm truncate ${!mail.read ? 'font-semibold' : 'font-medium'}`}>{mail.from}</p>
                                <p className="text-xs text-muted-foreground shrink-0">{new Date(mail.date).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}</p>
                              </div>
                              <p className={`text-sm truncate ${!mail.read ? 'text-foreground' : 'text-muted-foreground'}`}>{mail.subject}</p>
                              <p className="text-xs text-muted-foreground truncate">{mail.body.slice(0, 80)}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              onClick={e => { e.stopPropagation(); deleteMail(mail.id); }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {/* ── Postausgang ── */}
                {mailView === 'sent' && (
                  <div className="divide-y divide-border">
                    {vehicleMails.filter(m => m.direction === 'out').length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <Send className="w-8 h-8 opacity-30" />
                        <p className="text-sm">{t('vehicleDetail.mail.noSent')}</p>
                      </div>
                    ) : (
                      vehicleMails
                        .filter(m => m.direction === 'out')
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(mail => (
                          <div key={mail.id}
                            onClick={() => { setSelectedMail(mail.id); setMailView('read'); }}
                            className="flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                          >
                            <Send className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate">{t('vehicleDetail.mail.toLabel')}: {mail.to}</p>
                                <p className="text-xs text-muted-foreground shrink-0">{new Date(mail.date).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}</p>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{mail.subject}</p>
                              <p className="text-xs text-muted-foreground truncate">{mail.body.slice(0, 80)}</p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {/* ── Mail lesen ── */}
                {mailView === 'read' && (() => {
                  const mail = vehicleMails.find(m => m.id === selectedMail);
                  if (!mail) return null;
                  return (
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
                          onClick={() => setMailView(mail.direction === 'in' ? 'inbox' : 'sent')}
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
                        </Button>
                        {mail.direction === 'in' && (
                          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs ml-auto"
                            onClick={() => {
                              setMailTo(mail.from);
                              setMailSubject(`Re: ${mail.subject}`);
                              setMailBody(`\n\n— ${t('vehicleDetail.mail.originalFrom')}: ${mail.from}\n${mail.body}`);
                              setComposeMode('reply');
                              setMailView('compose');
                              setMailSendStatus('idle');
                            }}
                          >
                            <CornerUpLeft className="w-3.5 h-3.5" /> {t('vehicleDetail.mail.reply')}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => { deleteMail(mail.id); setMailView(mail.direction === 'in' ? 'inbox' : 'sent'); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/30 px-4 py-3 space-y-1 border-b border-border">
                          <p className="text-sm"><span className="font-semibold text-muted-foreground w-16 inline-block">{t('vehicleDetail.mail.subject')}:</span> {mail.subject}</p>
                          <p className="text-sm"><span className="font-semibold text-muted-foreground w-16 inline-block">{t('vehicleDetail.mail.fromLabel')}:</span> <code className="font-mono text-xs">{mail.from}</code></p>
                          <p className="text-sm"><span className="font-semibold text-muted-foreground w-16 inline-block">{t('vehicleDetail.mail.toLabel')}:</span> <code className="font-mono text-xs">{mail.to}</code></p>
                          <p className="text-xs text-muted-foreground">{new Date(mail.date).toLocaleString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                        </div>
                        <div className="p-4">
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{mail.body}</pre>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Verfassen ── */}
                {mailView === 'compose' && (
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
                        onClick={() => { setMailView('inbox'); setMailSendStatus('idle'); }}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
                      </Button>
                      <h3 className="text-sm font-semibold ml-1">
                        {composeMode === 'reply' ? t('vehicleDetail.mail.replyTitle') : t('vehicleDetail.mail.newMail')}
                      </h3>
                    </div>

                    <div className="space-y-3 border border-border rounded-lg p-4">
                      {/* Absender */}
                      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">{t('vehicleDetail.mail.fromLabel')}:</span>
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">{vehicleEmail}</code>
                      </div>
                      {/* An */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-16 shrink-0">{t('vehicleDetail.mail.toLabel')}:</label>
                        <input
                          type="email"
                          value={mailTo}
                          onChange={e => setMailTo(e.target.value)}
                          className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary pb-0.5"
                          placeholder="empfaenger@beispiel.de"
                        />
                      </div>
                      {/* Betreff */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-16 shrink-0">{t('vehicleDetail.mail.subject')}:</label>
                        <input
                          type="text"
                          value={mailSubject}
                          onChange={e => setMailSubject(e.target.value)}
                          className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary pb-0.5"
                          placeholder={t('vehicleDetail.mail.subjectPlaceholder')}
                        />
                      </div>
                      {/* Text */}
                      <textarea
                        value={mailBody}
                        onChange={e => setMailBody(e.target.value)}
                        rows={8}
                        className="w-full text-sm bg-transparent focus:outline-none resize-none leading-relaxed mt-1"
                        placeholder={t('vehicleDetail.mail.bodyPlaceholder')}
                      />
                    </div>

                    {/* Status */}
                    {mailSendStatus === 'sent' && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="w-4 h-4" /> {t('vehicleDetail.mail.sendSuccess')}
                      </div>
                    )}
                    {mailSendStatus === 'error' && (
                      <div className="text-sm text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                        {t('vehicleDetail.mail.sendError')}: {mailSendError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setMailView('inbox'); setMailSendStatus('idle'); }}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        disabled={!mailTo || !mailSubject || !mailBody || mailSending}
                        className="gap-1.5"
                        onClick={async () => {
                          setMailSending(true);
                          setMailSendStatus('idle');
                          const res = await sendVehicleMail({ fromVin: decodedVin, toEmail: mailTo, subject: mailSubject, body: mailBody });
                          // Immer lokal speichern (auch wenn EmailJS nicht konfiguriert)
                          addMail({
                            vin: decodedVin, direction: 'out',
                            from: vehicleEmail, to: mailTo,
                            subject: mailSubject, body: mailBody,
                            date: new Date().toISOString(), read: true,
                          });
                          setMailSending(false);
                          if (res.status === 'sent') {
                            setMailSendStatus('sent');
                            setTimeout(() => { setMailView('sent'); setMailSendStatus('idle'); }, 1500);
                          } else {
                            // Gespeichert aber kein Versand möglich
                            setMailSendStatus('error');
                            setMailSendError(res.status === 'not_configured'
                              ? t('vehicleDetail.mail.notConfigured')
                              : res.message
                            );
                          }
                        }}
                      >
                        {mailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {t('vehicleDetail.mail.send')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Dialoge ────────────────────────────────────────── */}
      <UploadDialog
        vin={decodedVin} open={showUpload} onClose={() => setShowUpload(false)}
        canUploadPdf={docPerm.canUploadPdf} canUploadImage={docPerm.canUploadImage}
        onUploaded={(label, fileName, mimeType, size) => {
          logHistory({
            vehicleVin: decodedVin, type: 'document_upload',
            timestamp: new Date().toISOString(),
            userId: currentUser?.id ?? '', userName: currentUser?.name ?? '',
            documentLabel: label, documentFileName: fileName,
            documentMimeType: mimeType, documentSize: size,
          });
        }}
      />

      <AnimatePresence>
        {lightboxIdx !== null && <Lightbox images={images} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />}
        {pdfDoc && <PdfViewer doc={pdfDoc} onClose={() => setPdfDoc(null)} />}
      </AnimatePresence>

      {/* ── Dialog: Eingehende E-Mail manuell erfassen ────────────── */}
      <Dialog open={showIncomingDialog} onOpenChange={setShowIncomingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-primary" />
              {t('vehicleDetail.mail.addIncomingTitle')}
            </DialogTitle>
            <DialogDescription>{t('vehicleDetail.mail.addIncomingDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('vehicleDetail.mail.fromLabel')} *</label>
              <input
                type="email"
                value={inFromEmail}
                onChange={e => setInFromEmail(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="absender@beispiel.de"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('vehicleDetail.mail.subject')} *</label>
              <input
                type="text"
                value={inSubject}
                onChange={e => setInSubject(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t('vehicleDetail.mail.subjectPlaceholder')}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('vehicleDetail.mail.body')} *</label>
              <textarea
                value={inBody}
                onChange={e => setInBody(e.target.value)}
                rows={6}
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder={t('vehicleDetail.mail.bodyPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIncomingDialog(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!inFromEmail || !inSubject || !inBody}
              onClick={() => {
                addMail({
                  vin: decodedVin, direction: 'in',
                  from: inFromEmail, to: vehicleEmail,
                  subject: inSubject, body: inBody,
                  date: new Date().toISOString(), read: false,
                });
                setInFromEmail(''); setInSubject(''); setInBody('');
                setShowIncomingDialog(false);
                setActiveTab('mail');
                setMailView('inbox');
              }}
            >
              <Inbox className="w-3.5 h-3.5 mr-1.5" /> {t('vehicleDetail.mail.saveIncoming')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Klick außerhalb Farbpicker schließen */}
      {showColorPicker && <div className="fixed inset-0 z-20" onClick={() => setShowColorPicker(false)} />}

      <AlertDialog open={!!deleteDocId} onOpenChange={v => !v && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> {t('vehicleDetail.docs.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('vehicleDetail.docs.deleteDesc', { name: docs.find(d => d.id === deleteDocId)?.label ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDoc} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alle Dokumente dieses Fahrzeugs löschen */}
      <AlertDialog open={deleteAllDocsConfirm} onOpenChange={setDeleteAllDocsConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Alle Dokumente löschen
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle <strong>{docs.length} Dokumente</strong> dieses Fahrzeugs werden unwiderruflich gelöscht.
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllDocs}
              className="bg-destructive hover:bg-destructive/90"
            >
              Alle {docs.length} löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> {t('vehicleDetail.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('vehicleDetail.deleteDesc', { vin: decodedVin })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVehicle} className="bg-destructive hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
