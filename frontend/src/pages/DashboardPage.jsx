import { useCallback, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useInterval, useResource } from '../hooks/useResource';
import { REPORTS_PAGE_SIZE, STATS_WINDOW } from '../config';
import { currentShift, firstName, formatLongDate, isOverdue, needsReview } from '../utils/format';
import { StatusTiles } from '../components/StatusTiles';
import { ReportsList } from '../components/ReportsList';
import { TasksPanel } from '../components/TasksPanel';
import { HandoverForm } from '../components/HandoverForm';
import './dashboard.css';

const REFRESH_MS = 60_000;

export function DashboardPage() {
  const { user } = useAuth();
  const { notifications, unreadCount, openNotifications } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const [now, setNow] = useState(() => new Date());
  const shift = useMemo(() => currentShift(now), [now]);

  const reports = useResource(`reports:${page}`, () =>
    api.listReports({ limit: REPORTS_PAGE_SIZE, offset: (page - 1) * REPORTS_PAGE_SIZE }),
  );
  const recent = useResource('recent', () => api.listReports({ limit: STATS_WINDOW, offset: 0 }));
  const tasks = useResource('tasks:pending', () => api.listTasks('pending'));

  const { reload: reloadReports } = reports;
  const { reload: reloadRecent } = recent;
  const { reload: reloadTasks, mutate: mutateTasks } = tasks;
  const { reload: reloadNotifications } = notifications;

  const refreshAll = useCallback(() => {
    reloadReports();
    reloadRecent();
    reloadTasks();
    reloadNotifications();
  }, [reloadReports, reloadRecent, reloadTasks, reloadNotifications]);

  useInterval(() => {
    setNow(new Date());
    refreshAll();
  }, REFRESH_MS);

  const stats = useMemo(() => {
    const recentReports = recent.data?.reports ?? [];
    const pending = tasks.data ?? [];
    const checkedAt = now.getTime();
    return {
      reportsThisShift: recentReports.filter((r) => new Date(r.generated_at) >= shift.start).length,
      // If every report in the window is from this shift there may be more we didn't fetch.
      windowFull:
        recentReports.length === STATS_WINDOW &&
        recentReports.every((r) => new Date(r.generated_at) >= shift.start),
      needsReview: recentReports.filter(needsReview).length,
      openTasks: pending.length,
      overdueTasks: pending.filter((t) => isOverdue(t, checkedAt)).length,
      unread: unreadCount,
    };
  }, [recent.data, tasks.data, unreadCount, shift.start, now]);

  async function resolveTask(taskId) {
    await api.resolveTask(taskId);
    mutateTasks((list = []) => list.filter((t) => t.task_id !== taskId));
  }

  function changePage(next) {
    setSearchParams(next > 1 ? { page: String(next) } : {});
    document.getElementById('reports-title')?.scrollIntoView({ block: 'start' });
  }

  return (
    <>
      <div className="page-band">
        <div className="page-container page-band-inner">
          <h1 className="page-title">Shift Handover Board</h1>
          <p className="page-subtitle">
            {shift.name} shift, {formatLongDate(now)}. Welcome back, {firstName(user?.full_name)}.
          </p>
        </div>
      </div>

      <div className="page-container dashboard">
        <StatusTiles
          shiftName={shift.name}
          stats={stats}
          loading={{
            reports: recent.data === undefined,
            tasks: tasks.data === undefined,
            notifications: notifications.data === undefined,
          }}
          onOpenNotifications={openNotifications}
        />

        <div className="dashboard-grid">
          <div className="dashboard-primary">
            <ReportsList
              data={reports.data}
              loading={reports.loading}
              error={reports.error}
              page={page}
              pageSize={REPORTS_PAGE_SIZE}
              onPageChange={changePage}
              onRefresh={refreshAll}
            />
          </div>

          <div className="dashboard-secondary">
            <HandoverForm defaultShift={shift.name} onSubmitted={refreshAll} />
            <TasksPanel
              tasks={tasks.data}
              loading={tasks.loading}
              error={tasks.error}
              now={now}
              currentUserId={user?.user_id}
              onResolve={resolveTask}
              onRetry={reloadTasks}
            />
          </div>
        </div>
      </div>
    </>
  );
}
