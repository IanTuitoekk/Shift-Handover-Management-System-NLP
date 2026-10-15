import { Suspense, useCallback, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CheckCircle, ClipboardText, Moon, NotePencil, Plus, SignOut, Sun, UserCircle, UserCirclePlus } from '@phosphor-icons/react';
import { api, tokenStore } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { LIVE_REFRESH_MS, REFRESH_MS, setShiftHours } from '../../config';
import { useNow } from '../../hooks/useData';
import { useInterval, useRefetchOnFocus, useResource } from '../../hooks/useResource';
import { useTheme } from '../../hooks/useTheme';
import { REPORTS_CHANGED, USERS_CHANGED, useRealtime } from '../../hooks/useRealtime';
import { roleConfig } from '../../roles';
import { isOverdue, needsOwner, taskSummary } from '../../utils/format';
import { categoryMeta } from '../../utils/categories';
import { NotificationsDrawer } from '../NotificationsDrawer';
import { Composer } from '../composer/Composer';
import { Dialog } from '../ui/Dialog';
import { Toasts } from '../ui/Toasts';
import { StripSkeleton } from '../ui/Strip';
import { ShellContext } from './ShellContext';
import './shell.css';

export function AppShell() {
  const { user, logout, refreshUser, signOut } = useAuth();
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
  // Shift times come from the server so every screen agrees with the backend's counts. Until they
  // arrive (or if the request fails) the defaults in config.js apply; the shell re-renders once set.
  const shiftConfig = useResource('config:shifts', api.shiftConfig);
  if (shiftConfig.data) setShiftHours(shiftConfig.data);

  const { reload: reloadTasks, mutate: mutateTasks } = tasks;
  const { reload: reloadNotifications, mutate: mutateNotifications } = notifications;
  const refreshAll = useCallback(() => {
    reloadTasks();
    reloadNotifications();
  }, [reloadTasks, reloadNotifications]);
  useRefetchOnFocus(refreshAll);

  // Real-time push. Our own actions are already applied locally, so their echoes are skipped.
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((toast) => setToasts((list) => [...list.slice(-3), { id: crypto.randomUUID(), ...toast }]), []);
  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const me = user?.user_id;
  const upsertTask = useCallback(
    (task) =>
      mutateTasks((list = []) =>
        list.some((t) => t.task_id === task.task_id) ? list.map((t) => (t.task_id === task.task_id ? { ...t, ...task } : t)) : [task, ...list],
      ),
    [mutateTasks],
  );
  const live = useRealtime(tokenStore.get(), {
    'handover:created': ({ report, task, notification, submittedBy }) => {
      if (task) {
        const context = report && { category_name: report.category_name, summary: report.summary, category_confidence: report.category_confidence };
        upsertTask({ shift: report?.shift, report: context, ...task });
      }
      if (notification) {
        mutateNotifications((list = []) =>
          list.some((n) => n.notif_id === notification.notif_id) ? list : [notification, ...list],
        );
      }
      window.dispatchEvent(new CustomEvent(REPORTS_CHANGED));
      if (submittedBy !== me) {
        pushToast({
          icon: ClipboardText,
          title: `New handover: ${categoryMeta(report?.category_name).short}`,
          text: report?.summary,
          to: `/reports/${report?.report_id}`,
          linkLabel: 'Open report',
        });
      }
    },
    'task:assigned': ({ task, by, previousAssignee }) => {
      if (by === me) return;
      upsertTask(task);
      if (task.assigned_to === me) {
        pushToast({ icon: UserCirclePlus, title: 'A task was assigned to you', text: taskSummary(task), to: `/reports/${task.report_id}`, linkLabel: 'Open report' });
      } else if (previousAssignee === me) {
        pushToast({
          icon: UserCirclePlus,
          tone: 'neutral',
          title: task.assigned_to ? 'A task was reassigned to someone else' : 'A task was taken off your list',
          text: taskSummary(task),
        });
      }
    },
    'task:updated': ({ task, by }) => {
      if (by === me) return;
      upsertTask(task);
    },
    'task:resolved': ({ task, by }) => {
      if (by === me) return;
      upsertTask(task);
      if (task.assigned_to === me) {
        pushToast({ icon: CheckCircle, tone: 'ok', title: 'A colleague resolved one of your tasks', text: taskSummary(task) });
      }
    },
    // A supervisor changed this user's role: reload the profile so the shell switches view.
    'user:role-changed': async ({ role }) => {
      await refreshUser();
      pushToast({
        icon: UserCirclePlus,
        title: `Your role is now ${roleConfig(role).label.toLowerCase()}`,
        text: 'Your menu and home page have been updated.',
        to: '/',
        linkLabel: 'Go to home',
      });
    },
    // Names on tasks can change too (edited, deactivated, deleted).
    'users:changed': () => {
      users.reload();
      tasks.reload();
      window.dispatchEvent(new CustomEvent(USERS_CHANGED));
    },
    // An assignee was deactivated or deleted: their open tasks now need a new owner.
    'tasks:reassignment-needed': () => tasks.reload(),
    // This person reset their password elsewhere, or a supervisor deactivated or removed them.
    'session:ended': ({ reason } = {}) => signOut(reason),
    reconnected: refreshAll,
  });
  // With a live connection, polling is only a safety net; without one it keeps screens fresh.
  useInterval(refreshAll, live ? REFRESH_MS : LIVE_REFRESH_MS);

  const markRead = useCallback(
    async (ids) => {
      const set = new Set(ids);
      const readAt = new Date().toISOString();
      mutateNotifications((list = []) => list.map((n) => (set.has(n.notif_id) ? { ...n, is_read: true, read_at: readAt } : n)));
      try {
        // One request per 500 (the API's limit per call).
        const ids = [...set];
        for (let i = 0; i < ids.length; i += 500) await api.markNotificationsRead(ids.slice(i, i + 500));
      } catch {
        reloadNotifications();
      }
    },
    [mutateNotifications, reloadNotifications],
  );

  // Task actions shared by every page. Strips call resolveTask, animate out, then applyTaskUpdate.
  const resolveTask = useCallback((task) => api.resolveTask(task.task_id), []);
  const applyTaskUpdate = useCallback(
    (task, updated) => {
      mutateTasks((list = []) => list.map((t) => (t.task_id === task.task_id ? { ...t, ...(updated ?? {}) } : t)));
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
    needsAction: pending.filter((t) => needsOwner(t) || isOverdue(t, now.getTime())).length,
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
              {!supervisor && (
                <Link to="/" state={{ compose: true }} className="btn btn-primary header__new">
                  <NotePencil size={16} weight="bold" aria-hidden="true" />
                  <span>Write handover</span>
                </Link>
              )}
              {supervisor && (
                <button type="button" className="btn btn-secondary header__new" onClick={() => setComposerOpen(true)}>
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  <span>New handover</span>
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
              <span
                className={`live ${live ? 'live--on' : ''}`}
                title={live ? 'Live updates on' : 'Live updates paused, refreshing every 15 seconds'}
              >
                <span className="live__dot" aria-hidden="true" />
                <span className="visually-hidden">{live ? 'Live updates on' : 'Live updates paused'}</span>
              </span>
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
                <Link to="/account" className="who__name" title="Your account">
                  {user?.full_name}
                </Link>
                <span className="badge badge--role">{config.label}</span>
              </div>
              <Link to="/account" className="icon-btn who__account" aria-label="Your account" title="Your account">
                <UserCircle size={20} aria-hidden="true" />
              </Link>
              <button type="button" className="icon-btn header__logout" onClick={handleLogout} disabled={loggingOut} aria-label="Log out" title="Log out">
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

        <Toasts toasts={toasts} onDismiss={dismissToast} />

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
