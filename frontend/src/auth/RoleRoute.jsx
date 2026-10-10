import { Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';
import { NotAvailablePage } from '../pages/NotAvailablePage';

/** UX-only role guard. The backend enforces access; this just avoids dead ends. */
export function RoleRoute({ allow }) {
  const { user } = useAuth();
  if (!allow.includes(user?.role)) return <NotAvailablePage />;
  return <Outlet />;
}
