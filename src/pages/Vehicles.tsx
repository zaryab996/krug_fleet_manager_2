import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Download, SlidersHorizontal, Car,
  ChevronUp, ChevronDown, ArrowUpDown,
  Zap, AlertCircle, GripVertical, FileSpreadsheet, FileText,
  ChevronDown as ChevronDownIcon, CheckSquare, Square, PackageOpen,
  Loader2, QrCode, MailOpen, PlusCircle, Archive, ArchiveRestore, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFleetStore, useAuthStore, useColorLegendStore, useColumnConfigStore, useDocsStore, useVehicleAccessStore, useCustomColumnsStore, useVehicleMailStore } from '@/hooks/useStore';
import NewVehicleDialog from '@/components/NewVehicleDialog';
import ArchiveView      from '@/components/ArchiveView';
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';
import { useColumnLabel } from '@/hooks/useColumnLabel';
import { filterRecords, formatCurrency, parseCurrencyValue, ROUTE_PATHS } from '@/lib/index';
import { exportToCSV } from '@/lib/csvParser';
import { downloadMultipleAkten } from '@/lib/downloadUtils';
import { printQRCodesPDF } from '@/lib/qrCodeUtils';
import type { VehicleRecord } from '@/lib/types';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';

/** Erkennt Mobile-Viewport (< 768px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

type SortDir = 'asc' | 'desc' | null;
interface SortState { key: string; dir: SortDir }

const IMPORTANT_COLUMNS = [
  'vin', 'Hersteller', 'Haupttyp', 'Motorart',
  'Reparaturkosten netto', 'WBWert netto',
  'Erstzulassung', 'Besichtigung1 Datum',
];

function isElectric(record: VehicleRecord): boolean {
  return Object.values(record).some(v =>
    typeof v === 'string' && v.toLowerCase().includes('elektro')
  );
}

/** Hochvoltfahrzeug: Motorart/Engine type === "EV" (case-insensitive) */
function isEVehicle(record: VehicleRecord): boolean {
  const motorKeys = ['Motorart', 'Engine type', 'engine type', 'motorart', 'Motor', 'Antrieb', 'Fuel type'];
  return motorKeys.some(k => {
    const v = record[k];
    return typeof v === 'string' && v.trim().toUpperCase() === 'EV';
  });
}

function exportToExcel(records: VehicleRecord[], filename = 'fahrzeugdaten.xlsx'): void {
  if (records.length === 0) return;
  const headers = Object.keys(records[0]);
  const data = records.map(r => headers.map(h => r[h] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fahrzeuge');
  // write als base64 data-URL statt blob (funktioniert in sandboxed Umgebungen)
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const a = document.createElement('a');
  a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  a.download = filename;
  a.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

export default function VehiclesPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const {
    fleetData, searchQuery, activeFilters, setSearchQuery, setFilter, clearFilters,
    archiveVehicle, archiveMultiple, getLiveVehicles, getArchivedVehicles,
  } = useFleetStore();
  const { currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  const { entries: colorLegend } = useColorLegendStore();
  const { documents: allDocs } = useDocsStore();
  const { hasUnread: mailHasUnread } = useVehicleMailStore();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortState>({ key: '', dir: null });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [colOrder, setColOrder] = useState<string[]>([]);
  const dragCol = useRef<string | null>(null);
  const dragOverCol = useRef<string | null>(null);
  // Pagination settings
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 0]; // 0 = alle
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('fleet-page-size');
    return saved ? parseInt(saved) : 20;
  });
  const PAGE_SIZE = pageSize === 0 ? 999999 : pageSize;

  // Multi-Selektion
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // Declare allRecordsRaw early so all useMemos below can reference it
  const { columns, records: allRecordsRaw } = fleetData;
  // Only show non-archived vehicles in main list (reactive – updates on every import)
  const allRecords = useMemo(() => allRecordsRaw.filter(r => !r._archived), [allRecordsRaw]);

  // Neue Features: Fahrzeug anlegen + Archiv
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [showArchive,    setShowArchive]    = useState(false);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);
  const archivedCount = useMemo(() => allRecordsRaw.filter(r => r._archived === true).length, [allRecordsRaw]);

  // QR-Code-Druck
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrSelected, setQrSelected] = useState<Set<string>>(new Set());
  const [qrPrinting, setQrPrinting] = useState(false);
  const [qrProgress, setQrProgress] = useState(0);
  const [qrSearch, setQrSearch] = useState('');

  // ── Custom Columns & Label-Override ──────────────────────────────
  const { columns: customCols } = useCustomColumnsStore();
  const getLabel = useColumnLabel();

  // ── Effektive Berechtigungen (Individual > Gruppe > Standard) ────
  const { vehicleAccess, columnConfig: userColConfig } = useEffectivePermissions(
    currentUser?.id ?? '', currentUser?.role ?? 'viewer'
  );

  // ── Fahrzeugzugang: nur erlaubte Fahrzeuge anzeigen ──────────────
  const records = useMemo(() => {
    if (!currentUser || currentUser.role === 'admin') return allRecords;
    if (vehicleAccess.mode === 'all') return allRecords;
    return allRecords.filter(r => vehicleAccess.allowedVins.includes(String(r.vin)));
  }, [allRecords, currentUser, vehicleAccess]);

  const filterableColumns = useMemo(() =>
    columns.filter(c => ['Hersteller', 'Motorart', 'Haupttyp'].includes(c.key)),
    [columns]
  );

  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    filterableColumns.forEach(col => {
      const vals = [...new Set(records.map(r => String(r[col.key] ?? '')).filter(Boolean))].sort();
      map[col.key] = vals;
    });
    return map;
  }, [filterableColumns, records]);

  const defaultCols = useMemo(() => {
    // Wenn Admin eine Konfiguration für diesen Nutzer angelegt hat → diese nutzen
    if (userColConfig && userColConfig.visibleColumns.length > 0) {
      return userColConfig.visibleColumns.filter(k => (columns.some(c => c.key === k) || customCols.some(c => c.id === k)) && !k.startsWith('_'));
    }
    const important = IMPORTANT_COLUMNS.filter(k => columns.some(c => c.key === k));
    // _color und andere interne Felder ausblenden
    const rest = columns.map(c => c.key).filter(k => !IMPORTANT_COLUMNS.includes(k) && !k.startsWith('_'));
    // Admin-definierte Zusatzspalten am Ende anhängen
    const customKeys = customCols.map(c => c.id);
    return [...important, ...rest, ...customKeys];
  }, [columns, userColConfig, customCols]);

  const displayedColumns = useMemo(() => {
    // Wenn Admin-Konfiguration für Nutzer vorhanden → kein manuelles Drag möglich (Reihenfolge fix)
    if (userColConfig && userColConfig.visibleColumns.length > 0) {
      return defaultCols;
    }
    if (colOrder.length > 0) {
      const extras = defaultCols.filter(k => !colOrder.includes(k));
      return [...colOrder.filter(k => defaultCols.includes(k)), ...extras];
    }
    return defaultCols;
  }, [colOrder, defaultCols, userColConfig]);

  const handleDragStart = useCallback((key: string) => { dragCol.current = key; }, []);
  const handleDragEnter = useCallback((key: string) => { dragOverCol.current = key; }, []);
  const handleDragEnd = useCallback(() => {
    const from = dragCol.current;
    const to = dragOverCol.current;
    if (!from || !to || from === to) { dragCol.current = null; dragOverCol.current = null; return; }
    const newOrder = [...displayedColumns];
    const fromIdx = newOrder.indexOf(from);
    const toIdx = newOrder.indexOf(to);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, from);
    setColOrder(newOrder);
    dragCol.current = null;
    dragOverCol.current = null;
  }, [displayedColumns]);

  // ── Selektion ─────────────────────────────────────────────
  const toggleSelect = useCallback((vin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(vin) ? next.delete(vin) : next.add(vin);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((visibleVins: string[]) => {
    setSelected(prev => {
      const allSelected = visibleVins.every(v => prev.has(v));
      if (allSelected) {
        const next = new Set(prev);
        visibleVins.forEach(v => next.delete(v));
        return next;
      }
      return new Set([...prev, ...visibleVins]);
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  // ── Bulk-Download ──────────────────────────────────────────
  // Selektierte Fahrzeuge als Excel-Tabelle herunterladen
  const handleExportSelectedExcel = () => {
    if (selected.size === 0) return;
    const toExport = records.filter(r => selected.has(String(r.vin)));
    const ts = new Date().toISOString().slice(0, 10);
    exportToExcel(toExport, `Fahrzeuge_Auswahl_${toExport.length}_${ts}.xlsx`);
  };

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    const toDownload = records.filter(r => selected.has(String(r.vin)));
    setBulkDownloading(true);
    setBulkProgress({ done: 0, total: toDownload.length });
    try {
      await downloadMultipleAkten(toDownload, allDocs, (done, total) => {
        setBulkProgress({ done, total });
      });
      clearSelection();
    } catch (err) {
      console.error('Bulk-Download fehlgeschlagen:', err);
    } finally {
      setBulkDownloading(false);
      setBulkProgress(null);
    }
  };

  // ── QR-Code-Druck ──────────────────────────────────────────────────
  const openQRDialog = () => {
    // Standardmässig alle Fahrzeuge vorab auswählen
    setQrSelected(new Set(records.map(r => String(r['VIN'] ?? r['vin'] ?? ''))));
    setShowQRDialog(true);
    setQrProgress(0);
  };

  const handleQRPrint = async () => {
    const vins = [...qrSelected].filter(Boolean);
    if (vins.length === 0) return;
    setQrPrinting(true);
    setQrProgress(0);
    try {
      await printQRCodesPDF(vins, (p) => setQrProgress(Math.round(p * 100)));
    } catch (err) {
      console.error('QR-PDF-Fehler:', err);
    } finally {
      setQrPrinting(false);
      setShowQRDialog(false);
    }
  };

  const filtered = useMemo(() => {
    let result = filterRecords(records, searchQuery, activeFilters);
    if (sort.key && sort.dir) {
      result = [...result].sort((a, b) => {
        const va = String(a[sort.key] ?? '');
        const vb = String(b[sort.key] ?? '');
        const na = parseFloat(va.replace(',', '.'));
        const nb = parseFloat(vb.replace(',', '.'));
        if (!isNaN(na) && !isNaN(nb)) return sort.dir === 'asc' ? na - nb : nb - na;
        return sort.dir === 'asc' ? va.localeCompare(vb, 'de') : vb.localeCompare(va, 'de');
      });
    }
    return result;
  }, [records, searchQuery, activeFilters, sort]);

  const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const electricCount = useMemo(() => records.filter(isElectric).length, [records]);
  const evCount       = useMemo(() => filtered.filter(isEVehicle).length, [filtered]);

  // Hilfsfunktion: Marktwert und Reparaturkosten aus Record lesen
  const getMvRc = (r: VehicleRecord) => ({
    mv: parseCurrencyValue((r['Market value excluding VAT'] ?? r['Market Value excluding VAT']) as string | number | null | undefined),
    rc: parseCurrencyValue((r['Reparaturkosten netto'] ?? r['Net damage amount']) as string | number | null | undefined),
  });

  // Zähler: Fahrzeuge mit Reparaturkosten-Eintrag (Wert vorhanden und > 0)
  const withRepairCostCount = useMemo(() => records.filter(r => {
    const { rc } = getMvRc(r);
    return !isNaN(rc) && rc > 0;
  }).length, [records]);

  // Zähler: Reparaturkosten > Marktwert → ROT
  const underwaterCount = useMemo(() => records.filter(r => {
    const { mv, rc } = getMvRc(r);
    return !isNaN(mv) && !isNaN(rc) && rc > 0 && mv < rc;
  }).length, [records]);

  // Zähler: Reparaturkosten < Marktwert → GRÜN (Reparaturfall, nicht-elektrisch)
  const repairableCount = useMemo(() => records.filter(r => {
    const { mv, rc } = getMvRc(r);
    return !isElectric(r) && !isNaN(mv) && !isNaN(rc) && rc > 0 && rc < mv;
  }).length, [records]);

  // Zähler: Elektrofahrzeuge mit Reparaturkosten < Marktwert → theoretischer Reparaturfall
  const electricRepairableCount = useMemo(() => records.filter(r => {
    const { mv, rc } = getMvRc(r);
    return isElectric(r) && !isNaN(mv) && !isNaN(rc) && rc > 0 && rc < mv;
  }).length, [records]);

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: '', dir: null };
    });
  };

  const hasFilters = searchQuery || Object.values(activeFilters).some(Boolean);
  const activeFilterCount =
    Object.values(activeFilters).filter(v => v && v !== '__all__').length + (searchQuery ? 1 : 0);

  const CURRENCY_COLS = [
    'reparaturkosten netto',
    'wbwert netto',
    'market value excluding vat',
    'market value excl. vat',
    'market value excl vat',
  ];
  const formatValue = (key: string, val: unknown): string => {
    const s = String(val ?? '');
    if (s === '') return '—';
    if (CURRENCY_COLS.some(c => key.toLowerCase().includes(c)))
      return formatCurrency(s);
    return s;
  };

  return (
    <>
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className={`border-b border-border bg-card ${isMobile ? 'px-3 py-3' : 'px-6 py-4'}`}>
        {/* Titel-Zeile */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-semibold text-foreground flex items-center gap-1.5 truncate">
              <Car className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{t('vehicles.title')}</span>
              <Badge variant="secondary" className="font-mono text-xs shrink-0">{records.length}</Badge>
            </h1>
            {electricCount > 0 && !isMobile && (
              <Badge className="gap-1 bg-yellow-400/20 text-yellow-600 border-yellow-400/40 font-mono text-xs shrink-0">
                <Zap className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                {t('vehicles.electricBadge', { count: electricCount })}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 h-8" disabled={filtered.length === 0}>
                  <Download className="w-3.5 h-3.5" />
                  {!isMobile && t('vehicles.download')}
                  <ChevronDownIcon className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Alle angezeigten Fzg ({filtered.length})</div>
                <DropdownMenuItem onClick={() => exportToCSV(filtered)} className="gap-2 cursor-pointer">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Als CSV herunterladen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToExcel(filtered)} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" /> Als Excel (.xlsx)
                </DropdownMenuItem>
                {selected.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Auswahl ({selected.size} Fzg)</div>
                    <DropdownMenuItem
                      onClick={handleExportSelectedExcel}
                      className="gap-2 cursor-pointer text-green-700 focus:text-green-700"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-green-600" /> Auswahl als Excel (.xlsx)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isMobile && (
              <Button variant="outline" size="sm" className="gap-1.5 h-8" disabled={records.length === 0} onClick={openQRDialog}>
                <QrCode className="w-3.5 h-3.5" />{t('vehicles.printQR')}
              </Button>
            )}
          </div>
        </div>

        {/* Suchleiste + Filter */}
        <div className="mt-2.5 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('vehicles.search')}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 pr-9 h-10 text-sm"
            />
            {searchQuery && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button variant={showFilters ? 'default' : 'outline'} size="sm"
            onClick={() => setShowFilters(v => !v)} className="gap-1.5 h-10 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {!isMobile && t('vehicles.filter')}
            {activeFilterCount > 0 && (
              <Badge className="ml-0.5 h-4 w-4 p-0 flex items-center justify-center text-xs rounded-full">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setPage(1); }} className="h-10 px-2 text-muted-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Filter-Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 35 }}
              className="overflow-hidden">
              <div className={`pt-3 ${isMobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
                {filterableColumns.map(col => (
                  <div key={col.key} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground truncate">{col.key}</span>
                    <Select value={activeFilters[col.key] || '__all__'}
                      onValueChange={val => { setFilter(col.key, val === '__all__' ? '' : val); setPage(1); }}>
                      <SelectTrigger className={`h-9 text-xs ${isMobile ? 'w-full' : 'w-44'}`}>
                        <SelectValue placeholder={t('vehicles.all')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t('vehicles.all')}</SelectItem>
                        {(uniqueValues[col.key] ?? []).map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Elektro-Legende */}
      {electricCount > 0 && records.length > 0 && (
        <div className="px-6 py-2 border-b border-border bg-yellow-50/60 flex items-center gap-4 text-xs text-yellow-700">
          <span className="flex items-center gap-1.5 font-medium">
            <Zap className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
            {t('vehicles.electricLegend')}
            <span className="font-semibold text-yellow-600">({electricCount})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            {t('vehicles.exclamationLegend')}
          </span>
        </div>
      )}

      {/* ── EV Hochvolt-Banner ── */}
      {evCount > 0 && (
        <div className="px-4 md:px-6 py-2.5 border-b border-yellow-300 bg-yellow-400 flex items-center gap-3">
          <span className="flex items-center gap-2 font-bold text-yellow-900 text-sm">
            <Zap className="w-4 h-4 fill-yellow-900 shrink-0" />
            ⚠ Hochvoltfahrzeuge in dieser Liste:
            <span className="bg-yellow-900 text-yellow-100 font-mono text-sm font-bold px-2 py-0.5 rounded-md ml-1">
              {evCount}
            </span>
          </span>
          <span className="text-yellow-800 text-xs hidden md:inline">
            Fahrzeuge mit Motorart „EV" – Hochvoltsystem vorhanden. Nur durch geschultes Fachpersonal bearbeiten.
          </span>
        </div>
      )}

      {/* Automatische Farb-Legende: Rot + Grün + Gelb-Reparaturfall + Gesamtzahl */}
      {(underwaterCount > 0 || repairableCount > 0 || electricRepairableCount > 0 || withRepairCostCount > 0) && records.length > 0 && (
        <div className="px-6 py-2 border-b border-border bg-muted/10 flex flex-wrap items-center gap-x-6 gap-y-1.5">
          {withRepairCostCount > 0 && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground border-r border-border pr-6">
              <span className="font-medium">Fahrzeuge mit Reparaturkosten:</span>
              <span className="font-bold text-foreground">{withRepairCostCount}</span>
            </span>
          )}
          {underwaterCount > 0 && (
            <span className="flex items-center gap-2 text-xs text-red-700">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-400 shrink-0" />
              <span className="font-medium">Totalschaden</span>
              <span className="font-semibold text-red-500">({underwaterCount})</span>
            </span>
          )}
          {repairableCount > 0 && (
            <span className="flex items-center gap-2 text-xs text-green-700">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-500 shrink-0" />
              <span className="font-medium">Reparaturfall</span>
              <span className="font-semibold text-green-600">({repairableCount})</span>
            </span>
          )}
          {electricRepairableCount > 0 && (
            <span className="flex items-center gap-2 text-xs text-yellow-700">
              <span className="inline-block w-3 h-3 rounded-sm bg-yellow-200 border border-yellow-500 shrink-0" />
              <Zap className="w-3 h-3 fill-yellow-500 text-yellow-500 shrink-0" />
              <span className="font-medium">Theoretischer Reparaturfall (Elektro)</span>
              <span className="font-semibold text-yellow-600">({electricRepairableCount})</span>
            </span>
          )}
        </div>
      )}

      {/* Farblegende */}
      {colorLegend.filter(e => e.description).length > 0 && records.length > 0 && (
        <div className="px-6 py-2.5 border-b border-border bg-muted/20 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Legende:</span>
          {colorLegend.filter(e => e.description).map(entry => (
            <span key={entry.color} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                style={{ background: entry.color, borderColor: entry.color.slice(0, 7) }}
              />
              <span className="font-medium" style={{ color: entry.color.slice(0, 7) }}>{entry.label}</span>
              <span className="text-muted-foreground">= {entry.description}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Tabelle ──────────────────────────────────────── */}
      {records.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Car className="w-16 h-16 opacity-20" />
          <p className="text-lg font-medium">{t('vehicles.noData')}</p>
          <p className="text-sm">{t('vehicles.noDataHint')}</p>
          <Button onClick={() => navigate(ROUTE_PATHS.IMPORT)} className="mt-2">{t('vehicles.importButton')}</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Search className="w-12 h-12 opacity-20" />
          <p className="font-medium">{t('vehicles.noResults')}</p>
          <Button variant="outline" size="sm" onClick={() => { clearFilters(); setPage(1); }}>{t('vehicles.resetFilterButton')}</Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto flex flex-col">

          {/* ── Bulk-Aktionsleiste ────────────────────────────── */}
          <AnimatePresence>
            {selected.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/30 text-sm backdrop-blur-sm"
              >
                <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium text-primary">{selected.size} Fahrzeug{selected.size !== 1 ? 'e' : ''} ausgewählt</span>
                <Button
                  size="sm"
                  className="ml-2 gap-1.5 h-7 text-xs"
                  disabled={bulkDownloading}
                  onClick={handleBulkDownload}
                >
                  {bulkDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : '…'}
                    </>
                  ) : (
                    <><PackageOpen className="w-3.5 h-3.5" /> Akten herunterladen</>
                  )}
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 h-7 text-xs border-green-400 text-green-700 hover:bg-green-50"
                  onClick={handleExportSelectedExcel}
                  title="Ausgewählte Fahrzeuge als Excel-Tabelle herunterladen"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Als Tabelle (.xlsx)
                </Button>
                {isAdmin && (
                  <Button
                    size="sm" variant="outline"
                    className="gap-1.5 h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => setConfirmBulkArchive(true)}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {selected.size === 1 ? 'Fahrzeug archivieren' : `${selected.size} archivieren`}
                  </Button>
                )}
                <button
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  onClick={clearSelection}
                >
                  <X className="w-3.5 h-3.5" /> Auswahl aufheben
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-auto">

          {/* ── MOBILE: Card-Ansicht ──────────────────────── */}
          {isMobile ? (
            <div className="divide-y divide-border">
              {paged.map((record) => {
                const electric = isElectric(record);
                const isEV     = isEVehicle(record);
                const rowColor = record._color as string | undefined;
                const vin = String(record.vin);
                const isSelected = selected.has(vin);
                const { mv: marketVal, rc: repairCost } = getMvRc(record);
                const isUnderwater = !isNaN(marketVal) && !isNaN(repairCost) && repairCost > 0 && marketVal < repairCost;
                const isRepairable = !electric && !isNaN(marketVal) && !isNaN(repairCost) && repairCost > 0 && repairCost < marketVal;

                const cardStyle: React.CSSProperties = rowColor
                  ? { borderLeft: `4px solid ${rowColor}`, backgroundColor: rowColor + '22' }
                  : isUnderwater
                    ? { borderLeft: '4px solid #ef4444', backgroundColor: '#fee2e2' }
                    : isRepairable
                      ? { borderLeft: '4px solid #16a34a', backgroundColor: '#dcfce7' }
                      : electric
                        ? { borderLeft: '4px solid #eab308', backgroundColor: '#fefce8' }
                        : {};

                // Zeige die ersten 4 wichtigen Felder als Preview
                const previewCols = displayedColumns.slice(0, 4).filter(k => k !== 'vin');

                return (
                  <motion.div key={vin}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => navigate(`/vehicles/${encodeURIComponent(vin)}`)}
                    className={`px-4 py-3.5 cursor-pointer active:bg-primary/10 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                    style={cardStyle}
                  >
                    {/* VIN + Icons */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button className="shrink-0 p-0.5" onClick={e => toggleSelect(vin, e)}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground/40" />}
                        </button>
                        <span className="font-mono text-sm font-semibold text-accent truncate">{vin}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {electric && <Zap className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />}
                        {electric && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                        {mailHasUnread(vin) && <MailOpen className="w-3.5 h-3.5 text-primary" />}
                        {isUnderwater && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Totalschaden</span>}
                        {isRepairable && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Reparierbar</span>}
                      </div>
                    </div>
                    {/* Preview-Felder */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 ml-6">
                      {previewCols.map(key => {
                        const val = formatValue(key, record[key]);
                        if (!val || val === '—') return null;
                        const custom = customCols.find(c => c.id === key);
                        const col = columns.find(c => c.key === key);
                        const label = getLabel(key, custom ? custom.label : (col?.label ?? key));
                        return (
                          <div key={key} className="min-w-0">
                            <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
                            <p className="text-xs font-medium text-foreground truncate">{val}</p>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (

          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
              <tr>
                {/* Checkbox Alle */}
                <th className="px-3 py-2.5 border-b border-border w-10 text-center">
                  <button
                    className="text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => toggleSelectAll(paged.map(r => String(r.vin)))}
                    title="Alle auf dieser Seite auswählen"
                  >
                    {paged.every(r => selected.has(String(r.vin)))
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : <Square className="w-4 h-4" />
                    }
                  </button>
                </th>
                {/* Status-Symbol Elektro */}
                <th className="px-2 py-2.5 border-b border-border w-8 text-center">
                  <Zap className="w-3.5 h-3.5 text-yellow-500 mx-auto" />
                </th>
                {displayedColumns.map(key => (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => handleDragStart(key)}
                    onDragEnter={() => handleDragEnter(key)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                    className="text-left px-3 py-2.5 font-medium text-muted-foreground border-b border-border whitespace-nowrap select-none group"
                    style={{ cursor: 'grab' }}
                  >
                    <div className="flex items-center gap-1">
                      <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={e => { e.stopPropagation(); handleSort(key); }}
                      >
                        {(() => {
                          const custom = customCols.find(c => c.id === key);
                          const col = columns.find(c => c.key === key);
                          const raw = custom ? custom.label : (col?.label ?? key);
                          return getLabel(key, raw);
                        })()}
                        {sort.key === key
                          ? sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          : <ArrowUpDown className="w-3 h-3 opacity-30" />
                        }
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((record, idx) => {
                const electric = isElectric(record);
                const isEV     = isEVehicle(record);
                const rowColor = record._color as string | undefined;
                const vin = String(record.vin);
                const isSelected = selected.has(vin);

                // Automatische Markierung: Reparaturkosten vs. Marktwert
                const { mv: marketVal, rc: repairCost } = getMvRc(record);
                const isUnderwater = !isNaN(marketVal) && !isNaN(repairCost) && repairCost > 0 && marketVal < repairCost;
                const isRepairable = !electric && !isNaN(marketVal) && !isNaN(repairCost) && repairCost > 0 && repairCost < marketVal;

                // Priorität: manuelle _color > ROT (underwater) > GRÜN (repairable) > Elektro-Gelb
                const rowBg = isSelected
                  ? 'bg-primary/10'
                  : rowColor
                    ? ''
                    : isUnderwater
                      ? ''
                      : isRepairable
                        ? ''
                        : isEV ? 'bg-yellow-100 hover:bg-yellow-200' : electric ? 'bg-yellow-50/70 hover:bg-yellow-200/70' : 'hover:bg-primary/5';

                const autoStyle: React.CSSProperties | undefined =
                  !isSelected && !rowColor && isUnderwater
                    ? { backgroundColor: '#fee2e2', borderLeft: '3px solid #ef4444' }
                    : !isSelected && !rowColor && isRepairable
                      ? { backgroundColor: '#dcfce7', borderLeft: '3px solid #16a34a' }
                      : !isSelected && rowColor
                        ? { backgroundColor: rowColor, borderLeft: `3px solid ${rowColor.slice(0, 7)}` }
                        : isSelected
                          ? { borderLeft: '3px solid var(--primary)' }
                          : isEV && !rowColor && !isUnderwater && !isRepairable
                            ? { backgroundColor: '#fef08a', borderLeft: '3px solid #eab308' }
                            : undefined;

                return (
                  <motion.tr
                    key={vin}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.015 }}
                    onClick={() => navigate(`/vehicles/${encodeURIComponent(vin)}`)}
                    className={`border-b border-border/50 transition-colors group cursor-pointer ${rowBg}`}
                    style={autoStyle}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5 text-center w-10" onClick={e => toggleSelect(vin, e)}>
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-primary mx-auto" />
                        : <Square className="w-4 h-4 text-muted-foreground/30 mx-auto group-hover:text-muted-foreground/60 transition-colors" />
                      }
                    </td>
                    {/* Elektro-Symbol + Mail-Badge */}
                    <td className="px-2 py-2.5 text-center w-8">
                      <div className="flex items-center justify-center gap-0.5 flex-wrap">
                        {isEV && (
                          <span className="inline-flex items-center gap-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1 py-0.5 rounded leading-none">
                            <Zap className="w-2.5 h-2.5 fill-yellow-900" />EV
                          </span>
                        )}
                        {!isEV && electric && (
                          <>
                            <Zap className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500 shrink-0" />
                            <AlertCircle className="w-3.5 h-3.5 fill-red-100 text-red-500 shrink-0" />
                          </>
                        )}
                        {mailHasUnread(vin) && (
                          <MailOpen className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Ungelesene E-Mails" />
                        )}
                      </div>
                    </td>
                    {displayedColumns.map(key => (
                      <td key={key} className="px-3 py-2.5 whitespace-nowrap">
                        {key === 'vin' ? (
                          <span className={`font-mono text-xs font-medium ${electric ? 'text-yellow-700' : 'text-accent'}`}>
                            {String(record[key] ?? '')}
                          </span>
                        ) : (key === 'Motorart' || key === 'Engine type') && isEV ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-900 bg-yellow-400 px-2 py-0.5 rounded-full shadow-sm">
                            <Zap className="w-3 h-3 fill-yellow-900" />
                            EV – Hochvolt
                          </span>
                        ) : (key === 'Motorart' || key === 'Engine type') && electric ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-700 bg-yellow-200/60 px-2 py-0.5 rounded-full">
                            <Zap className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                            {String(record[key] ?? '')}
                          </span>
                        ) : (
                          <span className="text-foreground/80 text-xs">{formatValue(key, record[key])}</span>
                        )}
                      </td>
                    ))}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          )} {/* Ende isMobile ternary */}
          </div>
        </div>
      )}

      {/* Pagination + Page-Size */}
      <div className={`border-t border-border ${isMobile ? 'px-3 py-3' : 'px-4 py-2.5'} flex flex-wrap items-center justify-between gap-2 text-sm`}>

        {/* Links: Treffer-Info + Page-Size-Wähler */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {pageSize === 0
              ? `Alle ${filtered.length} Fahrzeuge`
              : `${t('vehicles.page', { page, total: totalPages, count: filtered.length })}`
            }
          </span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Pro Seite:</span>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => {
                  const v = n;
                  setPageSize(v);
                  localStorage.setItem('fleet-page-size', String(v));
                  setPage(1);
                }}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  pageSize === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                }`}
              >
                {n === 0 ? 'Alle' : n}
              </button>
            ))}
          </div>
        </div>

        {/* Rechts: Blättern */}
        {pageSize !== 0 && totalPages > 1 && (
          <div className="flex gap-1">
            <Button variant="outline" size={isMobile ? 'default' : 'sm'} className={isMobile ? 'h-10 w-10' : 'h-7 w-7 p-0'} onClick={() => setPage(1)} disabled={page === 1}>«</Button>
            <Button variant="outline" size={isMobile ? 'default' : 'sm'} className={isMobile ? 'h-10 w-10' : 'h-7 w-7 p-0'} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</Button>
            <span className="flex items-center px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size={isMobile ? 'default' : 'sm'} className={isMobile ? 'h-10 w-10' : 'h-7 w-7 p-0'} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</Button>
            <Button variant="outline" size={isMobile ? 'default' : 'sm'} className={isMobile ? 'h-10 w-10' : 'h-7 w-7 p-0'} onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</Button>
          </div>
        )}
      </div>
    </div>

    {/* ── QR-Code-Druck-Dialog ───────────────────────────────────────── */}
    <Dialog open={showQRDialog} onOpenChange={v => { if (!qrPrinting) { setShowQRDialog(v); if (!v) setQrSearch(''); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            {t('vehicles.qrDialog.title')}
          </DialogTitle>
          <DialogDescription>{t('vehicles.qrDialog.desc')}</DialogDescription>
        </DialogHeader>

        {/* Suchfeld */}
        <div className="relative px-1 pt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={qrSearch}
            onChange={e => setQrSearch(e.target.value)}
            placeholder={t('vehicles.qrDialog.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {qrSearch && (
            <button
              onClick={() => setQrSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Aktionen oben */}
        <div className="flex items-center gap-2 px-1 py-1 border-b border-border">
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
            onClick={() => {
              const q = qrSearch.toLowerCase();
              const visible = records.filter(r => {
                const vin   = String(r['VIN'] ?? r['vin'] ?? '').toLowerCase();
                const maker = String(r['Hersteller'] ?? r['hersteller'] ?? '').toLowerCase();
                const model = String(r['Modell'] ?? r['modell'] ?? '').toLowerCase();
                return !q || vin.includes(q) || maker.includes(q) || model.includes(q);
              });
              setQrSelected(new Set(visible.map(r => String(r['VIN'] ?? r['vin'] ?? ''))));
            }}
          >{t('vehicles.qrDialog.selectAll')}</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
            onClick={() => setQrSelected(new Set())}
          >{t('vehicles.qrDialog.selectNone')}</Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t('vehicles.qrDialog.selected', { count: qrSelected.size })}
          </span>
        </div>

        {/* Fahrzeugliste */}
        <div className="overflow-y-auto flex-1 px-1 py-1">
          <div className="space-y-0.5">
            {records
              .filter(r => {
                const q = qrSearch.toLowerCase();
                if (!q) return true;
                const vin   = String(r['VIN'] ?? r['vin'] ?? '').toLowerCase();
                const maker = String(r['Hersteller'] ?? r['hersteller'] ?? '').toLowerCase();
                const model = String(r['Modell'] ?? r['modell'] ?? '').toLowerCase();
                return vin.includes(q) || maker.includes(q) || model.includes(q);
              })
              .map(r => {
                const vin = String(r['VIN'] ?? r['vin'] ?? '');
                const maker = String(r['Hersteller'] ?? r['hersteller'] ?? '');
                const model = String(r['Modell'] ?? r['modell'] ?? '');
                const checked = qrSelected.has(vin);
                return (
                  <div
                    key={vin}
                    onClick={() => {
                      if (!vin) return;
                      setQrSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(vin)) next.delete(vin); else next.add(vin);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
                      ${checked ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-muted/50'}`}
                  >
                    <div className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors
                      ${checked ? 'border-primary bg-primary' : 'border-border'}`}>
                      {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white"><path d="M1 4l3 3 5-6"/></svg>}
                    </div>
                    <code className="text-xs font-mono text-muted-foreground w-36 shrink-0">{vin || '—'}</code>
                    <span className="text-xs truncate">{[maker, model].filter(Boolean).join(' ')}</span>
                  </div>
                );
              })}
          </div>
          {records.filter(r => {
            const q = qrSearch.toLowerCase();
            if (!q) return false;
            const vin   = String(r['VIN'] ?? r['vin'] ?? '').toLowerCase();
            const maker = String(r['Hersteller'] ?? r['hersteller'] ?? '').toLowerCase();
            const model = String(r['Modell'] ?? r['modell'] ?? '').toLowerCase();
            return vin.includes(q) || maker.includes(q) || model.includes(q);
          }).length === 0 && qrSearch && (
            <p className="text-center text-xs text-muted-foreground py-4">{t('vehicles.qrDialog.noResults')}</p>
          )}
        </div>

        {/* Fortschritt */}
        {qrPrinting && (
          <div className="px-1 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('vehicles.qrDialog.generating', { progress: qrProgress })}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${qrProgress}%` }} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setShowQRDialog(false); setQrSearch(''); }} disabled={qrPrinting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleQRPrint}
            disabled={qrSelected.size === 0 || qrPrinting}
            className="gap-1.5"
          >
            {qrPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {t('vehicles.qrDialog.download', { count: qrSelected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* ── Neues Fahrzeug anlegen ────────────── */}
      {isAdmin && (
        <NewVehicleDialog open={showNewVehicle} onClose={() => setShowNewVehicle(false)} />
      )}

      {/* ── Bulk-Archivieren Bestätigung ────────── */}
      {isAdmin && (
        <AlertDialog open={confirmBulkArchive} onOpenChange={setConfirmBulkArchive}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-orange-600" />
                {selected.size === 1 ? 'Fahrzeug archivieren?' : `${selected.size} Fahrzeuge archivieren?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Die Fahrzeuge werden ins Archiv verschoben und können jederzeit wiederhergestellt werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction className="bg-orange-600 hover:bg-orange-500" onClick={() => {
                // _rowId-basiertes Archivieren – kein VIN-Duplikat-Matching
                const selectedVins  = Array.from(selected);
                const selectedRowIds = allRecords
                  .filter(r => selected.has(String(r.vin)))
                  .map(r => r._rowId ? String(r._rowId) : '')
                  .filter(Boolean);
                archiveMultiple(selectedVins, currentUser?.name ?? 'Admin', selectedRowIds.length > 0 ? selectedRowIds : undefined);
                setSelected(new Set());
                setConfirmBulkArchive(false);
              }}>
                <Archive className="w-4 h-4 mr-1.5" /> Archivieren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ── Archiv-Dialog ───────────────────────── */}
      {isAdmin && (
        <Dialog open={showArchive} onOpenChange={setShowArchive}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-orange-600" />
                Fahrzeug-Archiv
              </DialogTitle>
              <DialogDescription>
                Archivierte Fahrzeuge können wiederhergestellt oder endgültig gelöscht werden.
              </DialogDescription>
            </DialogHeader>
            <ArchiveView />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
