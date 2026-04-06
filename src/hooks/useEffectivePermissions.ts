/**
 * useEffectivePermissions
 *
 * Löst die tatsächlich gültigen Berechtigungen für einen Nutzer auf.
 * Priorität: Admin-Override > Individuelle Konfiguration > Gruppeneinstellung > Systemstandard
 *
 * "Individuelle Konfiguration" = ein expliziter Eintrag in den jeweiligen Stores.
 * Existiert kein solcher Eintrag, wird die Gruppe des Nutzers herangezogen.
 */
import { useVehicleAccessStore, useDocPermStore, useColumnConfigStore, useUserGroupStore, useUsersStore } from './useStore';
import type { UserDocPermission, UserVehicleAccess, UserColumnConfig } from '@/lib/types';

const ADMIN_DOC_PERM: UserDocPermission = {
  userId: '', canUploadPdf: true, canUploadImage: true, canDeleteDocs: true, canViewDocs: true,
  canImport: true, canBulkUpload: true, canViewDashboard: true, canEditDashboard: true, canOverrideDashboardLayout: true,
};
const DEFAULT_DOC_PERM: Omit<UserDocPermission, 'userId'> = {
  canUploadPdf: true, canUploadImage: true, canDeleteDocs: false, canViewDocs: true,
  canImport: true, canBulkUpload: true, canViewDashboard: true, canEditDashboard: false, canOverrideDashboardLayout: false,
};

export function useEffectivePermissions(userId: string, role: string) {
  const { configs: accessConfigs } = useVehicleAccessStore();
  const { permissions: docPerms } = useDocPermStore();
  const { configs: colConfigs } = useColumnConfigStore();
  const { groups, getGroup } = useUserGroupStore();
  const { users } = useUsersStore();

  const user = users.find(u => u.id === userId);
  const group = user?.groupId ? getGroup(user.groupId) : undefined;

  // ── Dokument-Berechtigungen ──────────────────────────────────────
  const getEffectiveDocPerm = (): UserDocPermission => {
    if (role === 'admin') return { ...ADMIN_DOC_PERM, userId };
    // Individuelle Konfiguration vorhanden?
    const individual = docPerms.find(p => p.userId === userId);
    if (individual) return individual;
    // Gruppen-Einstellung?
    if (group) return { canViewDashboard: true, canEditDashboard: false, canOverrideDashboardLayout: false, userId, ...group.docPermissions } as unknown as import('@/lib/types').UserDocPermission;
    // Systemstandard
    return { userId, ...DEFAULT_DOC_PERM };
  };

  // ── Fahrzeugzugang ────────────────────────────────────────────────
  const getEffectiveVehicleAccess = (): UserVehicleAccess => {
    if (role === 'admin') return { userId, mode: 'all', allowedVins: [] };
    // Individuelle Konfiguration vorhanden?
    const individual = accessConfigs.find(c => c.userId === userId);
    if (individual) return individual;
    // Gruppen-Einstellung?
    if (group) return { userId, mode: group.vehicleAccess.mode, allowedVins: group.vehicleAccess.allowedVins };
    // Systemstandard
    return { userId, mode: 'all', allowedVins: [] };
  };

  // ── Spalten / Detailfelder ────────────────────────────────────────
  const getEffectiveColumnConfig = (): UserColumnConfig | undefined => {
    // Individuelle Konfiguration vorhanden?
    const individual = colConfigs.find(c => c.userId === userId);
    if (individual) return individual;
    // Gruppen-Einstellung?
    if (group) {
      const { visibleColumns, visibleDetailFields } = group.columnSettings;
      if (visibleColumns.length > 0 || visibleDetailFields.length > 0) {
        return { userId, visibleColumns, visibleDetailFields };
      }
    }
    return undefined;
  };

  return {
    docPerm: getEffectiveDocPerm(),
    vehicleAccess: getEffectiveVehicleAccess(),
    columnConfig: getEffectiveColumnConfig(),
  };
}
