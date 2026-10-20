import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="boot-screen" role="status">
        Checking your session…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/** Login/register pages. Once signed in, send the user back where they were heading. */
export function GuestRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'authenticated') {
    const from = location.state?.from;
    const target = from ? `${from.pathname}${from.search ?? ''}` : '/';
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
