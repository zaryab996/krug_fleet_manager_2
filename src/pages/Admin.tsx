import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Plus, Edit2, Trash2, Key, Check, X,
  AlertTriangle, Eye, Pencil, Crown, Palette, Columns,
  GripVertical, Save, RotateCcw, ChevronDown, ChevronUp,
  Paperclip, FileText, ImageIcon, Lock, Unlock, Car, Search, Tags,
  Mail, CheckCircle2, Copy, ExternalLink, Settings2, Upload, FolderUp,
  HardDrive, Filter, SortAsc, SortDesc, Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUsersStore, useAuthStore, useColorLegendStore, useColumnConfigStore, useFleetStore, useDocPermStore, useVehicleAccessStore, useUserGroupStore, useCustomColumnsStore, useBackupStore, useRolesStore, useDocsStore } from '@/hooks/useStore';
import { sendWelcomeEmail, loadEmailSettings, saveEmailSettings, isEmailConfigured, isVehicleMailConfigured } from '@/lib/emailService';
import type { EmailSettings } from '@/lib/emailService';
import type { BackupSnapshot } from '@/hooks/useStore';
import type { User, UserRole, UserDocPermission, UserGroup, CustomRole, BuiltinRole } from '@/lib/types';
import { MAX_SNAPSHOTS } from '@/lib/backupManager';
import { useTranslation } from 'react-i18next';
import DatabaseConfigTab from '@/components/DatabaseConfigTab';


// ─── Farbpalette (identisch zu VehicleDetail) ─────────────────────────
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

type AdminTab = 'users' | 'groups' | 'manage_columns' | 'colors' | 'columns' | 'docperms' | 'detailfields' | 'vehicleaccess' | 'backups' | 'roles' | 'email' | 'files' | 'supabase';

interface UserFormData {
  name: string; email: string; role: UserRole;
  password: string; confirmPassword: string;
}
const defaultForm: UserFormData = { name: '', email: '', role: 'viewer', password: '', confirmPassword: '' };

// ─── Spalten-Konfigurator ─────────────────────────────────────────────
interface ColumnConfigEditorProps {
  user: User;
  onClose: () => void;
}
function ColumnConfigEditor({ user, onClose }: ColumnConfigEditorProps) {
  const { t } = useTranslation();
  const { fleetData } = useFleetStore();
  const { getConfig, setConfig, deleteConfig, setDetailFields } = useColumnConfigStore();
  const { permissions: docPerms, getPermission, setPermission } = useDocPermStore();

  const allColumns = fleetData.columns
    .map(c => c.key)
    .filter(k => !k.startsWith('_'));

  const savedConfig = getConfig(user.id);
  const initCols = savedConfig?.visibleColumns.length
    ? savedConfig.visibleColumns.filter(k => allColumns.includes(k))
    : allColumns;

  const [cols, setCols] = useState<string[]>(initCols);
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [saved, setSaved] = useState(false);

  // Spalte an/ab-schalten
  const toggleCol = (key: string) => {
    setCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Alle ein / alle aus
  const selectAll = () => setCols([...allColumns]);
  const clearAll  = () => setCols([]);

  // Drag & Drop Reihenfolge
  const handleDragStart = useCallback((i: number) => { dragIdx.current = i; }, []);
  const handleDragEnter = useCallback((i: number) => { dragOverIdx.current = i; }, []);
  const handleDragEnd   = useCallback(() => {
    const from = dragIdx.current;
    const to   = dragOverIdx.current;
    if (from === null || to === null || from === to) { dragIdx.current = null; dragOverIdx.current = null; return; }
    const next = [...cols];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setCols(next);
    dragIdx.current = null; dragOverIdx.current = null;
  }, [cols]);

  const handleSave = () => {
    setConfig(user.id, cols);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const handleReset = () => {
    deleteConfig(user.id);
    setCols([...allColumns]);
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns className="w-4 h-4 text-primary" />
            Spalten für {user.name}
          </DialogTitle>
          <DialogDescription>
            Wählen Sie die sichtbaren Spalten aus und legen Sie ihre Reihenfolge per Drag & Drop fest.
            Diese Einstellung gilt für <strong>{user.name}</strong> ({user.email}).
          </DialogDescription>
        </DialogHeader>

        {allColumns.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Noch keine Fahrzeugdaten importiert. Bitte zuerst eine CSV-Datei laden.
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">{cols.length} von {allColumns.length} Spalten sichtbar</span>
              <div className="ml-auto flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Alle einblenden</Button>
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7 text-muted-foreground">Alle ausblenden</Button>
              </div>
            </div>

            {/* Zwei Bereiche: sichtbar (draggable) + ausgeblendet */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Sichtbare Spalten – sortierbar */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-primary" /> Sichtbar & Reihenfolge
                </p>
                <div className="space-y-1">
                  {cols.map((key, i) => (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 cursor-grab select-none group"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm font-mono">{key}</span>
                      <span className="text-xs text-muted-foreground mr-1">#{i + 1}</span>
                      <button
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => toggleCol(key)}
                        title={t('admin.columns.hideColumn')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {cols.length === 0 && (
                    <p className="text-xs text-muted-foreground italic px-3 py-4 text-center border border-dashed border-border rounded-lg">
                      Keine Spalten sichtbar
                    </p>
                  )}
                </div>
              </div>

              {/* Ausgeblendete Spalten */}
              {allColumns.filter(k => !cols.includes(k)).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> Ausgeblendet
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {allColumns.filter(k => !cols.includes(k)).map(key => (
                      <button
                        key={key}
                        onClick={() => toggleCol(key)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        title={t('admin.columns.showColumn')}
                      >
                        <Plus className="w-3 h-3" /> {key}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="gap-2 pt-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 text-muted-foreground mr-auto">
            <RotateCcw className="w-3.5 h-3.5" /> Standard
          </Button>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} className="gap-1.5" disabled={allColumns.length === 0}>
            {saved ? <><Check className="w-3.5 h-3.5" /> Gespeichert!</> : <><Save className="w-3.5 h-3.5" /> Speichern</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Haupt-Admin-Seite ────────────────────────────────────────────────
export default function AdminPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { users, addUser, updateUser, deleteUser, resetPassword } = useUsersStore();
  const { currentUser } = useAuthStore();
  const { entries: colorLegend, setDescription } = useColorLegendStore();
  const { getConfig, setDetailFields } = useColumnConfigStore();
  const { getPermission, setPermission } = useDocPermStore();
  const { fleetData } = useFleetStore();
  const { configs: accessConfigs, setAccess, getAccess } = useVehicleAccessStore();
  const { groups, addGroup, updateGroup, deleteGroup } = useUserGroupStore();
  const { documents: allDocuments, deleteDocument } = useDocsStore();
  const {
    columns: customCols, labelOverrides,
    addColumn, updateColumn, deleteColumn,
    setLabelOverride, removeLabelOverride,
  } = useCustomColumnsStore();

  // ── Backup-Store ───────────────────────────────────────────────────
  const { snapshots, isCreating, isRestoring, createManual, restore, remove, download, refresh: refreshBackups } = useBackupStore();
  const [backupLabel, setBackupLabel] = useState('');
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const { importBackupFile } = await import('@/lib/backupManager');
      await importBackupFile(file);
    } catch {
      setImportError('Die Datei konnte nicht importiert werden. Bitte prüfen Sie das Format.');
      refreshBackups();
    }
    e.target.value = '';
  };

  // ── Rollen-Store ───────────────────────────────────────────────────
  const { roles, addRole, updateRole, deleteRole } = useRolesStore();

  // Vordefinierte Farboptionen für Rollen
  const ROLE_COLORS: { value: string; label: string }[] = [
    { value: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Lila'    },
    { value: 'bg-blue-100 text-blue-700 border-blue-200',       label: 'Blau'    },
    { value: 'bg-teal-100 text-teal-700 border-teal-200',       label: 'Türkis'  },
    { value: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Orange'  },
    { value: 'bg-pink-100 text-pink-700 border-pink-200',       label: 'Pink'    },
    { value: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Indigo'  },
    { value: 'bg-rose-100 text-rose-700 border-rose-200',       label: 'Rosé'    },
    { value: 'bg-cyan-100 text-cyan-700 border-cyan-200',       label: 'Cyan'    },
  ];

  const BUILTIN_BASES: { value: BuiltinRole; label: string; desc: string }[] = [
    { value: 'editor', label: t('admin.roles.editorBase'),  desc: t('admin.roles.editorBaseDesc') },
    { value: 'viewer', label: t('admin.roles.viewerBase'), desc: t('admin.roles.viewerBaseDesc') },
  ];

  const emptyRoleForm = { name: '', description: '', basedOn: 'viewer' as BuiltinRole, color: ROLE_COLORS[0].value };
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [deletingRole, setDeletingRole] = useState<CustomRole | null>(null);

  const openNewRole  = () => { setEditingRole(null); setRoleForm(emptyRoleForm); setShowRoleDialog(true); };
  const openEditRole = (r: CustomRole) => { setEditingRole(r); setRoleForm({ name: r.name, description: r.description ?? '', basedOn: r.basedOn, color: r.color }); setShowRoleDialog(true); };

  const handleSaveRole = () => {
    if (!roleForm.name.trim()) return;
    if (editingRole) {
      updateRole(editingRole.id, { name: roleForm.name.trim(), description: roleForm.description, basedOn: roleForm.basedOn, color: roleForm.color });
    } else {
      addRole({ name: roleForm.name.trim(), description: roleForm.description, basedOn: roleForm.basedOn, color: roleForm.color });
    }
    setShowRoleDialog(false);
  };

  const handleDeleteRole = () => {
    if (!deletingRole) return;
    // Benutzer die diese Rolle haben auf Basisrolle zurücksetzen
    users.filter(u => u.role === deletingRole.id).forEach(u => updateUser(u.id, { role: deletingRole.basedOn }));
    deleteRole(deletingRole.id);
    setDeletingRole(null);
  };

  // Hilfsfunktion: Rollenbezeichnung für beliebige roleId
  const getRoleLabel = (roleId: string): string => {
    if (roleId === 'admin')  return 'Admin';
    if (roleId === 'editor') return 'Editor';
    if (roleId === 'viewer') return 'Betrachter';
    return roles.find(r => r.id === roleId)?.name ?? roleId;
  };

  const getRoleColor = (roleId: string): string => {
    if (roleId === 'admin')  return 'bg-primary text-primary-foreground';
    if (roleId === 'editor') return 'bg-accent text-accent-foreground';
    if (roleId === 'viewer') return 'bg-secondary text-secondary-foreground';
    return roles.find(r => r.id === roleId)?.color ?? 'bg-muted text-muted-foreground';
  };

  // ── Custom-Columns States ──────────────────────────────────────────
  const [showColDialog, setShowColDialog] = useState(false);
  const [editingCol, setEditingCol] = useState<{ id: string; label: string; description?: string } | null>(null);
  const [colForm, setColForm] = useState({ label: '', description: '' });
  // Label-Override Editor
  const [labelEditKey, setLabelEditKey] = useState<string | null>(null);
  const [labelEditVal, setLabelEditVal] = useState('');

  const openAddCol = () => { setEditingCol(null); setColForm({ label: '', description: '' }); setShowColDialog(true); };
  const openEditCol = (c: { id: string; label: string; description?: string }) => {
    setEditingCol(c); setColForm({ label: c.label, description: c.description ?? '' }); setShowColDialog(true);
  };
  const handleSaveCol = () => {
    if (!colForm.label.trim()) return;
    if (editingCol) updateColumn(editingCol.id, { label: colForm.label.trim(), description: colForm.description.trim() || undefined });
    else addColumn(colForm.label.trim(), colForm.description.trim() || undefined);
    setShowColDialog(false);
  };

  // Alle importierten Spalten für Label-Override-Tabelle
  const allImportedKeys = fleetData.columns.map(c => c.key).filter(k => !k.startsWith('_'));

  // ── Gruppen-Editor States ──────────────────────────────────────────
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [groupForm, setGroupForm] = useState<Omit<UserGroup, 'id'>>({
    name: '', description: '', color: '#3b82f6',
    docPermissions: { canUploadPdf: true, canUploadImage: true, canDeleteDocs: false, canViewDocs: true, canImport: true, canBulkUpload: true },
    vehicleAccess: { mode: 'all', allowedVins: [] },
    columnSettings: { visibleColumns: [], visibleDetailFields: [] },
  });
  const [groupVinSearch, setGroupVinSearch] = useState('');

  const openAddGroup = () => {
    setEditingGroup(null);
    setGroupForm({
      name: '', description: '', color: '#3b82f6',
      docPermissions: { canUploadPdf: true, canUploadImage: true, canDeleteDocs: false, canViewDocs: true, canImport: true, canBulkUpload: true },
      vehicleAccess: { mode: 'all', allowedVins: [] },
      columnSettings: { visibleColumns: [], visibleDetailFields: [] },
    });
    setShowGroupDialog(true);
  };

  const openEditGroup = (g: UserGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description ?? '', color: g.color ?? '#3b82f6',
      docPermissions: { ...g.docPermissions }, vehicleAccess: { ...g.vehicleAccess },
      columnSettings: { ...g.columnSettings } });
    setShowGroupDialog(true);
  };

  const handleSaveGroup = () => {
    if (!groupForm.name.trim()) return;
    if (editingGroup) updateGroup(editingGroup.id, groupForm);
    else addGroup(groupForm);
    setShowGroupDialog(false);
  };

  const GROUP_COLORS = ['#3b82f6','#22c55e','#f97316','#ef4444','#8b5cf6','#ec4899','#06b6d4','#eab308','#64748b'];

  // ── Fahrzeugzugang: lokaler State für den Editor ───────────────────
  const [accessUserId, setAccessUserId] = useState<string>('');
  const [accessSearch, setAccessSearch] = useState('');
  const allVins = fleetData.records.map(r => String(r.vin)).filter(Boolean);

  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // ── Dateiverwaltung State ─────────────────────────────────────────
  const [fileSearch, setFileSearch]           = useState('');
  const [fileTypeFilter, setFileTypeFilter]   = useState<'all' | 'pdf' | 'image'>('all');
  const [fileSortBy, setFileSortBy]           = useState<'date' | 'size' | 'vin' | 'name'>('date');
  const [fileSortDir, setFileSortDir]         = useState<'asc' | 'desc'>('desc');
  const [deleteDocIds, setDeleteDocIds]       = useState<string[]>([]);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<string | null>(null);
  const [deleteAllDocsVin, setDeleteAllDocsVin] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds]   = useState<Set<string>>(new Set());
  const [deleteBulkConfirm, setDeleteBulkConfirm] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; description: string }> = {
    admin:  { label: t('admin.roles.admin'),  icon: Crown,  color: 'bg-primary text-primary-foreground',     description: t('admin.roles.adminDesc')  },
    editor: { label: t('admin.roles.editor'), icon: Pencil, color: 'bg-accent text-accent-foreground',       description: t('admin.roles.editorDesc') },
    viewer: { label: t('admin.roles.viewer'), icon: Eye,    color: 'bg-secondary text-secondary-foreground', description: t('admin.roles.viewerDesc') },
  };

  // ── User-Formular ──────────────────────────────────────────────────
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [colConfigUser, setColConfigUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(defaultForm);
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ── Credentials-Dialog (nach Benutzeranlage) ─────────────────────
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string; role: string } | null>(null);
  const [emailSendStatus, setEmailSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'not_configured'>('idle');
  const [emailErrorMsg, setEmailErrorMsg] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── E-Mail-Einstellungen ─────────────────────────────────────────
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(loadEmailSettings);
  const [emailSettingsSaved, setEmailSettingsSaved] = useState(false);

  // ── Benutzer-Sync (Browser-zu-Browser) ───────────────────────────
  const [syncCode, setSyncCode]             = useState('');
  const [syncCodeCopied, setSyncCodeCopied] = useState(false);
  const [syncImportCode, setSyncImportCode] = useState('');
  const [syncImportError, setSyncImportError] = useState('');
  const [syncImportSuccess, setSyncImportSuccess] = useState('');
  const syncFileRef = useRef<HTMLInputElement>(null);

  const generateSyncCode = () => {
    const payload = { v: 1, users };
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    setSyncCode(code);
    setSyncCodeCopied(false);
  };

  const copySyncCode = () => {
    if (!syncCode) return;
    navigator.clipboard.writeText(syncCode).catch(() => {});
    setSyncCodeCopied(true);
    setTimeout(() => setSyncCodeCopied(false), 2000);
  };

  const downloadSyncCode = () => {
    if (!syncCode) return;
    const blob = new Blob([syncCode], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fleet-users-sync-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSyncCode = (code: string) => {
    setSyncImportError('');
    setSyncImportSuccess('');
    const raw = code.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!parsed?.users || !Array.isArray(parsed.users)) throw new Error('Ungültiges Format');
      const { addUser: _add, updateUser: upd } = useUsersStore.getState();
      const existing = useUsersStore.getState().users;
      let added = 0; let updated = 0;
      for (const u of parsed.users) {
        if (!u.id || !u.email) continue;
        const exists = existing.find(e => e.id === u.id);
        if (!exists) {
          // direkt in Store setzen (mit passwordHash)
          useUsersStore.setState(s => ({ users: [...s.users, u] }));
          added++;
        } else {
          upd(u.id, { name: u.name, role: u.role, email: u.email });
          updated++;
        }
      }
      setSyncImportSuccess(`${added} Benutzer hinzugefügt, ${updated} aktualisiert.`);
      setSyncImportCode('');
    } catch {
      setSyncImportError('Der Code ist ungültig oder beschädigt.');
    }
  };

  const handleSyncFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { importSyncCode(String(ev.target?.result ?? '')); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const validateForm = (): boolean => {
    if (!form.name.trim()) { setFormError(t('admin.form.errorName')); return false; }
    if (!form.email.trim() || !form.email.includes('@')) { setFormError(t('admin.form.errorEmail')); return false; }
    if (!editingUser) {
      if (form.password.length < 8) { setFormError(t('admin.form.errorPasswordLength')); return false; }
      if (form.password !== form.confirmPassword) { setFormError(t('admin.form.errorPasswordMatch')); return false; }
      if (users.some(u => u.email === form.email)) { setFormError(t('admin.form.errorEmailTaken')); return false; }
    }
    return true;
  };

  const handleAdd = () => {
    setFormError('');
    if (!validateForm()) return;
    const roleName = form.role === 'admin' ? t('admin.roles.admin')
      : form.role === 'editor' ? t('admin.roles.editor')
      : form.role === 'viewer' ? t('admin.roles.viewer')
      : form.role;
    addUser(form.email.trim().toLowerCase(), form.name.trim(), form.role, form.password.trim());
    const creds = { name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password.trim(), role: roleName };
    setShowAddDialog(false); setForm(defaultForm);
    showSuccess(t('admin.successCreated', { name: creds.name }));
    // Credentials-Dialog öffnen + automatisch E-Mail versuchen
    setCreatedCredentials(creds);
    setEmailSendStatus('idle');
    setEmailErrorMsg('');
    // Sofort E-Mail senden wenn konfiguriert
    if (isEmailConfigured()) {
      setEmailSendStatus('sending');
      sendWelcomeEmail({ toEmail: creds.email, toName: creds.name, password: creds.password, role: creds.role })
        .then(res => {
          if (res.status === 'sent') setEmailSendStatus('sent');
          else if (res.status === 'not_configured') setEmailSendStatus('not_configured');
          else { setEmailSendStatus('error'); setEmailErrorMsg(res.message); }
        });
    } else {
      setEmailSendStatus('not_configured');
    }
  };
  const handleUpdate = () => {
    if (!editingUser) return;
    setFormError('');
    if (!form.name.trim()) { setFormError(t('admin.form.errorName')); return; }
    if (!form.email.trim()) { setFormError(t('admin.form.errorEmail')); return; }
    updateUser(editingUser.id, { name: form.name, email: form.email, role: form.role });
    setEditingUser(null);
    showSuccess(t('admin.successUpdated', { name: form.name }));
  };
  const handleDelete = () => {
    if (!deletingUser) return;
    deleteUser(deletingUser.id); setDeletingUser(null);
    showSuccess(t('admin.successDeleted'));
  };
  const handleResetPassword = () => {
    if (!resetUser || newPassword.length < 8) return;
    resetPassword(resetUser.id, newPassword);
    setResetUser(null); setNewPassword('');
    showSuccess(t('admin.successPasswordReset'));
  };
  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, password: '', confirmPassword: '' });
    setFormError('');
  };

  // ── Farblegende Bearbeitungsstatus ─────────────────────────────────
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [colorDesc, setColorDesc] = useState('');

  // Tabs in 3 logische Gruppen aufgeteilt
  const tabGroups = [
    {
      label: 'Nutzer & Zugriff',
      tabs: [
        { id: 'users'         as AdminTab, label: t('admin.tabs.users'),         icon: Users      },
        { id: 'roles'         as AdminTab, label: t('admin.tabs.roles'),         icon: Tags       },
        { id: 'groups'        as AdminTab, label: t('admin.tabs.groups'),        icon: Shield     },
        { id: 'vehicleaccess' as AdminTab, label: t('admin.tabs.vehicleAccess'), icon: Car        },
      ],
    },
    {
      label: 'Ansicht & Felder',
      tabs: [
        { id: 'manage_columns' as AdminTab, label: t('admin.tabs.manageColumns'),  icon: Columns   },
        { id: 'columns'        as AdminTab, label: t('admin.tabs.columns'),        icon: Eye       },
        { id: 'detailfields'   as AdminTab, label: t('admin.tabs.detailFields'),   icon: Eye       },
        { id: 'colors'         as AdminTab, label: t('admin.tabs.colors'),         icon: Palette   },
        { id: 'docperms'       as AdminTab, label: t('admin.tabs.docPerms'),       icon: Paperclip },
      ],
    },
    {
      label: 'System',
      tabs: [
        { id: 'supabase' as AdminTab, label: 'Datenbankverbindung', icon: Database  },
        { id: 'backups'  as AdminTab, label: t('admin.tabs.backups'), icon: RotateCcw },
        { id: 'files'    as AdminTab, label: 'Dateiverwaltung',      icon: HardDrive },
        { id: 'email'    as AdminTab, label: t('admin.tabs.email'),  icon: Mail      },
      ],
    },
  ];
  const tabs = tabGroups.flatMap(g => g.tabs);

  return (
    <div className={`max-w-5xl mx-auto ${isMobile ? "p-3" : "p-6"}`}>
      {/* ── Header ── */}
      <div className={`flex items-start justify-between ${isMobile ? "mb-3" : "mb-6"}`}>
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {t('admin.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('admin.subtitle')}</p>
        </div>
        {activeTab === 'users' && (
          <Button onClick={() => { setForm(defaultForm); setFormError(''); setShowAddDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> {t('admin.addUser')}
          </Button>
        )}
      </div>

      {/* ── Tabs – gruppiert in 3 Zeilen ── */}
      <div className="mb-5 space-y-1">
        {tabGroups.map(group => (
          <div key={group.label} className="flex flex-wrap items-center gap-x-0 gap-y-0">
            {/* Gruppen-Label */}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 w-full mb-1 mt-2 first:mt-0">
              {group.label}
            </span>
            {/* Tabs dieser Gruppe */}
            <div className="flex flex-wrap gap-1 w-full">
              {group.tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'border-border text-muted-foreground bg-muted/40 hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {/* Trennlinie */}
        <div className="border-b border-border mt-3" />
      </div>

      {/* ── Erfolgs-Banner ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-4 flex items-center gap-2 bg-accent/10 text-accent rounded-lg px-4 py-3 text-sm"
          >
            <Check className="w-4 h-4" /> {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: SUPABASE DATENBANKVERBINDUNG                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'supabase' && <DatabaseConfigTab />}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: BENUTZER                                              */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <>
          {/* Rollen-Übersicht */}
          <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-1" : "grid-cols-3"}`}>
            {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([role, cfg]) => (
              <Card key={role} className="border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <cfg.icon className="w-4 h-4 text-muted-foreground" />
                    <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p>
                  <p className="text-lg font-bold text-foreground mt-2">{users.filter(u => u.role === role).length}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Benutzerliste */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                {t('admin.allUsers', { count: users.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="divide-y divide-border">
                {users.map(user => {
                  const cfg = ROLE_CONFIG[user.role] ?? { label: getRoleLabel(user.role), icon: Tags, color: getRoleColor(user.role), description: "" };
                  const isCurrentUser = user.id === currentUser?.id;
                  const isAdmin = user.id === 'admin-1';
                  const hasColConfig = !!getConfig(user.id);
                  return (
                    <motion.div key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex items-center gap-4 px-6 py-4"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${cfg.color}`}>
                        {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{user.name}</p>
                          {isCurrentUser && <Badge variant="outline" className="text-xs">{t('admin.me')}</Badge>}
                          {isAdmin && <Badge variant="outline" className="text-xs text-primary border-primary/30">{t('admin.systemAdmin')}</Badge>}
                          {hasColConfig && <Badge variant="outline" className="text-xs text-accent border-accent/30 gap-1"><Columns className="w-2.5 h-2.5" />Spalten</Badge>}
                          {user.groupId && (() => { const g = groups.find(x => x.id === user.groupId); return g ? <Badge variant="outline" className="text-xs gap-1" style={{ borderColor: g.color, color: g.color }}><Shield className="w-2.5 h-2.5" />{g.name}</Badge> : null; })()}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
                      </div>
                      <Badge className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</Badge>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} title={t('admin.editTooltip')}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => { setResetUser(user); setNewPassword(''); }} title={t('admin.passwordTooltip')}>
                          <Key className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setColConfigUser(user)} title="Spalten konfigurieren">
                          <Columns className="w-3.5 h-3.5" />
                        </Button>
                        {!isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingUser(user)} title={t('admin.deleteTooltip')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Benutzer-Sync (Browser-zu-Browser) ─────────────────── */}
          <Card className="border-border border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-muted-foreground" />
                Benutzer auf anderen Browser/Gerät übertragen
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Da alle Daten lokal im Browser gespeichert sind, müssen Benutzer manuell auf andere Geräte übertragen werden.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* EXPORT */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Schritt 1 – Sync-Code auf diesem Gerät exportieren
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={generateSyncCode}>
                    <Key className="w-3.5 h-3.5" /> Sync-Code generieren
                  </Button>
                  {syncCode && (
                    <>
                      <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={copySyncCode}>
                        {syncCodeCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {syncCodeCopied ? 'Kopiert!' : 'Code kopieren'}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={downloadSyncCode}>
                        <FolderUp className="w-3.5 h-3.5" /> Als Datei speichern
                      </Button>
                    </>
                  )}
                </div>
                {syncCode && (
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50 border border-border">
                    <code className="text-xs font-mono truncate flex-1 text-muted-foreground">{syncCode.slice(0, 60)}…</code>
                    <Badge variant="outline" className="text-xs text-green-600 border-green-200 shrink-0">
                      {users.length} Benutzer
                    </Badge>
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              {/* IMPORT */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Schritt 2 – Auf dem anderen Gerät: Code importieren
                </p>
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Sync-Code hier einfügen…"
                    value={syncImportCode}
                    onChange={e => { setSyncImportCode(e.target.value); setSyncImportError(''); setSyncImportSuccess(''); }}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!syncImportCode.trim()}
                    onClick={() => importSyncCode(syncImportCode)}
                  >
                    Importieren
                  </Button>
                </div>
                <div className="flex gap-2">
                  <input ref={syncFileRef} type="file" accept=".txt" className="hidden" onChange={handleSyncFile} />
                  <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={() => syncFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Datei importieren
                  </Button>
                </div>
                {syncImportError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {syncImportError}
                  </p>
                )}
                {syncImportSuccess && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {syncImportSuccess}
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">⚠️ Hinweis zu Passwörtern</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  Der Sync-Code überträgt Benutzernamen, E-Mails und Rollen sowie die verschlüsselten Passwort-Hashes.
                  Passwörter sind nicht im Klartext enthalten. Der Standard-Admin ist auf jedem Gerät automatisch verfügbar.
                </p>
              </div>

            </CardContent>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: ROLLEN                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'roles' && (
        <div className="space-y-5">

          {/* Kopfzeile */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Tags className="w-4 h-4 text-primary" /> {t('admin.tabs.roles')}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Erstellen Sie eigene Rollen basierend auf „Editor" oder „Betrachter" und weisen Sie Benutzern diese Rollen zu.
              </p>
            </div>
            <Button onClick={openNewRole} className="gap-1.5">
              <Plus className="w-4 h-4" /> {t('admin.roles.newRole')}
            </Button>
          </div>

          {/* Eingebaute Rollen (schreibgeschützt) */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('admin.roles.builtinRoles')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'admin',  label: 'Admin',       color: 'bg-primary text-primary-foreground',     desc: t('admin.roles.adminDesc') },
                { id: 'editor', label: t('admin.roles.editor'), color: 'bg-accent text-accent-foreground', desc: t('admin.roles.editorDesc') },
                { id: 'viewer', label: t('admin.roles.viewer'), color: 'bg-secondary text-secondary-foreground', desc: t('admin.roles.viewerDesc') },
              ].map(r => (
                <Card key={r.id} className="border-border opacity-75">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={`text-xs px-2 ${r.color}`}>{r.label}</Badge>
                      <span className="text-xs text-muted-foreground">{t('admin.roles.builtinLabel')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {users.filter(u => u.role === r.id).length} Benutzer
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Benutzerdefinierte Rollen */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('admin.roles.customRoles')}</p>
            {roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
                <Tags className="w-8 h-8 opacity-20" />
                <p className="text-sm">{t('admin.roles.noCustomRoles')}</p>
                <Button variant="outline" size="sm" onClick={openNewRole} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> {t('admin.roles.firstRole')}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map(role => {
                  const memberCount = users.filter(u => u.role === role.id).length;
                  const base = BUILTIN_BASES.find(b => b.value === role.basedOn);
                  return (
                    <Card key={role.id} className="border-border">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-xs px-2 border ${role.color}`}>{role.name}</Badge>
                              <span className="text-xs text-muted-foreground">basiert auf {base?.label}</span>
                            </div>
                            {role.description && (
                              <p className="text-xs text-muted-foreground mb-1">{role.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{t('admin.roles.membersCount', { count: memberCount })}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEditRole(role)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingRole(role)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rollenzuweisung für Benutzer */}
          {roles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('admin.roles.assignment')}</p>
              <Card className="border-border">
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {users.filter(u => u.role !== 'admin').map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{u.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Select value={u.role} onValueChange={val => updateUser(u.id, { role: val })}>
                          <SelectTrigger className="h-7 text-xs w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">{t('admin.roles.builtinEditor')}</SelectItem>
                            <SelectItem value="viewer">{t('admin.roles.builtinViewer')}</SelectItem>
                            {roles.map(r => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: GRUPPEN                                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Benutzergruppen</h3>
              <p className="text-sm text-muted-foreground">Gruppen bündeln Berechtigungen. Benutzer erben die Gruppenrechte, sofern keine individuelle Konfiguration gesetzt ist.</p>
            </div>
            <Button onClick={openAddGroup} className="gap-1.5"><Plus className="w-4 h-4" /> {t('admin.groups.add')}</Button>
          </div>

          {groups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Shield className="w-10 h-10 opacity-20" />
                <p className="text-sm">Noch keine Gruppen angelegt.</p>
                <Button variant="outline" size="sm" onClick={openAddGroup} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Erste Gruppe anlegen</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {groups.map(g => {
                const memberCount = users.filter(u => u.groupId === g.id).length;
                return (
                  <Card key={g.id} className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Farbindikator */}
                        <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-sm" style={{ background: g.color ?? '#3b82f6' }}>
                          {g.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{g.name}</span>
                            <Badge variant="secondary" className="text-xs">{t('admin.roles.membersCount', { count: memberCount })}</Badge>
                            <Badge variant="outline" className="text-xs">{g.vehicleAccess.mode === 'all' ? 'Alle Fahrzeuge' : `${g.vehicleAccess.allowedVins.length} Fahrzeuge`}</Badge>
                          </div>
                          {g.description && <p className="text-sm text-muted-foreground mt-0.5">{g.description}</p>}
                          {/* Berechtigungs-Übersicht */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { label: 'PDF-Upload',   active: g.docPermissions.canUploadPdf },
                              { label: 'Bild-Upload',  active: g.docPermissions.canUploadImage },
                              { label: 'Ansehen',      active: g.docPermissions.canViewDocs },
                              { label: 'Löschen',      active: g.docPermissions.canDeleteDocs },
                            ].map(p => (
                              <span key={p.label} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${p.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted text-muted-foreground border-border line-through'}`}>{p.label}</span>
                            ))}
                            {g.columnSettings.visibleColumns.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">{g.columnSettings.visibleColumns.length} Spalten</span>
                            )}
                          </div>
                          {/* Mitglieder */}
                          {memberCount > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {users.filter(u => u.groupId === g.id).map(u => (
                                <span key={u.id} className="text-xs bg-muted px-2 py-0.5 rounded-full">{u.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => openEditGroup(g)} title="Bearbeiten">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive" onClick={() => deleteGroup(g.id)} title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Gruppen-Zuweisung je Benutzer */}
          <Card className="border-border mt-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Benutzer einer Gruppe zuweisen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {users.filter(u => u.role !== 'admin').map(u => (
                <div key={u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Select
                    value={u.groupId ?? '__none__'}
                    onValueChange={val => updateUser(u.id, { groupId: val === '__none__' ? undefined : val })}
                  >
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue placeholder={t('admin.groups.noGroup')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">— Keine Gruppe —</span>
                      </SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color ?? '#3b82f6' }} />
                            {g.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {u.groupId && (
                    <Badge variant="outline" className="text-xs shrink-0" style={{ borderColor: groups.find(g => g.id === u.groupId)?.color }}>
                      {groups.find(g => g.id === u.groupId)?.name}
                    </Badge>
                  )}
                </div>
              ))}
              {users.filter(u => u.role !== 'admin').length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Nicht-Admin-Benutzer vorhanden.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: SPALTEN VERWALTEN                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'manage_columns' && (
        <div className="space-y-6">

          {/* ── A: Neue Spalten anlegen ─────────────────────────────── */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="w-4 h-4 text-violet-500" /> Eigene Spalten
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Neue Spalten hinzufügen, die in der Akte befüllt werden können.
                  </p>
                </div>
                <Button onClick={openAddCol} size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                  <Plus className="w-3.5 h-3.5" /> Spalte hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customCols.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2 border-2 border-dashed border-border rounded-lg">
                  <Columns className="w-8 h-8 opacity-20" />
                  <p className="text-sm">{t('admin.detailFields.empty')}</p>
                  <Button variant="outline" size="sm" onClick={openAddCol} className="gap-1.5 mt-1">
                    <Plus className="w-3.5 h-3.5" /> Erste Spalte anlegen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {customCols.map((col, idx) => (
                    <div key={col.id} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border border-border bg-muted/20 ${idx > 0 ? '' : ''}`}>
                      <div className="w-6 h-6 rounded bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{col.label}</p>
                        {col.description && <p className="text-xs text-muted-foreground">{col.description}</p>}
                        <p className="text-xs text-muted-foreground/50 font-mono">{col.id}</p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {new Date(col.createdAt).toLocaleDateString('de-DE')}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEditCol(col)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm(`Spalte "${col.label}" wirklich löschen?`)) deleteColumn(col.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── B: Spaltenbezeichnungen umbenennen ─────────────────── */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-500" /> Spaltenbezeichnungen umbenennen
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Überschreiben Sie den Anzeigetext bestehender Spalten aus der importierten Datei.
              </p>
            </CardHeader>
            <CardContent>
              {allImportedKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Keine Spalten geladen. Bitte zuerst eine Datei importieren.
                </p>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {allImportedKeys.map(key => {
                    const isEditing = labelEditKey === key;
                    const override = labelOverrides[key];
                    return (
                      <div key={key} className={`flex items-center gap-2 py-2 px-3 rounded-lg border transition-colors ${isEditing ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'}`}>
                        {/* Original */}
                        <div className="w-52 shrink-0">
                          <p className="text-xs text-muted-foreground">Original</p>
                          <p className="text-sm font-mono truncate">{key}</p>
                        </div>
                        {/* Pfeil */}
                        <span className="text-muted-foreground shrink-0">→</span>
                        {/* Aktuell / Edit */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={labelEditVal}
                              onChange={e => setLabelEditVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { if (labelEditVal.trim()) setLabelOverride(key, labelEditVal.trim()); else removeLabelOverride(key); setLabelEditKey(null); }
                                if (e.key === 'Escape') setLabelEditKey(null);
                              }}
                              className="h-7 text-sm"
                              placeholder={key}
                            />
                          ) : (
                            <p className={`text-sm truncate ${override ? 'font-medium text-foreground' : 'text-muted-foreground italic'}`}>
                              {override ?? '— kein Alias gesetzt —'}
                            </p>
                          )}
                        </div>
                        {/* Aktionen */}
                        <div className="flex gap-1 shrink-0">
                          {isEditing ? (
                            <>
                              <Button size="icon" variant="ghost" className="w-7 h-7 text-primary" title="Speichern"
                                onClick={() => { if (labelEditVal.trim()) setLabelOverride(key, labelEditVal.trim()); else removeLabelOverride(key); setLabelEditKey(null); }}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="w-7 h-7" title="Abbrechen"
                                onClick={() => setLabelEditKey(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="w-7 h-7" title="Umbenennen"
                                onClick={() => { setLabelEditKey(key); setLabelEditVal(override ?? ''); }}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              {override && (
                                <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" title="Zurücksetzen"
                                  onClick={() => removeLabelOverride(key)}>
                                  <RotateCcw className="w-3 h-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: FARBLEGENDE                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'colors' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              Farblegende verwalten
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Ordnen Sie jeder Farbe eine Bedeutung zu. Diese Legende wird in der Fahrzeugliste angezeigt.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {COLOR_PALETTE.map(col => {
              const entry = colorLegend.find(e => e.color === col.value);
              const isEditing = editingColor === col.value;
              return (
                <div
                  key={col.value}
                  className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-border/80 transition-colors"
                  style={{ background: col.value }}
                >
                  {/* Farbvorschau */}
                  <div className="flex items-center gap-2 shrink-0 w-28">
                    <span className="w-5 h-5 rounded-full border-2 shrink-0" style={{ background: col.border, borderColor: col.border }} />
                    <span className="text-sm font-semibold" style={{ color: col.border }}>{col.label}</span>
                  </div>

                  {/* Beschreibung */}
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        autoFocus
                        value={colorDesc}
                        onChange={e => setColorDesc(e.target.value)}
                        placeholder="z. B. Fahrzeuge in Reparatur, Priorität 1, …"
                        className="h-8 text-sm"
                        onKeyDown={e => {
                          if (e.key === 'Enter') { setDescription(col.value, colorDesc); setEditingColor(null); showSuccess(`Farbe "${col.label}" gespeichert.`); }
                          if (e.key === 'Escape') { setEditingColor(null); }
                        }}
                      />
                      <Button size="sm" className="h-8 gap-1" onClick={() => { setDescription(col.value, colorDesc); setEditingColor(null); showSuccess(`Farbe "${col.label}" gespeichert.`); }}>
                        <Check className="w-3.5 h-3.5" /> OK
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditingColor(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-3">
                      {entry?.description ? (
                        <p className="text-sm text-foreground flex-1">
                          <span className="font-medium">= </span>{entry.description}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic flex-1">Keine Beschreibung</p>
                      )}
                      <Button
                        variant="ghost" size="sm" className="h-7 gap-1.5 text-xs shrink-0"
                        style={{ color: col.border }}
                        onClick={() => { setEditingColor(col.value); setColorDesc(entry?.description ?? ''); }}
                      >
                        <Edit2 className="w-3 h-3" />
                        {entry?.description ? 'Ändern' : 'Hinzufügen'}
                      </Button>
                      {entry?.description && (
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => { setDescription(col.value, ''); showSuccess(`Beschreibung für "${col.label}" entfernt.`); }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: SPALTEN-KONFIGURATION                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'columns' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Columns className="w-4 h-4 text-primary" />
              Spalten je Benutzer konfigurieren
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Legen Sie fest, welche Spalten ein Benutzer in der Fahrzeugliste sieht und in welcher Reihenfolge.
              {t('admin.columns.hint')}
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y divide-border">
              {users.map(user => {
                const cfg = ROLE_CONFIG[user.role] ?? { label: getRoleLabel(user.role), icon: Tags, color: getRoleColor(user.role), description: "" };
                const colCfg = getConfig(user.id);
                return (
                  <div key={user.id} className="flex items-center gap-4 px-6 py-4">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.color}`}>
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
                    </div>
                    <Badge className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</Badge>

                    {colCfg ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs text-accent border-accent/30">
                          {colCfg.visibleColumns.length} Spalten
                        </Badge>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setColConfigUser(user)}>
                          <Edit2 className="w-3 h-3" /> Bearbeiten
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => setColConfigUser(user)}>
                        <Columns className="w-3 h-3" /> Konfigurieren
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: DETAIL-FELDER JE NUTZER                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'detailfields' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Sichtbare Datenfelder in der Fahrzeugakte
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Legen Sie fest, welche Felder ein Benutzer in der Fahrzeugdetailansicht sehen darf.
              Admins sehen immer alle Felder.
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y divide-border">
              {users.filter(u => u.role !== 'admin').map(user => {
                const cfg = ROLE_CONFIG[user.role] ?? { label: getRoleLabel(user.role), icon: Tags, color: getRoleColor(user.role), description: "" };
                const colCfg = getConfig(user.id);
                const allFields = fleetData.columns.map(c => c.key).filter(k => !k.startsWith('_') && k !== 'vin');
                const currentVisible = colCfg?.visibleDetailFields ?? [];
                const isConfigured = currentVisible.length > 0;

                return (
                  <div key={user.id} className="px-6 py-4">
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.color}`}>
                        {user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</Badge>
                      {isConfigured ? (
                        <Badge variant="outline" className="text-xs text-accent border-accent/30">
                          {currentVisible.length}/{allFields.length} Felder
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Alle Felder
                        </Badge>
                      )}
                      <Button
                        variant="ghost" size="sm"
                        className="text-xs text-destructive hover:text-destructive"
                        onClick={() => setDetailFields(user.id, [])}
                        disabled={!isConfigured}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Alle
                      </Button>
                    </div>
                    {allFields.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 ml-13">
                        {allFields.map(field => {
                          const active = !isConfigured || currentVisible.includes(field);
                          return (
                            <button
                              key={field}
                              onClick={() => {
                                const base = isConfigured ? currentVisible : allFields;
                                const next = active
                                  ? base.filter(f => f !== field)
                                  : [...base, field];
                                setDetailFields(user.id, next.length === allFields.length ? [] : next);
                              }}
                              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                                active
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border bg-muted/30 text-muted-foreground line-through'
                              }`}
                            >
                              {field}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {users.filter(u => u.role !== 'admin').length === 0 && (
                <p className="px-6 py-8 text-sm text-muted-foreground text-center">Keine Nicht-Admin-Benutzer vorhanden.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: DOKUMENT-RECHTE JE NUTZER                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'docperms' && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary" />
              {t('admin.docPerms.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t('admin.docPerms.desc')}
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {/* Legende */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-3 bg-muted/20 border-b border-border text-xs text-muted-foreground font-medium">
              <span className="w-48">{t('admin.form.name')}</span>
              <span className="flex items-center gap-1 w-28"><FileText   className="w-3.5 h-3.5 text-red-400"     /> {t('admin.docPerms.canUploadPdf')}</span>
              <span className="flex items-center gap-1 w-28"><ImageIcon  className="w-3.5 h-3.5 text-blue-400"    /> {t('admin.docPerms.canUploadImage')}</span>
              <span className="flex items-center gap-1 w-28"><Eye        className="w-3.5 h-3.5 text-green-500"   /> {t('admin.docPerms.canViewDocs')}</span>
              <span className="flex items-center gap-1 w-28"><Trash2     className="w-3.5 h-3.5 text-destructive" /> {t('admin.docPerms.canDeleteDocs')}</span>
              <span className="flex items-center gap-1 w-28"><Upload     className="w-3.5 h-3.5 text-violet-500"  /> {t('admin.docPerms.canImport')}</span>
              <span className="flex items-center gap-1 w-28"><FolderUp   className="w-3.5 h-3.5 text-amber-500"  /> {t('admin.docPerms.canBulkUpload')}</span>
            </div>
            <div className="divide-y divide-border">
              {users.map(user => {
                const cfg = ROLE_CONFIG[user.role] ?? { label: getRoleLabel(user.role), icon: Tags, color: getRoleColor(user.role), description: "" };
                const perm = getPermission(user.id, user.role);
                const isAdmin = user.role === 'admin';

                const toggle = (field: keyof UserDocPermission) => {
                  if (isAdmin) return;
                  setPermission({ ...perm, [field]: !perm[field as keyof typeof perm] });
                };

                const ToggleBtn = ({ field, icon: Icon, activeColor, label }: { field: keyof UserDocPermission; icon: React.ElementType; activeColor: string; label: string }) => (
                  <button
                    onClick={() => toggle(field)}
                    disabled={isAdmin}
                    className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                      perm[field]
                        ? `${activeColor} border-transparent`
                        : 'bg-muted/30 border-border text-muted-foreground opacity-50'
                    } ${isAdmin ? 'cursor-default' : 'hover:opacity-90 cursor-pointer'}`}
                    title={isAdmin ? t('admin.docPerms.adminHint') : `${label}: ${perm[field] ? t('admin.docPerms.active') : t('admin.docPerms.inactive')}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );

                return (
                  <div key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.color}`}>
                      {user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="w-44 min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{user.email}</p>
                    </div>
                    <Badge className={`text-xs ${cfg.color} mr-2`}>{cfg.label}</Badge>
                    {isAdmin && (
                      <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <Unlock className="w-3 h-3" /> {t('admin.docPerms.adminAll')}
                      </span>
                    )}
                    {!isAdmin && (
                      <div className="flex items-center gap-3">
                        <ToggleBtn field="canUploadPdf"   icon={FileText}  activeColor="bg-red-100 text-red-600"       label={t('admin.docPerms.canUploadPdf')}    />
                        <ToggleBtn field="canUploadImage" icon={ImageIcon} activeColor="bg-blue-100 text-blue-600"     label={t('admin.docPerms.canUploadImage')}  />
                        <ToggleBtn field="canViewDocs"    icon={Eye}       activeColor="bg-green-100 text-green-600"   label={t('admin.docPerms.canViewDocs')}     />
                        <ToggleBtn field="canDeleteDocs"  icon={Trash2}    activeColor="bg-orange-100 text-orange-600" label={t('admin.docPerms.canDeleteDocs')}   />
                        <ToggleBtn field="canImport"      icon={Upload}    activeColor="bg-violet-100 text-violet-600" label={t('admin.docPerms.canImport')}       />
                        <ToggleBtn field="canBulkUpload"  icon={FolderUp}  activeColor="bg-amber-100 text-amber-600"   label={t('admin.docPerms.canBulkUpload')}   />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Backups ─────────────────────────────────────────────── */}
      {activeTab === 'backups' && (
        <div className="space-y-5">
          {/* Kopfzeile */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-primary" /> Backup & Wiederherstellen
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Das Programm erstellt <strong>automatisch alle 4 Stunden</strong> einen Snapshot aller Daten
                (Fahrzeuge, Benutzer, Einstellungen, Dokumente). Maximal {MAX_SNAPSHOTS} Backups werden gespeichert.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Manuelles Backup */}
              <div className="flex gap-1">
                <Input
                  value={backupLabel}
                  onChange={e => setBackupLabel(e.target.value)}
                  placeholder={t('admin.colorLegend.labelPlaceholder')}
                  className="h-8 text-sm w-52"
                  onKeyDown={e => e.key === 'Enter' && createManual(backupLabel)}
                />
                <Button size="sm" className="h-8 gap-1.5" disabled={isCreating}
                  onClick={() => { createManual(backupLabel); setBackupLabel(''); }}>
                  {isCreating
                    ? <><RotateCcw className="w-3.5 h-3.5 animate-spin" /> Erstelle…</>
                    : <><Plus className="w-3.5 h-3.5" /> Jetzt sichern</>}
                </Button>
              </div>
              {/* Backup-Datei importieren */}
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
              <Button size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => fileInputRef.current?.click()}>
                <FileText className="w-3.5 h-3.5" /> Backup importieren
              </Button>
            </div>
          </div>

          {importError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {importError}
            </div>
          )}

          {/* Statistik-Zeile */}
          {snapshots.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Gespeicherte Backups', value: `${snapshots.length} / ${MAX_SNAPSHOTS}` },
                { label: 'Letztes Backup', value: new Date(snapshots[0].createdAt).toLocaleString('de-DE') },
                { label: 'Ältestes Backup', value: new Date(snapshots[snapshots.length - 1].createdAt).toLocaleString('de-DE') },
              ].map(s => (
                <Card key={s.label} className="border-border">
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-semibold mt-0.5">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Backup-Liste */}
          <Card className="border-border">
            <CardContent className="p-0">
              {snapshots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                  <RotateCcw className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Noch keine Backups vorhanden.</p>
                  <p className="text-xs">Das erste automatische Backup wird beim nächsten Programmstart erstellt.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {snapshots.map((snap: BackupSnapshot, idx: number) => {
                    const date = new Date(snap.createdAt);
                    const isFirst = idx === 0;
                    return (
                      <div key={snap.id} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20 ${isFirst ? 'bg-primary/5' : ''}`}>
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${snap.isAuto ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-700'}`}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{snap.label}</span>
                            {isFirst && <Badge className="text-xs bg-primary text-primary-foreground px-1.5 py-0">Aktuellstes</Badge>}
                            {snap.isAuto
                              ? <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Auto</Badge>
                              : <Badge variant="outline" className="text-xs text-green-700 border-green-200">Manuell</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">{date.toLocaleString('de-DE')}</span>
                            <span className="text-xs text-muted-foreground">{snap.meta.vehicleCount} Fahrzeuge</span>
                            <span className="text-xs text-muted-foreground">{snap.meta.userCount} Benutzer</span>
                            <span className="text-xs text-muted-foreground">{snap.meta.fileCount} Dateien</span>
                            <span className="text-xs text-muted-foreground">{formatSize(snap.meta.sizeBytes)}</span>
                          </div>
                        </div>
                        {/* Aktionen */}
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => download(snap.id)} title="Als Datei herunterladen">
                            <FileText className="w-3 h-3" /> Export
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                            onClick={() => setRestoreConfirmId(snap.id)} disabled={isRestoring} title={t('admin.backups.restore')}>
                            <RotateCcw className="w-3 h-3" /> Wiederherstellen
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(snap.id)} title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hinweis */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Backups werden im lokalen Browserspeicher abgelegt. Bei Löschen des Browser-Caches gehen sie verloren.
              Verwenden Sie <strong>„Export"</strong>, um wichtige Backups als JSON-Datei dauerhaft zu sichern.
              Zum Wiederherstellen können exportierte Dateien über <strong>„Backup importieren"</strong> eingelesen werden.
            </span>
          </div>
        </div>
      )}

      {/* ── Tab: Fahrzeugzugang ──────────────────────────────────────── */}
      {activeTab === 'vehicleaccess' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="w-4 h-4" /> Fahrzeugzugang je Benutzer
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Legen Sie fest, welche Fahrzeuge (VINs) ein Benutzer sehen darf.
              Admins sehen immer alle Fahrzeuge.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {allVins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Car className="w-8 h-8 opacity-30" />
                <p className="text-sm">Keine Fahrzeuge geladen. Bitte zuerst eine Datei importieren.</p>
              </div>
            ) : (
              <>
                {/* Benutzer-Auswahl */}
                <div className="space-y-1.5">
                  <Label>{t('admin.columns.selectUser')}</Label>
                  <Select value={accessUserId} onValueChange={setAccessUserId}>
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="— Benutzer wählen —" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.role !== 'admin').map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} <span className="text-muted-foreground ml-1">({u.email})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {accessUserId && (() => {
                  const cfg = getAccess(accessUserId);
                  const filteredVins = allVins.filter(v =>
                    !accessSearch || v.toLowerCase().includes(accessSearch.toLowerCase())
                  );
                  const selectedUser = users.find(u => u.id === accessUserId);
                  const allowedCount = cfg.mode === 'all' ? allVins.length : cfg.allowedVins.length;
                  return (
                    <div className="space-y-4">
                      {/* Modus-Toggle */}
                      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                        <span className="text-sm font-medium">{selectedUser?.name}:</span>
                        <Button
                          size="sm"
                          variant={cfg.mode === 'all' ? 'default' : 'outline'}
                          onClick={() => setAccess(accessUserId, 'all', cfg.allowedVins)}
                          className="gap-1.5"
                        >
                          <Unlock className="w-3.5 h-3.5" /> Alle Fahrzeuge ({allVins.length})
                        </Button>
                        <Button
                          size="sm"
                          variant={cfg.mode === 'restricted' ? 'default' : 'outline'}
                          onClick={() => setAccess(accessUserId, 'restricted', cfg.allowedVins)}
                          className="gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" /> Eingeschränkt ({cfg.mode === 'restricted' ? allowedCount : 0} ausgewählt)
                        </Button>
                      </div>

                      {/* VIN-Liste (nur bei restricted) */}
                      {cfg.mode === 'restricted' && (
                        <div className="space-y-3">
                          {/* Suchfeld + Alle/Keine */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                              <Input
                                placeholder={t('admin.vehicleAccess.searchVin')}
                                value={accessSearch}
                                onChange={e => setAccessSearch(e.target.value)}
                                className="pl-8 h-8 text-sm"
                              />
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setAccess(accessUserId, 'restricted', allVins)} className="h-8 text-xs">Alle auswählen</Button>
                            <Button size="sm" variant="outline" onClick={() => setAccess(accessUserId, 'restricted', [])} className="h-8 text-xs">Keine</Button>
                            <span className="text-xs text-muted-foreground">{cfg.allowedVins.length} / {allVins.length} ausgewählt</span>
                          </div>

                          {/* VIN-Checkboxen */}
                          <div className="border border-border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                            {filteredVins.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">Keine VIN gefunden.</div>
                            ) : (
                              filteredVins.map((vin, idx) => {
                                const isAllowed = cfg.allowedVins.includes(vin);
                                // Zusatzinfo: Hersteller / Modell aus Record
                                const rec = fleetData.records.find(r => String(r.vin) === vin);
                                const make  = rec ? String(rec['Hersteller'] ?? rec['Make'] ?? rec['make'] ?? '') : '';
                                const model = rec ? String(rec['Modell'] ?? rec['Model'] ?? rec['model'] ?? '') : '';
                                return (
                                  <div
                                    key={vin}
                                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${idx > 0 ? 'border-t border-border' : ''} ${isAllowed ? 'bg-green-50/40' : ''}`}
                                    onClick={() => {
                                      const next = isAllowed
                                        ? cfg.allowedVins.filter(v => v !== vin)
                                        : [...cfg.allowedVins, vin];
                                      setAccess(accessUserId, 'restricted', next);
                                    }}
                                  >
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isAllowed ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                                      {isAllowed && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                    </div>
                                    <span className="font-mono text-sm font-medium">{vin}</span>
                                    {(make || model) && (
                                      <span className="text-xs text-muted-foreground">{[make, model].filter(Boolean).join(' ')}</span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab: DATEIVERWALTUNG                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'files' && (() => {
        const filtered = allDocuments
          .filter(d => {
            const q = fileSearch.toLowerCase();
            const matchSearch = !q || d.label.toLowerCase().includes(q)
              || d.originalFileName.toLowerCase().includes(q)
              || d.vehicleVin.toLowerCase().includes(q);
            const matchType = fileTypeFilter === 'all' || d.fileType === fileTypeFilter;
            return matchSearch && matchType;
          })
          .sort((a, b) => {
            let cmp = 0;
            if (fileSortBy === 'date')  cmp = a.uploadedAt.localeCompare(b.uploadedAt);
            if (fileSortBy === 'size')  cmp = a.size - b.size;
            if (fileSortBy === 'vin')   cmp = a.vehicleVin.localeCompare(b.vehicleVin);
            if (fileSortBy === 'name')  cmp = a.label.localeCompare(b.label);
            return fileSortDir === 'asc' ? cmp : -cmp;
          });

        const totalSize = allDocuments.reduce((s, d) => s + d.size, 0);
        const allSelected = filtered.length > 0 && filtered.every(d => selectedDocIds.has(d.id));

        const toggleSort = (col: typeof fileSortBy) => {
          if (fileSortBy === col) setFileSortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setFileSortBy(col); setFileSortDir('desc'); }
        };
        const SortIcon = ({ col }: { col: typeof fileSortBy }) =>
          fileSortBy === col
            ? (fileSortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)
            : null;

        return (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" /> Dateiverwaltung
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Alle hochgeladenen Dateien &#xB7; {allDocuments.length} Dokumente &#xB7; {formatFileSize(totalSize)} gesamt
                </p>
              </div>
              {selectedDocIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => setDeleteBulkConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  {selectedDocIds.size} ausgewählte löschen
                </Button>
              )}
            </div>

            {/* Filter-Leiste */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 h-8 text-sm"
                  placeholder="Dateiname, Bezeichnung oder VIN suchen..."
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'pdf', 'image'] as const).map(ft => (
                  <Button
                    key={ft}
                    variant={fileTypeFilter === ft ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setFileTypeFilter(ft)}
                  >
                    {ft === 'all'   && <Filter className="w-3.5 h-3.5" />}
                    {ft === 'pdf'   && <FileText className="w-3.5 h-3.5" />}
                    {ft === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
                    {ft === 'all' ? 'Alle' : ft === 'pdf' ? 'PDFs' : 'Bilder'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Tabelle */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {allDocuments.length === 0
                    ? 'Noch keine Dokumente hochgeladen.'
                    : 'Keine Dokumente gefunden.'}
                </p>
              </div>
            ) : (
              <Card className="border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="w-10 px-3 py-2.5 text-left">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={allSelected}
                            onChange={e => {
                              if (e.target.checked) setSelectedDocIds(new Set(filtered.map(d => d.id)));
                              else setSelectedDocIds(new Set());
                            }}
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-8">Typ</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => toggleSort('name')}>
                          <span className="flex items-center gap-1">Bezeichnung <SortIcon col="name" /></span>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => toggleSort('vin')}>
                          <span className="flex items-center gap-1">VIN <SortIcon col="vin" /></span>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => toggleSort('size')}>
                          <span className="flex items-center gap-1">Größe <SortIcon col="size" /></span>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => toggleSort('date')}>
                          <span className="flex items-center gap-1">Hochgeladen <SortIcon col="date" /></span>
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(doc => (
                        <tr key={doc.id} className={`hover:bg-muted/20 transition-colors ${selectedDocIds.has(doc.id) ? 'bg-primary/5' : ''}`}>
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectedDocIds.has(doc.id)}
                              onChange={e => {
                                const next = new Set(selectedDocIds);
                                if (e.target.checked) next.add(doc.id);
                                else next.delete(doc.id);
                                setSelectedDocIds(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            {doc.fileType === 'pdf'
                              ? <FileText className="w-4 h-4 text-red-400" />
                              : <ImageIcon className="w-4 h-4 text-blue-400" />}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground leading-tight">{doc.label}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-48">{doc.originalFileName}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="text-xs font-mono">{doc.vehicleVin}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {formatFileSize(doc.size)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(doc.uploadedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteDocConfirm(doc.id)}
                              title="Datei löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filtered.length} von {allDocuments.length} Dateien</span>
                  <span>{formatFileSize(filtered.reduce((s, d) => s + d.size, 0))}</span>
                </div>
              </Card>
            )}

            {/* Einzeln löschen */}
            <AlertDialog open={!!deleteDocConfirm} onOpenChange={v => !v && setDeleteDocConfirm(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" /> Datei löschen
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {(() => {
                      const d = allDocuments.find(x => x.id === deleteDocConfirm);
                      return d ? `"${d.label}" (${d.originalFileName}) unwiderruflich löschen?` : 'Diese Datei unwiderruflich löschen?';
                    })()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      if (deleteDocConfirm) {
                        await deleteDocument(deleteDocConfirm);
                        setSelectedDocIds(prev => { const n = new Set(prev); n.delete(deleteDocConfirm); return n; });
                      }
                      setDeleteDocConfirm(null);
                    }}
                  >
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Mehrere löschen */}
            <AlertDialog open={deleteBulkConfirm} onOpenChange={setDeleteBulkConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" /> {selectedDocIds.size} Dateien löschen
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Alle {selectedDocIds.size} ausgewählten Dateien werden unwiderruflich gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      for (const id of Array.from(selectedDocIds)) {
                        await deleteDocument(id);
                      }
                      setSelectedDocIds(new Set());
                      setDeleteBulkConfirm(false);
                    }}
                  >
                    Alle {selectedDocIds.size} löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
        );
      })()}

      {/* ── Tab: E-Mail-Einstellungen ─────────────────────────────────── */}
      {activeTab === 'email' && (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> {t('admin.email.title')}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">{t('admin.email.desc')}</p>
          </div>

          {/* Anleitung */}
          <Card className="border-primary/20 bg-primary/3">
            <CardContent className="py-3 px-4">
              <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> {t('admin.email.howtoTitle')}
              </p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                <li>{t('admin.email.howto1')} <a href="https://www.emailjs.com" target="_blank" rel="noreferrer" className="text-primary underline">emailjs.com</a></li>
                <li>{t('admin.email.howto2')}</li>
                <li>{t('admin.email.howto3')} – {t('admin.email.howto3b')}</li>
                <li>{t('admin.email.howto4')}</li>
                <li>{t('admin.email.howto5')}</li>
              </ol>
              <div className="mt-2 border-t border-border pt-2 space-y-1">
                <p className="text-xs text-muted-foreground font-semibold">{t('admin.email.templateVarsWelcome')}:</p>
                <p className="text-xs text-muted-foreground">
                  {['{{to_name}}','{{to_email}}','{{password}}','{{role}}','{{app_url}}','{{sender_name}}'].map(v => (
                    <code key={v} className="bg-muted px-1 rounded mr-1">{v}</code>
                  ))}
                </p>
                <p className="text-xs text-muted-foreground font-semibold mt-1">{t('admin.email.templateVarsVehicle')}:</p>
                <p className="text-xs text-muted-foreground">
                  {['{{from_email}}','{{from_name}}','{{to_email}}','{{subject}}','{{message}}','{{vin}}','{{reply_to}}'].map(v => (
                    <code key={v} className="bg-muted px-1 rounded mr-1">{v}</code>
                  ))}
                </p>
                <p className="text-xs text-amber-600 mt-1">⚠ {t('admin.email.replyToHint')}</p>
              </div>
            </CardContent>
          </Card>

          {/* Formular */}
          <Card>
            <CardContent className="py-4 space-y-3">
              {/* ── Basis-Konfiguration ── */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('admin.email.sectionBase')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.email.serviceId')} *</Label>
                  <Input
                    value={emailSettings.serviceId}
                    onChange={e => setEmailSettings(s => ({ ...s, serviceId: e.target.value }))}
                    placeholder="service_xxxxxxx"
                    className="font-mono text-sm h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.email.publicKey')} *</Label>
                  <Input
                    value={emailSettings.publicKey}
                    onChange={e => setEmailSettings(s => ({ ...s, publicKey: e.target.value }))}
                    placeholder="xxxxxxxxxxxxxxxxxxxx"
                    className="font-mono text-sm h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.email.senderName')}</Label>
                  <Input
                    value={emailSettings.senderName}
                    onChange={e => setEmailSettings(s => ({ ...s, senderName: e.target.value }))}
                    placeholder="Krug Fleet Manager"
                    className="text-sm h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('admin.email.appUrl')}</Label>
                  <Input
                    value={emailSettings.appUrl}
                    onChange={e => setEmailSettings(s => ({ ...s, appUrl: e.target.value }))}
                    placeholder={window.location.origin}
                    className="text-sm h-8"
                  />
                </div>
              </div>

              {/* ── Templates ── */}
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('admin.email.sectionTemplates')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('admin.email.templateId')} *</Label>
                    <p className="text-xs text-muted-foreground">{t('admin.email.templateIdHint')}</p>
                    <Input
                      value={emailSettings.templateId}
                      onChange={e => setEmailSettings(s => ({ ...s, templateId: e.target.value }))}
                      placeholder="template_xxxxxxx"
                      className="font-mono text-sm h-8"
                    />
                    {isEmailConfigured()
                      ? <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t('admin.email.configured')}</p>
                      : <p className="text-xs text-muted-foreground">{t('admin.email.notConfigured')}</p>
                    }
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('admin.email.vehicleTemplateId')} *</Label>
                    <p className="text-xs text-muted-foreground">{t('admin.email.vehicleTemplateIdHint')}</p>
                    <Input
                      value={emailSettings.vehicleTemplateId || ''}
                      onChange={e => setEmailSettings(s => ({ ...s, vehicleTemplateId: e.target.value }))}
                      placeholder="template_xxxxxxx"
                      className="font-mono text-sm h-8"
                    />
                    {isVehicleMailConfigured()
                      ? <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t('admin.email.configured')}</p>
                      : <p className="text-xs text-muted-foreground">{t('admin.email.notConfigured')}</p>
                    }
                  </div>
                </div>
              </div>

              {/* ── Fahrzeug-Domain ── */}
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('admin.email.sectionDomain')}</p>
                <div className="space-y-1 max-w-sm">
                  <Label className="text-xs">{t('admin.email.mailDomain')}</Label>
                  <p className="text-xs text-muted-foreground">{t('admin.email.mailDomainHint')}</p>
                  <Input
                    value={emailSettings.mailDomain || 'ksmeu.com'}
                    onChange={e => setEmailSettings(s => ({ ...s, mailDomain: e.target.value }))}
                    placeholder="ksmeu.com"
                    className="font-mono text-sm h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('admin.email.mailDomainExample')}: <code className="bg-muted px-1 rounded">fzg.VIN@{emailSettings.mailDomain || 'ksmeu.com'}</code>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    saveEmailSettings(emailSettings);
                    setEmailSettingsSaved(true);
                    setTimeout(() => setEmailSettingsSaved(false), 2500);
                  }}
                >
                  {emailSettingsSaved
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> {t('admin.email.saved')}</>
                    : <><Save className="w-3.5 h-3.5" /> {t('admin.email.save')}</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Dialoge (Benutzer) ─────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.addTitle')}</DialogTitle>
            <DialogDescription>{t('admin.addDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('admin.form.name')}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('admin.form.namePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin.form.role')}</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_CONFIG) as UserRole[]).map(r => (
                      <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                    ))}
                    {roles.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide border-t mt-1 pt-2">{t('admin.roles.ownRoles')}</div>
                        {roles.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.form.email')}</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={t('admin.form.emailPlaceholder')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('admin.form.password')}</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={t('admin.form.passwordPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin.form.confirm')}</Label>
                <Input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder={t('admin.form.confirmPlaceholder')} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>{t('admin.form.cancel')}</Button>
            <Button onClick={handleAdd}>{t('admin.form.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={open => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('admin.editTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('admin.form.name')}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin.form.role')}</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))} disabled={editingUser?.id === 'admin-1'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_CONFIG) as UserRole[]).map(r => (
                      <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                    ))}
                    {roles.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide border-t mt-1 pt-2">{t('admin.roles.ownRoles')}</div>
                        {roles.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.form.email')}</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            {formError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t('admin.form.cancel')}</Button>
            <Button onClick={handleUpdate}>{t('admin.form.saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUser} onOpenChange={open => !open && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.resetTitle')}</DialogTitle>
            <DialogDescription>{t('admin.resetDesc', { name: resetUser?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>{t('admin.newPasswordLabel')}</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1.5" placeholder={t('admin.form.passwordPlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>{t('admin.form.cancel')}</Button>
            <Button onClick={handleResetPassword} disabled={newPassword.length < 8}>{t('admin.setPassword')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingUser} onOpenChange={open => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> {t('admin.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteDesc', { name: deletingUser?.name ?? '', email: deletingUser?.email ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">{t('admin.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Spalten-Konfigurator */}
      {colConfigUser && <ColumnConfigEditor user={colConfigUser} onClose={() => setColConfigUser(null)} />}

      {/* ── Rollen-Dialog (Anlegen / Bearbeiten) ─────────────────── */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="w-4 h-4" />
              {editingRole ? t('admin.roles.editRole') : t('admin.roles.addRole')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.roles.roleFormDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t('admin.roles.roleName')} *</Label>
              <Input
                autoFocus
                value={roleForm.name}
                onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z. B. Sachbearbeiter, Gutachter, Außendienst…"
                onKeyDown={e => e.key === 'Enter' && handleSaveRole()}
              />
            </div>
            {/* Beschreibung */}
            <div className="space-y-1.5">
              <Label>Beschreibung <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={roleForm.description}
                onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('admin.roles.roleDescriptionPlaceholder')}
              />
            </div>
            {/* Basisrolle */}
            <div className="space-y-1.5">
              <Label>{t('admin.roles.roleBasedOn')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {BUILTIN_BASES.map(b => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setRoleForm(f => ({ ...f, basedOn: b.value }))}
                    className={`text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all
                      ${roleForm.basedOn === b.value
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/40'}`}
                  >
                    <p className="font-medium">{b.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Farbe */}
            <div className="space-y-1.5">
              <Label>{t('admin.roles.roleColor')}</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setRoleForm(f => ({ ...f, color: c.value }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${c.value}
                      ${roleForm.color === c.value ? 'ring-2 ring-offset-1 ring-primary scale-105' : 'opacity-70 hover:opacity-100'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Vorschau */}
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
              <span className="text-xs text-muted-foreground">{t('admin.roles.rolePreview')}</span>
              <Badge className={`text-xs px-2 border ${roleForm.color}`}>
                {roleForm.name || 'Rollenname'}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveRole} disabled={!roleForm.name.trim()} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> {editingRole ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rollen-Lösch-Dialog ───────────────────────────────────── */}
      <AlertDialog open={!!deletingRole} onOpenChange={v => !v && setDeletingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" /> {t('admin.roles.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.roles.deleteDesc', {
                name: deletingRole?.name,
                base: BUILTIN_BASES.find(b => b.value === deletingRole?.basedOn)?.label
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteRole}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Backup-Dialoge ─────────────────────────────────────────── */}
      <AlertDialog open={!!restoreConfirmId} onOpenChange={v => !v && setRestoreConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" /> {t('admin.backups.restoreTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle aktuellen Daten (Fahrzeuge, Einstellungen, Dokumente) werden durch den gewählten Snapshot ersetzt.
              Die Seite wird danach neu geladen. Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={() => { if (restoreConfirmId) restore(restoreConfirmId); }}>
              Jetzt wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={v => !v && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" /> Backup löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Das gewählte Backup wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteConfirmId) { remove(deleteConfirmId); setDeleteConfirmId(null); } }}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Custom-Column Dialog ───────────────────────────────────── */}
      <Dialog open={showColDialog} onOpenChange={setShowColDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCol ? 'Spalte bearbeiten' : 'Neue Spalte anlegen'}</DialogTitle>
            <DialogDescription>{t('admin.detailFields.fieldDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('admin.detailFields.fieldName')} *</Label>
              <Input
                autoFocus
                value={colForm.label}
                onChange={e => setColForm(f => ({ ...f, label: e.target.value }))}
                placeholder="z. B. Interne Notiz, Versicherungsnummer…"
                onKeyDown={e => e.key === 'Enter' && handleSaveCol()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={colForm.description}
                onChange={e => setColForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('admin.groups.descPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowColDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveCol} disabled={!colForm.label.trim()} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> {editingCol ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gruppen-Dialog (Anlegen / Bearbeiten) ──────────────────── */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroup ? t('admin.groups.editTitle') : t('admin.groups.addTitle')}</DialogTitle>
            <DialogDescription>{t('admin.groups.formDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Name + Beschreibung */}
            <div className="space-y-1.5">
              <Label>{t('admin.groups.name')} *</Label>
              <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="z. B. Sachbearbeiter, Außendienst…" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.groups.description')}</Label>
              <Input value={groupForm.description ?? ''} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder={t('admin.groups.descPlaceholder')} />
            </div>

            {/* Gruppenfarbe */}
            <div className="space-y-2">
              <Label>Gruppenfarbe</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map(c => (
                  <button key={c} onClick={() => setGroupForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${groupForm.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            {/* Dokument-Rechte */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Dokument-Berechtigungen</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'canViewDocs',    label: 'Dokumente ansehen' },
                  { key: 'canUploadPdf',   label: 'PDF hochladen' },
                  { key: 'canUploadImage', label: 'Bilder hochladen' },
                  { key: 'canDeleteDocs',  label: 'Dokumente löschen' },
                ] as { key: keyof typeof groupForm.docPermissions; label: string }[]).map(({ key, label }) => (
                  <button key={key}
                    onClick={() => setGroupForm(f => ({ ...f, docPermissions: { ...f.docPermissions, [key]: !f.docPermissions[key] } }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${groupForm.docPermissions[key] ? 'bg-green-50 border-green-300 text-green-800' : 'bg-muted border-border text-muted-foreground'}`}
                  >
                    {groupForm.docPermissions[key] ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fahrzeugzugang */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5" /> Fahrzeugzugang</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={groupForm.vehicleAccess.mode === 'all' ? 'default' : 'outline'}
                  onClick={() => setGroupForm(f => ({ ...f, vehicleAccess: { ...f.vehicleAccess, mode: 'all' } }))}>
                  <Unlock className="w-3.5 h-3.5 mr-1" /> Alle
                </Button>
                <Button size="sm" variant={groupForm.vehicleAccess.mode === 'restricted' ? 'default' : 'outline'}
                  onClick={() => setGroupForm(f => ({ ...f, vehicleAccess: { ...f.vehicleAccess, mode: 'restricted' } }))}>
                  <Lock className="w-3.5 h-3.5 mr-1" /> Eingeschränkt ({groupForm.vehicleAccess.allowedVins.length})
                </Button>
              </div>
              {groupForm.vehicleAccess.mode === 'restricted' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="VIN suchen…" value={groupVinSearch} onChange={e => setGroupVinSearch(e.target.value)} className="pl-8 h-8 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGroupForm(f => ({ ...f, vehicleAccess: { ...f.vehicleAccess, allowedVins: allVins } }))}>Alle</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGroupForm(f => ({ ...f, vehicleAccess: { ...f.vehicleAccess, allowedVins: [] } }))}>Keine</Button>
                    <span className="text-xs text-muted-foreground self-center">{groupForm.vehicleAccess.allowedVins.length} / {allVins.length}</span>
                  </div>
                  <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                    {allVins.filter(v => !groupVinSearch || v.toLowerCase().includes(groupVinSearch.toLowerCase())).map((vin, idx) => {
                      const allowed = groupForm.vehicleAccess.allowedVins.includes(vin);
                      const rec = fleetData.records.find(r => String(r.vin) === vin);
                      const info = [rec?.['Hersteller'] ?? rec?.['Make'], rec?.['Modell'] ?? rec?.['Model']].filter(Boolean).join(' ');
                      return (
                        <div key={vin} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 ${idx > 0 ? 'border-t border-border' : ''} ${allowed ? 'bg-green-50/40' : ''}`}
                          onClick={() => setGroupForm(f => ({ ...f, vehicleAccess: { ...f.vehicleAccess, allowedVins: allowed ? f.vehicleAccess.allowedVins.filter(v => v !== vin) : [...f.vehicleAccess.allowedVins, vin] } }))}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${allowed ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                            {allowed && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <span className="font-mono text-xs">{vin}</span>
                          {info && <span className="text-xs text-muted-foreground">{String(info)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.name.trim()} className="gap-1.5">
              <Save className="w-3.5 h-3.5" /> {editingGroup ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Credentials-Dialog (nach Benutzeranlage) ────────────────── */}
      <Dialog open={!!createdCredentials} onOpenChange={v => { if (!v) { setCreatedCredentials(null); setEmailSendStatus('idle'); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {t('admin.credentials.title')}
            </DialogTitle>
            <DialogDescription>{t('admin.credentials.desc')}</DialogDescription>
          </DialogHeader>

          {createdCredentials && (
            <div className="space-y-3">
              {/* Zugangsdaten-Box */}
              <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-2.5">
                {[
                  { label: t('admin.form.name'),     value: createdCredentials.name,     field: 'name'     },
                  { label: t('admin.form.email'),    value: createdCredentials.email,    field: 'email'    },
                  { label: t('admin.form.password'), value: createdCredentials.password, field: 'password' },
                  { label: t('admin.form.role'),     value: createdCredentials.role,     field: 'role'     },
                ].map(({ label, value, field }) => (
                  <div key={field} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-sm font-medium ${field === 'password' ? 'font-mono tracking-wider' : ''}`}>{value}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(value);
                        setCopiedField(field);
                        setTimeout(() => setCopiedField(null), 1500);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                      title={t('admin.credentials.copy')}
                    >
                      {copiedField === field
                        ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                        : <Copy className="w-4 h-4" />
                      }
                    </button>
                  </div>
                ))}
              </div>

              {/* App-URL */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>{t('admin.credentials.loginUrl')}:</span>
                <a href={window.location.origin} target="_blank" rel="noreferrer" className="text-primary underline truncate">
                  {window.location.origin}
                </a>
              </div>

              {/* E-Mail-Status */}
              <div className="border-t border-border pt-3">
                {emailSendStatus === 'sending' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    {t('admin.credentials.sending')}
                  </div>
                )}
                {emailSendStatus === 'sent' && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('admin.credentials.emailSent', { email: createdCredentials.email })}
                  </div>
                )}
                {emailSendStatus === 'not_configured' && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('admin.credentials.emailNotConfigured')}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('admin.credentials.manualHint')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setEmailSendStatus('idle');
                      }}
                    >
                      <Settings2 className="w-3 h-3" />
                      {t('admin.credentials.configureEmail')}
                    </Button>
                  </div>
                )}
                {emailSendStatus === 'error' && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('admin.credentials.emailError')}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{emailErrorMsg}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      disabled={false}
                      onClick={() => {
                        setEmailSendStatus('sending');
                        sendWelcomeEmail({ toEmail: createdCredentials.email, toName: createdCredentials.name, password: createdCredentials.password, role: createdCredentials.role })
                          .then(res => {
                            if (res.status === 'sent') setEmailSendStatus('sent');
                            else if (res.status === 'not_configured') setEmailSendStatus('not_configured');
                            else { setEmailSendStatus('error'); setEmailErrorMsg(res.message); }
                          });
                      }}
                    >
                      <Mail className="w-3 h-3" /> {t('admin.credentials.retry')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => { setCreatedCredentials(null); setEmailSendStatus('idle'); }}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
