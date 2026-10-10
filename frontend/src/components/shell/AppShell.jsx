import { Suspense, useCallback, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, Moon, Plus, SignOut, Sun } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { REFRESH_MS } from '../../config';
import { useNow } from '../../hooks/useData';
import { useInterval, useResource } from '../../hooks/useResource';
import { useTheme } from '../../hooks/useTheme';
import { roleConfig } from '../../roles';
import { isOverdue } from '../../utils/format';
import { NotificationsDrawer } from '../NotificationsDrawer';
import { Composer } from '../composer/Composer';
import { Dialog } from '../ui/Dialog';
import { StripSkeleton } from '../ui/Strip';
import { ShellContext } from './ShellContext';
import './shell.css';

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const now = useNow();
  const role = user?.role === 'supervisor' ? 'supervisor' : 'ground_crew';
  const config = roleConfig(role);
  const supervisor = role === 'supervisor';

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const tasks = useResource('tasks:all', () => api.listTasks());
  const notifications = useResource('notifications', api.listNotifications);
  // GET /api/users is supervisor-only; ground crew never request it.
  const users = useResource(supervisor ? 'users' : null, api.listUsers);

  const { reload: reloadTasks, mutate: mutateTasks } = tasks;
  const { reload: reloadNotifications, mutate: mutateNotifications } = notifications;
  const refreshAll = useCallback(() => {
    reloadTasks();
    reloadNotifications();
  }, [reloadTasks, reloadNotifications]);
  useInterval(refreshAll, REFRESH_MS);

  const markRead = useCallback(
    async (ids) => {
      const set = new Set(ids);
      const readAt = new Date().toISOString();
      mutateNotifications((list = []) => list.map((n) => (set.has(n.notif_id) ? { ...n, is_read: true, read_at: readAt } : n)));
      const results = await Promise.allSettled([...set].map((id) => api.markNotificationRead(id)));
      if (results.some((r) => r.status === 'rejected')) reloadNotifications();
    },
    [mutateNotifications, reloadNotifications],
  );

  // Task actions shared by every page. Strips call resolveTask, animate out, then applyTaskUpdate.
  const resolveTask = useCallback((task) => api.resolveTask(task.task_id), []);
  const applyTaskUpdate = useCallback(
    (task, updated) => {
      mutateTasks((list = []) => list.map((t) => (t.task_id === task.task_id ? { ...t, ...(updated ?? {}), status: updated?.status ?? 'resolved' } : t)));
    },
    [mutateTasks],
  );
  const assignTask = useCallback(
    async (taskId, userId) => {
      const updated = await api.assignTask(taskId, userId);
      mutateTasks((list = []) => list.map((t) => (t.task_id === taskId ? { ...t, ...updated } : t)));
      reloadTasks();
      return updated;
    },
    [mutateTasks, reloadTasks],
  );

  const usersById = useMemo(() => new Map((users.data ?? []).map((u) => [u.user_id, u])), [users.data]);
  const unread = (notifications.data ?? []).filter((n) => !n.is_read).length;
  const pending = (tasks.data ?? []).filter((t) => t.status === 'pending');
  const badges = {
    unread,
    myTasks: pending.filter((t) => t.assigned_to === user?.user_id).length,
    needsAction: pending.filter((t) => !t.assigned_to || isOverdue(t, now.getTime())).length,
  };

  const ctx = {
    me: user,
    role,
    supervisor,
    now,
    tasks,
    mutateTasks,
    notifications,
    users: supervisor ? users : null,
    usersById,
    markRead,
    resolveTask,
    applyTaskUpdate,
    assignTask,
    refreshAll,
    openAlerts: () => setDrawerOpen(true),
    openComposer: () => setComposerOpen(true),
  };

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <ShellContext.Provider value={ctx}>
      <div className={`shell ${config.shellClass}`}>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <header className="header">
          <div className="header__inner">
            <Link to="/" className="brand">
              <span translate="no">Kenya Airways</span>
              <span className="brand__product">Shift Handover</span>
            </Link>

            <nav className="nav" aria-label="Main">
              {config.nav.map(({ to, label, icon: Icon, end, badge }) => {
                const count = badge ? badges[badge] : 0;
                return (
                  <NavLink key={to} to={to} end={end} className="nav__item">
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {count > 0 && (
                      <span className="count" aria-label={`${count} ${badge === 'unread' ? 'unread' : 'open'}`}>
                        {count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            <div className="header__actions">
              {supervisor && (
                <button type="button" className="btn btn-secondary header__new" onClick={() => setComposerOpen(true)}>
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  New handover
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={toggle}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              >
                {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="icon-btn bell"
                onClick={() => setDrawerOpen(true)}
                aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
                aria-haspopup="dialog"
              >
                <Bell size={20} aria-hidden="true" />
                {unread > 0 && (
                  <span className="bell__count num" aria-hidden="true">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
              <div className="who">
                <span className="who__name">{user?.full_name}</span>
                <span className="badge badge--role">{config.label}</span>
              </div>
              <button type="button" className="icon-btn" onClick={handleLogout} disabled={loggingOut} aria-label="Log out" title="Log out">
                <SignOut size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="main">
          <div className="page" key={location.pathname}>
            <Suspense
              fallback={
                <div role="status" aria-label="Loading page…">
                  <StripSkeleton rows={4} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>

        <footer className="shell-foot">
          <Link to="/credits">Photo credits</Link>
        </footer>

        <NotificationsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          notifications={notifications.data}
          loading={notifications.loading && notifications.data === undefined}
          error={notifications.error}
          onRetry={reloadNotifications}
          onMarkRead={markRead}
          now={now}
        />

        {supervisor && (
          <Dialog open={composerOpen} onClose={() => setComposerOpen(false)} title="New handover" titleId="dialog-composer-title" wide>
            <Composer userId={user?.user_id} variant="dialog" titleId="dialog-composer" onSubmitted={refreshAll} />
          </Dialog>
        )}
      </div>
    </ShellContext.Provider>
  );
}
