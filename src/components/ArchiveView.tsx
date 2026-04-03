/**
 * ArchiveView – Archivierte Fahrzeuge (Papierkorb).
 * Admins können Fahrzeuge wiederherstellen oder endgültig löschen.
 */
import { useState, useMemo } from 'react';
import {
  ArchiveRestore, Trash2, RotateCcw, Search, AlertTriangle,
  CheckSquare, Square, ChevronDown, ChevronUp, Calendar, User
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFleetStore, useAuthStore } from '@/hooks/useStore';

export default function ArchiveView() {
  const {
    getArchivedVehicles, restoreVehicle, restoreMultiple,
    permanentlyDelete, permanentlyDeleteMultiple,
  } = useFleetStore();
  const { currentUser } = useAuthStore();

  const archived    = getArchivedVehicles();
  const [query,     setQuery]     = useState('');
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [sortKey,   setSortKey]   = useState<'vin' | '_archivedAt'>('_archivedAt');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');

  // Confirm dialogs
  const [confirmRestore,  setConfirmRestore]  = useState<string[] | null>(null); // null = closed
  const [confirmDelete,   setConfirmDelete]   = useState<string[] | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return archived
      .filter(r =>
        !q ||
        String(r.vin).toLowerCase().includes(q) ||
        String(r['Hersteller'] ?? '').toLowerCase().includes(q) ||
        String(r['Haupttyp'] ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = String(a[sortKey] ?? '');
        const bv = String(b[sortKey] ?? '');
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [archived, query, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.vin)));
  }

  function toggleOne(vin: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(vin) ? n.delete(vin) : n.add(vin);
      return n;
    });
  }

  function SortIcon({ k }: { k: typeof sortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5 text-primary" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5 text-primary" />;
  }

  if (!isAdmin) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
      Kein Zugriff – nur für Administratoren.
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <ArchiveRestore className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="font-semibold text-sm">Archiv</p>
            <p className="text-xs text-muted-foreground">
              {archived.length} archivierte{archived.length === 1 ? 's' : ''} Fahrzeug{archived.length !== 1 ? 'e' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Search + Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="VIN, Hersteller, Modell suchen…"
            className="pl-8 h-9 text-sm"
          />
        </div>

        {selected.size > 0 && (
          <>
            <Button variant="outline" size="sm" className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => setConfirmRestore(Array.from(selected))}>
              <RotateCcw className="w-3.5 h-3.5" />
              {selected.size} wiederherstellen
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setConfirmDelete(Array.from(selected))}>
              <Trash2 className="w-3.5 h-3.5" />
              {selected.size} endgültig löschen
            </Button>
          </>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <ArchiveRestore className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-sm text-muted-foreground">
            {archived.length === 0 ? 'Archiv ist leer' : 'Keine Treffer für diese Suche'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {archived.length === 0
              ? 'Gelöschte Fahrzeuge erscheinen hier und können wiederhergestellt werden.'
              : 'Suchbegriff anpassen oder Filter leeren.'
            }
          </p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-left">
                    <button onClick={toggleAll}>
                      {selected.size === filtered.length && filtered.length > 0
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />
                      }
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('vin')}>
                    VIN <SortIcon k="vin" />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Hersteller / Modell</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('_archivedAt')}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />Archiviert am<SortIcon k="_archivedAt" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Von</span>
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isSelected = selected.has(r.vin);
                  const archivedAt = r._archivedAt
                    ? new Date(String(r._archivedAt)).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '–';
                  return (
                    <tr key={r.vin}
                      className={`border-b border-border last:border-0 transition-colors ${isSelected ? 'bg-primary/5' : i % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-muted/40`}
                    >
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleOne(r.vin)}>
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-medium">{r.vin}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{String(r['Hersteller'] ?? '–')}</span>
                        {r['Haupttyp'] && (
                          <span className="text-muted-foreground ml-1.5 text-xs">{String(r['Haupttyp'])}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{archivedAt}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{String(r._archivedBy ?? '–')}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => setConfirmRestore([r.vin])}>
                            <RotateCcw className="w-3 h-3" /> Wiederherstellen
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDelete([r.vin])}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restore Confirm */}
      <AlertDialog open={!!confirmRestore} onOpenChange={v => { if (!v) setConfirmRestore(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-600" />
              Fahrzeug{(confirmRestore?.length ?? 0) > 1 ? 'e' : ''} wiederherstellen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(confirmRestore?.length ?? 0) === 1
                ? `VIN ${confirmRestore?.[0]} wird ins Live-System zurückgesetzt.`
                : `${confirmRestore?.length} Fahrzeuge werden ins Live-System zurückgesetzt.`
              }
              {' '}Alle Daten und Dokumente bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-green-600 hover:bg-green-500" onClick={() => {
              if (!confirmRestore) return;
              confirmRestore.length === 1
                ? restoreVehicle(confirmRestore[0])
                : restoreMultiple(confirmRestore);
              setSelected(new Set());
              setConfirmRestore(null);
            }}>
              Wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Endgültig löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(confirmDelete?.length ?? 0) === 1
                ? `VIN ${confirmDelete?.[0]} wird permanent gelöscht.`
                : `${confirmDelete?.length} Fahrzeuge werden permanent gelöscht.`
              }
              {' '}<strong className="text-foreground">Diese Aktion kann nicht rückgängig gemacht werden.</strong>
              {' '}Alle zugehörigen Dokumente und Daten gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => {
              if (!confirmDelete) return;
              confirmDelete.length === 1
                ? permanentlyDelete(confirmDelete[0])
                : permanentlyDeleteMultiple(confirmDelete);
              setSelected(new Set());
              setConfirmDelete(null);
            }}>
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
