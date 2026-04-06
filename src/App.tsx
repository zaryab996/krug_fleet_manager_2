import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { isConfigured }   from '@/db/client';
import SetupWizard        from '@/components/SetupWizard';
import { Toaster } from '@/components/ui/sonner';
import { useAuthStore } from '@/hooks/useStore';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/Login';
import DashboardPage from '@/pages/Dashboard';
import VehiclesPage from '@/pages/Vehicles';
import VehicleDetailPage from '@/pages/VehicleDetail';
import ImportPage from '@/pages/Import';
import FolderUploadPage from '@/pages/FolderUpload';
import AdminPage from '@/pages/Admin';
import { ROUTE_PATHS } from '@/lib/index';

// Geschützte Route: nur für eingeloggte Benutzer
function ProtectedRoute() {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

// Admin-Route: nur für Admins
function AdminRoute() {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  if (currentUser.role !== 'admin') return <Navigate to={ROUTE_PATHS.VEHICLES} replace />;
  return <Outlet />;
}

export default function App() {
  // Setup-Wizard zeigen wenn keine DB konfiguriert UND nicht übersprungen
  // (Credentials are now hardcoded at build time – wizard only shows if env vars are missing)
  const skipped = localStorage.getItem('fleet-setup-skipped') === '1';
  if (!isConfigured() && !skipped) {
    return <SetupWizard />;
  }

  return (
    <Router>
      <Routes>
        {/* Öffentliche Route */}
        <Route path={ROUTE_PATHS.LOGIN} element={<LoginPage />} />

        {/* Geschützte Routen */}
        <Route element={<ProtectedRoute />}>
          <Route path={ROUTE_PATHS.HOME} element={<Navigate to={ROUTE_PATHS.VEHICLES} replace />} />
          <Route path={ROUTE_PATHS.VEHICLES} element={<VehiclesPage />} />
          <Route path={ROUTE_PATHS.VEHICLE_DETAIL} element={<VehicleDetailPage />} />
          <Route path={ROUTE_PATHS.IMPORT} element={<ImportPage />} />
          <Route path={ROUTE_PATHS.FOLDER_UPLOAD} element={<FolderUploadPage />} />
          <Route path={ROUTE_PATHS.DASHBOARD} element={<DashboardPage />} />
          {/* Admin-Bereich: nur für Admins */}
          <Route element={<AdminRoute />}>
            <Route path={ROUTE_PATHS.ADMIN} element={<AdminPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
      </Routes>
      <Toaster position="bottom-right" richColors />
    </Router>
  );
}
