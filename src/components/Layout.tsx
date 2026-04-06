import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Users, Upload, LogOut, Menu, X,
  ChevronRight, Shield, Languages, FolderUp, Archive, PlusCircle, LayoutDashboard, ScanQrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore, useBackupStore, useDocPermStore, useFleetStore } from '@/hooks/useStore';
import QRScannerDialog from '@/components/QRScannerDialog';
import NewVehicleDialog from '@/components/NewVehicleDialog';
import ArchiveView      from '@/components/ArchiveView';
import { ROUTE_PATHS } from '@/lib/index';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/index';
import { isConfigured } from '@/db/client';

const LANGUAGES = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
];

interface LayoutProps { children: React.ReactNode; }

/** Hook: erkennt ob Mobile-Viewport (< 768px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { triggerAutoBackup } = useBackupStore();
  const { getPermission } = useDocPermStore();

  // Schließe mobiles Menü bei Navigation
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Auto-Backup
  useEffect(() => {
    if (!currentUser) return;
    triggerAutoBackup();
    const id = setInterval(() => triggerAutoBackup(), 60 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const myPerm = currentUser ? getPermission(currentUser.id, currentUser.role) : null;
  const isAdmin    = currentUser?.role === 'admin';
  const isEditor   = currentUser?.role === 'editor';
  const { fleetData: fleetDataForArchive } = useFleetStore();
  const archivedCount = isAdmin ? fleetDataForArchive.records.filter(r => r._archived === true).length : 0;

  const [showNewVehicle, setShowNewVehicle] = React.useState(false);
  const [showArchive,    setShowArchive]    = React.useState(false);
  const [showScanner,    setShowScanner]    = React.useState(false);

  const navItems = [
    { to: ROUTE_PATHS.VEHICLES,      label: t('nav.vehicles'),   icon: Car,         visible: true },
    { to: ROUTE_PATHS.DASHBOARD,     label: 'Dashboard',         icon: LayoutDashboard, visible: true },
    { to: ROUTE_PATHS.IMPORT,        label: t('nav.import'),     icon: Upload,   visible: isAdmin || !!myPerm?.canImport },
    { to: ROUTE_PATHS.FOLDER_UPLOAD, label: t('nav.bulkUpload'), icon: FolderUp, visible: isAdmin || !!myPerm?.canBulkUpload },
    { to: ROUTE_PATHS.ADMIN,         label: t('nav.admin'),      icon: Shield,   visible: isAdmin },
  ].filter(i => i.visible);

  const handleLogout = () => { logout(); navigate(ROUTE_PATHS.LOGIN); };
  const changeLanguage = (code: string) => { i18n.changeLanguage(code); localStorage.setItem('fleet-lang', code); };
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];
  const initials = currentUser?.name.split(' ').map(n => n[0]).join('').toUpperCase() ?? 'U';

  const roleColors: Record<string, string> = {
    admin:  'bg-primary text-primary-foreground',
    editor: 'bg-accent text-accent-foreground',
    viewer: 'bg-secondary text-secondary-foreground',
  };

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">

        {/* Mobile Top-Bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border shrink-0 z-30">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-white shadow-sm shrink-0">
              <img src="/ksm_logo.png" alt="KSM Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-semibold text-sidebar-foreground text-sm">Krug Fleet</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Sprache */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-sidebar-foreground/70">
                  <Languages className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" className="w-36">
                {LANGUAGES.map(lang => (
                  <DropdownMenuItem key={lang.code} onClick={() => changeLanguage(lang.code)}
                    className={`gap-2 cursor-pointer ${i18n.language === lang.code ? 'font-semibold text-primary' : ''}`}>
                    {lang.flag} {lang.label}
                    {i18n.language === lang.code && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger */}
            <button
              className="w-8 h-8 flex items-center justify-center text-sidebar-foreground rounded-md hover:bg-sidebar-accent/20"
              onClick={() => setMobileMenuOpen(v => !v)}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Mobile Drawer-Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              {/* Drawer von rechts */}
              <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 35 }}
                className="fixed top-0 right-0 h-full w-72 bg-sidebar border-l border-sidebar-border z-50 flex flex-col shadow-2xl"
              >
                {/* Drawer-Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="text-xs bg-primary/20 text-primary font-mono">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-sidebar-foreground leading-tight">{currentUser?.name}</p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-0.5 ${roleColors[currentUser?.role ?? 'viewer']}`}>
                        {currentUser?.role}
                      </Badge>
                    </div>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                  {navItems.map(item => (
                    <NavLink key={item.to} to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
                        }`
                      }
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {item.label}
                      <ChevronRight className="w-4 h-4 ml-auto opacity-40" />
                    </NavLink>
                  ))}
                  <button onClick={() => { setShowScanner(true); setMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium text-primary hover:bg-sidebar-accent/20 transition-all">
                    <ScanQrCode className="w-5 h-5 shrink-0" />
                    QR-Code scannen
                  </button>
                  {(isAdmin || isEditor) && (
                    <button onClick={() => { setShowNewVehicle(true); }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium text-green-600 hover:bg-sidebar-accent/20 transition-all">
                      <PlusCircle className="w-5 h-5 shrink-0" />
                      Fahrzeug hinzufügen
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => { setShowArchive(true); }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium text-orange-600 hover:bg-sidebar-accent/20 transition-all">
                      <Archive className="w-5 h-5 shrink-0" />
                      Archiv
                      {archivedCount > 0 && (
                        <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{archivedCount}</span>
                      )}
                    </button>
                  )}
                </nav>

                {/* Abmelden */}
                <div className="p-3 border-t border-sidebar-border">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    {t('nav.logout')}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Haupt-Content */}
        <main className="flex-1 overflow-auto overscroll-contain">
          {/* Supabase-Status-Banner (nur wenn nicht verbunden) */}
          {!isConfigured() && (
            <div className="bg-amber-500 text-white text-xs px-3 py-1.5 flex items-center justify-between gap-2">
              <span>⚠️ Keine Datenbankverbindung – Daten nur im Browser gespeichert</span>
              <a href="/admin" className="underline font-semibold whitespace-nowrap">Jetzt verbinden →</a>
            </div>
          )}
          {children}
        </main>

        {/* Mobile Bottom-Navigation */}
        <nav className="shrink-0 bg-sidebar border-t border-sidebar-border flex z-30 safe-bottom">
          {navItems.map(item => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors min-h-[52px] ${
                  isActive
                    ? 'text-primary'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                <span className="leading-none mt-0.5">{item.label}</span>
                {isActive && (
                  <motion.div layoutId="bottom-nav-indicator"
                    className="absolute bottom-0 w-10 h-0.5 bg-primary rounded-full" />
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    );
  }

  // ── DESKTOP LAYOUT (unverändert) ───────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
        className="flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 overflow-hidden"
      >
        <div className="flex items-center gap-1.5 px-4 py-4 border-b border-sidebar-border">
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-white shadow-sm">
            <img src="/ksm_logo.png" alt="KSM Krug Schadenmanagement" className="w-full h-full object-contain" />
          </div>
          {sidebarOpen && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="font-semibold text-sidebar-foreground text-sm tracking-tight leading-tight">
              Krug Fleet<br />
              <span className="text-xs font-normal text-sidebar-foreground/60">Manager</span>
            </motion.span>
          )}
          <button className="ml-auto text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive ? 'bg-primary text-primary-foreground font-medium shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{item.label}</motion.span>}
              {sidebarOpen && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
            </NavLink>
          ))}

          {/* ── QR-Code Scan ── */}
          <button
            onClick={() => setShowScanner(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-sidebar-foreground hover:bg-sidebar-accent/20"
            title="QR-Code scannen"
          >
            <ScanQrCode className="w-4 h-4 shrink-0 text-primary" />
            {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-primary font-medium">Scannen</motion.span>}
          </button>

          {/* ── Fahrzeug hinzufügen (Admin + Bearbeiter) ── */}
          {(isAdmin || isEditor) && (
            <button
              onClick={() => setShowNewVehicle(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-sidebar-foreground hover:bg-sidebar-accent/20 mt-1"
              title="Fahrzeug hinzufügen"
            >
              <PlusCircle className="w-4 h-4 shrink-0 text-green-500" />
              {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-green-600 font-medium">Fahrzeug hinzufügen</motion.span>}
            </button>
          )}

          {/* ── Archiv (nur Admin) ── */}
          {isAdmin && (
            <button
              onClick={() => setShowArchive(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-sidebar-foreground hover:bg-sidebar-accent/20 relative"
              title="Archiv"
            >
              <Archive className="w-4 h-4 shrink-0 text-orange-500" />
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-orange-600 font-medium flex-1 text-left">
                  Archiv
                </motion.span>
              )}
              {archivedCount > 0 && (
                <span className={`bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none ${sidebarOpen ? 'w-5 h-5' : 'absolute top-1.5 right-1.5 w-4 h-4'}`}>
                  {archivedCount > 99 ? '99+' : archivedCount}
                </span>
              )}
            </button>
          )}
        </nav>

        <div className={`px-3 pb-2 ${sidebarOpen ? '' : 'flex justify-center'}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size={sidebarOpen ? 'sm' : 'icon'}
                className={`w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/20 gap-2 ${sidebarOpen ? 'justify-start px-3' : 'w-9 h-9'}`}
                title={t('lang.switch')}>
                <Languages className="w-4 h-4 shrink-0" />
                {sidebarOpen && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm">
                    {currentLang.flag} {currentLang.label}
                  </motion.span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-36">
              {LANGUAGES.map(lang => (
                <DropdownMenuItem key={lang.code} onClick={() => changeLanguage(lang.code)}
                  className={`gap-2 cursor-pointer ${i18n.language === lang.code ? 'font-semibold text-primary' : ''}`}>
                  <span>{lang.flag}</span> {lang.label}
                  {i18n.language === lang.code && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="text-xs bg-primary/20 text-primary font-mono">{initials}</AvatarFallback>
            </Avatar>
            {sidebarOpen && currentUser && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser.name}</p>
                <Badge variant="outline" className={`text-xs px-1.5 py-0 ${roleColors[currentUser.role]}`}>
                  {currentUser.role}
                </Badge>
              </motion.div>
            )}
            {sidebarOpen && (
              <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={handleLogout} title={t('nav.logout')}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-auto">
        {!isConfigured() && (
          <div className="bg-amber-500 text-white text-xs px-4 py-1.5 flex items-center justify-between gap-2">
            <span>⚠️ Keine Datenbankverbindung – Daten werden nur im Browser gespeichert und können verloren gehen</span>
            <a href="/admin" className="underline font-semibold whitespace-nowrap">Admin → Datenbankverbindung einrichten →</a>
          </div>
        )}
        {children}
      </main>

      {/* ── Dialogs ── */}
      {(isAdmin || isEditor) && (
        <NewVehicleDialog open={showNewVehicle} onClose={() => setShowNewVehicle(false)} />
      )}
      {isAdmin && (
        <ArchiveDialogWrapper open={showArchive} onClose={() => setShowArchive(false)} />
      )}
    </div>
  );
}

// Separate small wrapper to keep Layout clean
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArchiveRestore } from 'lucide-react';
function ArchiveDialogWrapper({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
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
  );
}
