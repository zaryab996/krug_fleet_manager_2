/**
 * Dashboard – Persönliche Statistikseite
 * - Wichtigste KPIs vorbelegt
 * - Alle importierten Spalten frei selektierbar
 * - Admin kann Layout für jeden Benutzer vorgeben
 * - Berechtigungen: canViewDashboard / canEditDashboard / canOverrideDashboardLayout
 */
import { useState, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, CartesianGrid
} from 'recharts';
import {
  LayoutDashboard, Plus, X, GripVertical, Settings2, Lock,
  ChevronDown, ChevronUp, RefreshCw, BarChart2, PieChart as PieIcon,
  Activity, Hash, Euro as EuroIcon, Car, Zap, Wrench, TrendingUp,
  Users, Shield, Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  useFleetStore, useAuthStore, useDocPermStore, useUsersStore,
  useDashboardLayoutStore, type DashboardWidget
} from '@/hooks/useStore';

const COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
  '#14b8a6','#f43f5e','#a855f7','#22c55e','#eab308',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseCur = (v: unknown) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const isNumCol = (records: { [k: string]: unknown }[], key: string) => {
  const vals = records.map(r => r[key]).filter(v => v !== undefined && v !== null && v !== '');
  if (!vals.length) return false;
  return vals.slice(0, 30).filter(v => parseCur(v) > 0).length > vals.slice(0, 30).length * 0.5;
};
const countBy = (records: { [k: string]: unknown }[], key: string) => {
  const m: Record<string, number> = {};
  records.forEach(r => { const v = String(r[key] ?? '').trim() || '(leer)'; m[v] = (m[v] ?? 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
};
const topN = (d: { name: string; value: number }[], n = 12) => {
  if (d.length <= n) return d;
  const rest = d.slice(n - 1).reduce((s, x) => s + x.value, 0);
  return [...d.slice(0, n - 1), { name: 'Sonstige', value: rest }];
};

// ─── Standard KPI-Widgets (automatisch belegt) ────────────────────────────────
// Diese werden aus den Fahrzeugdaten berechnet, nicht aus einer Spalte
type SpecialKpi = 'special_total'|'special_electric'|'special_repair_sum'|'special_avg_repair'|'special_underwater'|'special_archived';

const SPECIAL_KPIS: { type: SpecialKpi; label: string; desc: string; icon: React.ElementType }[] = [
  { type: 'special_total',       label: 'Fahrzeuge gesamt',        desc: 'Alle aktiven Fahrzeuge',                       icon: Car         },
  { type: 'special_electric',    label: 'Elektrofahrzeuge',         desc: 'Anzahl + Anteil Elektro/Hybrid',               icon: Zap         },
  { type: 'special_repair_sum',  label: 'Reparaturkosten gesamt',   desc: 'Summe aller Reparaturkosten',                  icon: EuroIcon    },
  { type: 'special_avg_repair',  label: 'Ø Reparaturkosten',        desc: 'Durchschnitt pro Fahrzeug',                    icon: TrendingUp  },
  { type: 'special_underwater',  label: 'Unterwasser-Fahrzeuge',    desc: 'Rep.kosten > Wiederbeschaffungswert',           icon: Wrench      },
  { type: 'special_archived',    label: 'Archivierte Fahrzeuge',    desc: 'Im Archiv abgelegte Fahrzeuge',                icon: Activity    },
];

// ─── Sub-Komponenten ──────────────────────────────────────────────────────────
function KpiCard({ value, sub, icon: Icon, color = 'text-primary' }: { value: string | number; sub: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className={`${color} opacity-80`}><Icon className="w-7 h-7" /></div>
      <div>
        <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
function PieW({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="text-xs text-muted-foreground py-4 text-center">Keine Daten</p>;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius={78}
          label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent*100).toFixed(0)}%` : ''} labelLine={false} fontSize={10}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
function BarW({ data, numeric }: { data: { name: string; value: number }[]; numeric?: boolean }) {
  if (!data.length) return <p className="text-xs text-muted-foreground py-4 text-center">Keine Daten</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 10, bottom: 2, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={numeric ? fmtEur : undefined} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
        <Tooltip formatter={(v: number) => numeric ? fmtEur(v) : v} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function LineW({ data, numeric }: { data: { name: string; value: number }[]; numeric?: boolean }) {
  if (!data.length) return <p className="text-xs text-muted-foreground py-4 text-center">Keine Daten</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={numeric ? fmtEur : undefined} tick={{ fontSize: 10 }} width={numeric ? 72 : 40} />
        <Tooltip formatter={(v: number) => numeric ? fmtEur(v) : v} />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Widget-Renderer ──────────────────────────────────────────────────────────
function Widget({ config, records, allRecords, onRemove, canEdit }: {
  config: DashboardWidget; records: { [k: string]: unknown }[];
  allRecords: { [k: string]: unknown }[]; onRemove: () => void; canEdit: boolean;
}) {
  const repairKey  = ['Reparaturkosten netto','Reparaturkosten','Net damage amount','repair_cost'].find(k => records.some(r => r[k] !== undefined)) ?? 'Reparaturkosten netto';
  const replaceKey = ['Wiederbeschaffungswert','replacement_value','Replacement value'].find(k => records.some(r => r[k] !== undefined)) ?? 'Wiederbeschaffungswert';
  const isElectric = (r: { [k: string]: unknown }) => Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes('elektro'));

  const renderContent = () => {
    // ── Special KPIs ──────────────────────────────────────────────
    if (config.type === 'kpi_count' && (config.colKey as string).startsWith('special_')) {
      const sk = config.colKey as SpecialKpi;
      switch (sk) {
        case 'special_total':
          return <KpiCard value={records.length} sub="aktive Fahrzeuge" icon={Car} color="text-blue-600" />;
        case 'special_electric': {
          const c = records.filter(isElectric).length;
          const pct = records.length > 0 ? Math.round(c / records.length * 100) : 0;
          return <KpiCard value={c} sub={`Elektrofahrzeuge (${pct} %)`} icon={Zap} color="text-yellow-500" />;
        }
        case 'special_repair_sum': {
          const s = records.reduce((a, r) => a + parseCur(r[repairKey]), 0);
          return <KpiCard value={fmtEur(s)} sub="Reparaturkosten gesamt" icon={EuroIcon} color="text-red-500" />;
        }
        case 'special_avg_repair': {
          const vals = records.map(r => parseCur(r[repairKey])).filter(v => v > 0);
          const avg = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
          return <KpiCard value={fmtEur(avg)} sub="Ø Reparaturkosten / Fzg" icon={TrendingUp} color="text-orange-500" />;
        }
        case 'special_underwater': {
          const c = records.filter(r => { const a = parseCur(r[repairKey]); const b = parseCur(r[replaceKey]); return a > 0 && b > 0 && a > b; }).length;
          return <KpiCard value={c} sub="Unterwasser (Rep > WBW)" icon={Wrench} color="text-destructive" />;
        }
        case 'special_archived': {
          const c = allRecords.filter(r => r['_archived'] === true).length;
          return <KpiCard value={c} sub="archivierte Fahrzeuge" icon={Activity} color="text-muted-foreground" />;
        }
      }
    }
    // ── Dynamische Spalten ────────────────────────────────────────
    const col = config.colKey;
    const isNum = isNumCol(records, col);
    switch (config.type) {
      case 'kpi_count': {
        const c = records.filter(r => String(r[col] ?? '').trim() !== '').length;
        return <KpiCard value={c} sub={`Einträge in „${col}"`} icon={Hash} />;
      }
      case 'kpi_sum': {
        const s = records.reduce((a, r) => a + parseCur(r[col]), 0);
        return <KpiCard value={fmtEur(s)} sub={`Summe „${col}"`} icon={EuroIcon} color="text-green-600" />;
      }
      case 'kpi_avg': {
        const vals = records.map(r => parseCur(r[col])).filter(v => v > 0);
        const avg = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
        return <KpiCard value={fmtEur(avg)} sub={`Ø „${col}"`} icon={TrendingUp} color="text-blue-600" />;
      }
      case 'pie':  return <PieW data={topN(countBy(records, col))} />;
      case 'bar_count': return <BarW data={topN(countBy(records, col))} />;
      case 'bar_sum': {
        const lk = ['Hersteller','Marke','vin'].find(k => records.some(r => r[k])) ?? 'vin';
        const d = records.map(r => ({ name: String(r[lk] ?? r['vin'] ?? '').slice(0,18), value: parseCur(r[col]) }))
          .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
        return <BarW data={d} numeric />;
      }
      case 'line_values': {
        const d = records.map(r => ({ name: String(r['vin'] ?? '').slice(-6), value: parseCur(r[col]) }))
          .filter(d => d.value > 0).sort((a, b) => a.value - b.value);
        return <LineW data={d} numeric={isNum} />;
      }
      default: return <p className="text-xs text-muted-foreground">Unbekannt</p>;
    }
  };

  const title = config.title ?? (config.colKey.startsWith('special_')
    ? SPECIAL_KPIS.find(s => s.type === config.colKey as SpecialKpi)?.label ?? config.colKey
    : config.colKey);

  return (
    <Card className="relative group flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 truncate min-w-0">
          {canEdit && <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
          <span className="truncate">{title}</span>
        </CardTitle>
        {canEdit && (
          <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1">{renderContent()}</CardContent>
    </Card>
  );
}

// ─── Default-Layout mit wichtigsten Statistiken ────────────────────────────────
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'd1', type: 'kpi_count',   colKey: 'special_total',      title: 'Fahrzeuge gesamt'        },
  { id: 'd2', type: 'kpi_count',   colKey: 'special_electric',   title: 'Elektrofahrzeuge'         },
  { id: 'd3', type: 'kpi_count',   colKey: 'special_repair_sum', title: 'Reparaturkosten gesamt'   },
  { id: 'd4', type: 'kpi_count',   colKey: 'special_avg_repair', title: 'Ø Reparaturkosten'        },
  { id: 'd5', type: 'kpi_count',   colKey: 'special_underwater', title: 'Unterwasser-Fahrzeuge'    },
  { id: 'd6', type: 'kpi_count',   colKey: 'special_archived',   title: 'Archivierte Fahrzeuge'    },
  { id: 'd7', type: 'pie',         colKey: 'Motorart',            title: 'Motorarten'               },
  { id: 'd8', type: 'bar_count',   colKey: 'Hersteller',          title: 'Hersteller-Verteilung'    },
  { id: 'd9', type: 'bar_sum',     colKey: 'Reparaturkosten netto', title: 'Reparaturkosten Top 12' },
];

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { fleetData }      = useFleetStore();
  const { currentUser } = useAuthStore();
  const { users } = useUsersStore();
  const { getPermission, setPermission } = useDocPermStore();
  const { setAdminLayout, setGlobalLayout, getLayoutForUser, adminLayouts, globalLayout } = useDashboardLayoutStore();

  const uid     = currentUser?.id ?? 'guest';
  const isAdmin = currentUser?.role === 'admin';
  const myPerm  = getPermission(uid, currentUser?.role ?? 'viewer');
  const canView = isAdmin || myPerm.canViewDashboard;
  const canEdit = isAdmin || myPerm.canEditDashboard;

  const storeKey = `fleet-dashboard-v3-${uid}`;
  const allRecords  = fleetData.records;
  const liveRecords = useMemo(() => allRecords.filter(r => !r['_archived']), [allRecords]);

  // Layout-Entscheidung: eigenes > admin-vorgegeben > global > default
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    if (!isAdmin && !myPerm.canOverrideDashboardLayout) {
      const adminW = getLayoutForUser(uid);
      if (adminW && adminW.length > 0) return adminW;
    }
    try {
      const s = localStorage.getItem(storeKey);
      if (s) return JSON.parse(s) as DashboardWidget[];
    } catch { /* */ }
    const adminW = getLayoutForUser(uid);
    return adminW && adminW.length > 0 ? adminW : DEFAULT_WIDGETS;
  });

  const allColumns  = useMemo(() => { const k = new Set<string>(); allRecords.forEach(r => Object.keys(r as object).filter(col => !col.startsWith('_')).forEach(col => k.add(col))); return Array.from(k).sort(); }, [allRecords]);
  const numCols     = useMemo(() => allColumns.filter(k => isNumCol(liveRecords, k)), [allColumns, liveRecords]);
  const textCols    = useMemo(() => allColumns.filter(k => !isNumCol(liveRecords, k)), [allColumns, liveRecords]);

  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [showFilters,   setShowFilters]   = useState(false);
  const [showPicker,    setShowPicker]    = useState(false);
  const [showAdminMgr,  setShowAdminMgr]  = useState(false);
  const [pickerCol,     setPickerCol]     = useState('');
  const [pickerType,    setPickerType]    = useState<DashboardWidget['type']>('pie');
  const [adminTarget,   setAdminTarget]   = useState<'global' | string>('global');

  const filtered = useMemo(() => liveRecords.filter(r => Object.entries(activeFilters).every(([k, v]) => !v || String(r[k] ?? '').toLowerCase().includes(v.toLowerCase()))), [liveRecords, activeFilters]);

  const save = useCallback((w: DashboardWidget[]) => { setWidgets(w); if (canEdit) localStorage.setItem(storeKey, JSON.stringify(w)); }, [storeKey, canEdit]);

  const addWidget = () => {
    if (!pickerCol) return;
    save([...widgets, { id: Date.now().toString(), type: pickerType, colKey: pickerCol }]);
    setShowPicker(false);
  };
  const removeWidget = (id: string) => save(widgets.filter(w => w.id !== id));
  const moveUp   = (i: number) => { if (i === 0) return; const w=[...widgets]; [w[i-1],w[i]]=[w[i],w[i-1]]; save(w); };
  const moveDown = (i: number) => { if (i===widgets.length-1) return; const w=[...widgets]; [w[i],w[i+1]]=[w[i+1],w[i]]; save(w); };
  const reset    = () => { localStorage.removeItem(storeKey); const aw=getLayoutForUser(uid); setWidgets(aw?.length ? aw : DEFAULT_WIDGETS); setActiveFilters({}); };

  const pickerIsNum = pickerCol ? isNumCol(liveRecords, pickerCol) : false;
  const typeOpts: { value: DashboardWidget['type']; label: string; icon: React.ElementType }[] = pickerIsNum
    ? [{ value:'kpi_sum',label:'KPI – Summe',icon:EuroIcon },{ value:'kpi_avg',label:'KPI – Durchschnitt (Ø)',icon:TrendingUp },{ value:'bar_sum',label:'Balken – Top-Werte',icon:BarChart2 },{ value:'line_values',label:'Linie – Verteilung',icon:Activity }]
    : [{ value:'kpi_count',label:'KPI – Anzahl',icon:Hash },{ value:'pie',label:'Kreisdiagramm',icon:PieIcon },{ value:'bar_count',label:'Balken – Häufigkeit',icon:BarChart2 }];

  const filterCount = Object.values(activeFilters).filter(Boolean).length;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Lock className="w-10 h-10 opacity-30" />
        <p className="font-medium">Dashboard nicht freigegeben</p>
        <p className="text-sm">Bitte den Administrator um Zugang.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 md:px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-base font-semibold flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-primary" />
              Mein Dashboard
              {filterCount > 0 && <Badge variant="secondary" className="text-xs">{filtered.length} / {liveRecords.length} Fzg</Badge>}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {liveRecords.length} Fahrzeuge · {allColumns.length} Spalten · Layout wird automatisch gespeichert
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowFilters(v => !v)}>
              <Settings2 className="w-3.5 h-3.5" />Filter{filterCount > 0 ? ` (${filterCount})` : ''}{showFilters ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={reset} title="Layout zurücksetzen">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
            {canEdit && (
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => { setPickerCol(allColumns[0]??''); setPickerType('pie'); setShowPicker(true); }}>
                <Plus className="w-3.5 h-3.5" /> Widget hinzufügen
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-primary/40 text-primary hover:bg-primary/5" onClick={() => setShowAdminMgr(true)}>
                <Shield className="w-3.5 h-3.5" /> Dashboard-Rechte
              </Button>
            )}
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground">Spalten filtern:</span>
              {filterCount > 0 && <button onClick={() => setActiveFilters({})} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"><X className="w-3 h-3"/>zurücksetzen</button>}
            </div>
            <div className="flex flex-wrap gap-2">
              {allColumns.map(col => {
                const vals = [...new Set(liveRecords.map(r => String(r[col] ?? '').trim()).filter(Boolean))].sort();
                if (vals.length < 2 || vals.length > 80 || isNumCol(liveRecords, col)) return null;
                return (
                  <div key={col} className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{col}:</span>
                    <select value={activeFilters[col] ?? ''} onChange={e => setActiveFilters(f => ({ ...f, [col]: e.target.value }))}
                      className="h-6 text-[11px] border border-border rounded px-1 bg-background text-foreground max-w-[140px]">
                      <option value="">Alle</option>
                      {vals.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Widget-Grid ──────────────────────────────────────────── */}
      <div className="flex-1 p-4 md:p-6">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
            <LayoutDashboard className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center">Noch keine Widgets. Füge Statistiken aus deinen Fahrzeugdaten hinzu.</p>
            {canEdit && <Button onClick={() => { setPickerCol(allColumns[0]??''); setPickerType('pie'); setShowPicker(true); }} size="sm" className="gap-2"><Plus className="w-4 h-4"/>Erstes Widget</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {widgets.map((w, i) => (
              <div key={w.id} className="relative group">
                {canEdit && (
                  <div className="absolute top-1.5 right-8 z-10 hidden group-hover:flex flex-col">
                    <button onClick={() => moveUp(i)}   className="p-0.5 text-muted-foreground hover:text-primary"><ChevronUp   className="w-3 h-3"/></button>
                    <button onClick={() => moveDown(i)} className="p-0.5 text-muted-foreground hover:text-primary"><ChevronDown className="w-3 h-3"/></button>
                  </div>
                )}
                <Widget config={w} records={filtered} allRecords={allRecords} onRemove={() => removeWidget(w.id)} canEdit={canEdit} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Widget-Picker ─────────────────────────────────────────── */}
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-primary"/>Widget hinzufügen</DialogTitle>
            <DialogDescription>Wähle eine Datenspalte und den gewünschten Diagrammtyp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Wichtigste KPIs als Schnellauswahl */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Wichtige Statistiken</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SPECIAL_KPIS.map(sk => {
                  const Icon = sk.icon;
                  const already = widgets.some(w => w.colKey === sk.type);
                  return (
                    <button key={sk.type}
                      onClick={() => { save([...widgets, { id: Date.now().toString(), type: 'kpi_count', colKey: sk.type, title: sk.label }]); setShowPicker(false); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${already ? 'opacity-50 border-border' : 'border-border hover:border-primary hover:bg-primary/5'}`}>
                      <Icon className="w-3.5 h-3.5 text-primary shrink-0"/>{sk.label}
                      {already && <Badge variant="secondary" className="text-[9px] ml-auto">aktiv</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Eigene Spalte ({allColumns.length} verfügbar)</p>
              <select value={pickerCol} onChange={e => { setPickerCol(e.target.value); setPickerType('pie'); }}
                className="w-full h-9 border border-border rounded-md px-3 text-sm bg-background text-foreground mb-2">
                <option value="">Spalte wählen…</option>
                <optgroup label={`Textspalten (${textCols.length})`}>{textCols.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                <optgroup label={`Zahlenspalten (${numCols.length})`}>{numCols.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
              </select>
              {pickerCol && (
                <div className="grid grid-cols-1 gap-1.5">
                  {typeOpts.map(opt => { const Icon = opt.icon; return (
                    <button key={opt.value} onClick={() => setPickerType(opt.value)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${pickerType===opt.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:border-primary/50'}`}>
                      <Icon className="w-4 h-4 shrink-0"/>{opt.label}
                    </button>
                  ); })}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowPicker(false)}>Abbrechen</Button>
            <Button onClick={addWidget} disabled={!pickerCol} className="gap-2"><Plus className="w-4 h-4"/>Hinzufügen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Admin: Dashboard-Rechte & Layout-Vorgabe ──────────────── */}
      {isAdmin && (
        <Dialog open={showAdminMgr} onOpenChange={setShowAdminMgr}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary"/>Dashboard-Rechte & Layout-Vorgaben</DialogTitle>
              <DialogDescription>Lege fest was jeder Benutzer im Dashboard sehen und machen darf. Vorgabe-Layout wird angezeigt wenn der Nutzer kein eigenes hat.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              {/* Globales Vorgabe-Layout */}
              <Card className="border-primary/30">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary"/>Standard-Layout (für alle Nutzer ohne eigenes Layout)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-2">Aktuell: {globalLayout.length > 0 ? `${globalLayout.length} Widgets vorgegeben` : 'Standard-Widgets (automatisch)'}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => { setGlobalLayout(widgets); setShowAdminMgr(false); }}>
                      <Save className="w-3 h-3"/>Mein aktuelles Layout als Standard setzen
                    </Button>
                    {globalLayout.length > 0 && (
                      <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" onClick={() => setGlobalLayout([])}>
                        Standard zurücksetzen
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Benutzer-Rechte */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Benutzer-Einstellungen</p>
                <div className="space-y-3">
                  {(users || []).filter((user: { id: string; name: string; email: string; role: string }) => user.role !== 'admin').map((user: { id: string; name: string; email: string; role: string }) => {
                    const perm = getPermission(user.id, user.role);
                    const userLayout = adminLayouts[user.id];
                    return (
                      <Card key={user.id} className="border-border">
                        <CardContent className="px-4 py-3">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                              {user.name.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.role} · {user.email}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                            {[
                              { key: 'canViewDashboard',            label: 'Dashboard sehen'         },
                              { key: 'canEditDashboard',            label: 'Eigenes Layout ändern'   },
                              { key: 'canOverrideDashboardLayout',  label: 'Admin-Layout überschr.'  },
                            ].map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                  checked={!!(perm as unknown as Record<string, unknown>)[key]}
                                  onCheckedChange={val => setPermission({ ...perm, [key]: val })}
                                />
                                <span className="text-xs">{label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => { setAdminLayout(user.id, widgets); }}>
                              <Save className="w-3 h-3"/>Mein Layout für {user.name.split(' ')[0]} vorgeben
                            </Button>
                            {userLayout && (
                              <Button size="sm" variant="outline" className="text-xs h-7 text-destructive" onClick={() => { const al = { ...adminLayouts }; delete al[user.id]; setGlobalLayout(globalLayout); }}>
                                Layout-Vorgabe löschen
                              </Button>
                            )}
                            {userLayout && <Badge variant="secondary" className="text-[10px]">{userLayout.length} Widgets vorgegeben</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
