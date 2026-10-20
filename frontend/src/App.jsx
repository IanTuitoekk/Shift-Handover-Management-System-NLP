import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { GuestRoute, ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { useAuth } from './auth/useAuth';
import { AppShell } from './components/shell/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { CreditsPage } from './pages/CreditsPage';
import { AccountPage } from './pages/AccountPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// Each role's pages load on demand, so ground crew never download supervisor code and vice versa.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const GroundHome = named(() => import('./pages/ground/GroundHome'), 'GroundHome');
const MyTasksPage = named(() => import('./pages/ground/MyTasksPage'), 'MyTasksPage');
const AlertsPage = named(() => import('./pages/ground/AlertsPage'), 'AlertsPage');
const OverviewPage = named(() => import('./pages/supervisor/OverviewPage'), 'OverviewPage');
const TriagePage = named(() => import('./pages/supervisor/TriagePage'), 'TriagePage');
const TeamPage = named(() => import('./pages/supervisor/TeamPage'), 'TeamPage');

/** "/" is each role's own home. */
function RoleHome() {
  const { user } = useAuth();
  return user?.role === 'supervisor' ? <OverviewPage /> : <GroundHome />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<RoleHome />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:reportId" element={<ReportDetailPage />} />
              <Route path="/account" element={<AccountPage />} />

              <Route element={<RoleRoute allow={['ground_crew']} />}>
                <Route path="/my-tasks" element={<MyTasksPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
              </Route>

              <Route element={<RoleRoute allow={['supervisor']} />}>
                <Route path="/triage" element={<TriagePage />} />
                <Route path="/team" element={<TeamPage />} />
              </Route>
            </Route>
          </Route>

          {/* Works signed in or out: the link comes from an email. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/credits" element={<CreditsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
