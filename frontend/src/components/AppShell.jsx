import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Bell, SignOut } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useInterval, useResource } from '../hooks/useResource';
import { roleLabel } from '../utils/format';
import { NotificationsDrawer } from './NotificationsDrawer';
import './shell.css';

const REFRESH_MS = 60_000;

export function AppShell() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const notifications = useResource('notifications', api.listNotifications);
  useInterval(notifications.reload, REFRESH_MS);

  const unreadCount = useMemo(
    () => (notifications.data ?? []).filter((n) => !n.is_read).length,
    [notifications.data],
  );

  const { mutate: mutateNotifications, reload: reloadNotifications } = notifications;
  const markRead = useCallback(
    async (notifIds) => {
      const ids = new Set(notifIds);
      const readAt = new Date().toISOString();
      mutateNotifications((list = []) =>
        list.map((n) => (ids.has(n.notif_id) ? { ...n, is_read: true, read_at: readAt } : n)),
      );
      const results = await Promise.allSettled([...ids].map((id) => api.markNotificationRead(id)));
      if (results.some((r) => r.status === 'rejected')) reloadNotifications();
    },
    [mutateNotifications, reloadNotifications],
  );

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  const outletContext = { notifications, unreadCount, openNotifications: () => setDrawerOpen(true) };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to Main Content
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-brand">
            <span translate="no">Kenya Airways</span>
            <span className="app-brand-product">Shift Handover</span>
          </Link>

          <div className="app-header-actions">
            <button
              type="button"
              className="icon-btn header-icon-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              aria-haspopup="dialog"
            >
              <Bell size={22} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="bell-count num" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <div className="app-user">
              <span className="app-user-name">{user?.full_name}</span>
              <span className="app-user-role">{roleLabel(user?.role)}</span>
            </div>

            <button
              type="button"
              className="btn btn-sm header-logout"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <SignOut size={16} aria-hidden="true" />
              {loggingOut ? 'Logging Out…' : 'Log Out'}
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="shell-main">
        <Outlet context={outletContext} />
      </main>

      <NotificationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications.data}
        loading={notifications.loading && notifications.data === undefined}
        error={notifications.error}
        onRetry={notifications.reload}
        onMarkRead={markRead}
      />
    </div>
  );
}
