import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Airplane, ArrowRight, CheckCircle, Gear } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { Section, EmptyState, ErrorState } from '../../components/ui/Layout';
import { PhotoBanner } from '../../components/ui/PhotoBanner';
import { PHOTOS } from '../../assets/photos';
import { StripList, StripSkeleton } from '../../components/ui/Strip';
import { ShiftRail } from '../../components/ui/ShiftRail';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { ReportStrip } from '../../components/report/ReportStrip';
import { BarList } from '../../components/charts/BarList';
import { ShiftTrend } from '../../components/charts/ShiftTrend';
import { useAllReports, useRecentReportDetails } from '../../hooks/useData';
import { INSIGHT_DETAIL_WINDOW, LOW_CONFIDENCE_THRESHOLD, TREND_SHIFTS } from '../../config';
import { categoryMeta } from '../../utils/categories';
import { byDue, formatAge, formatDateTime, formatPercent, inShift, isOverdue, needsOwner, needsReview, operationalDay, shiftAt } from '../../utils/format';
import { categoryMix, leastLoaded, recurringEntities, reportsPerHour, reportsPerShift, reviewOrder, workload } from '../../utils/insights';
import { OverviewTiles } from './OverviewTiles';

const ATTENTION_LIMIT = 6;
const REVIEW_LIMIT = 5;

export function OverviewPage() {
  const { me, now, tasks, users, usersById, assignTask } = useShell();
  const reportsRes = useAllReports();
  const reports = useMemo(() => reportsRes.data?.reports ?? [], [reportsRes.data]);
  const details = useRecentReportDetails(reportsRes.data ? reports : null);

  const t = now.getTime();
  const shift = shiftAt(now);
  const day = operationalDay(now);
  const allTasks = tasks.data ?? [];
  const pending = allTasks.filter((x) => x.status === 'pending');
  const overdue = pending.filter((x) => isOverdue(x, t));
  const unassigned = pending.filter(needsOwner);
  const lowReports = reports.filter(needsReview);
  const thisShift = reports.filter((r) => inShift(r.generated_at, shift));

  const attention = [...new Set([...overdue, ...unassigned])]
    .sort((a, b) => byDue(a, b, t))
    .slice(0, ATTENTION_LIMIT);

  const team = users?.data ? workload(users.data, allTasks, t) : [];
  const suggestion = users?.data ? leastLoaded(users.data, allTasks) : null;
  const mix = categoryMix(reports);
  const trend = reportsPerShift(reports, TREND_SHIFTS, now);
  const recurring = details.data ? recurringEntities(details.data) : [];

  const tasksLoading = tasks.data === undefined;
  const reportsLoading = reportsRes.data === undefined;

  const tiles = [
    { key: 'open', label: 'Open', value: pending.length, detail: 'Tasks not yet resolved', to: '/triage', linkLabel: 'Open triage' },
    {
      key: 'overdue',
      label: 'Overdue',
      value: overdue.length,
      critical: overdue.length > 0,
      detail: overdue.length
        ? `Most overdue by ${formatAge(overdue.reduce((a, b) => (a.due_at < b.due_at ? a : b)).due_at, t)}`
        : 'Nothing past its due time',
      to: '/triage?lane=overdue',
      linkLabel: 'View overdue',
    },
    { key: 'unassigned', label: 'Unassigned', value: unassigned.length, detail: 'Waiting for an owner', to: '/triage?lane=unassigned', linkLabel: 'Assign' },
    {
      key: 'review',
      label: 'Needs review',
      value: lowReports.length,
      critical: lowReports.length > 0,
      detail: `Below ${formatPercent(LOW_CONFIDENCE_THRESHOLD)} confidence`,
      to: '/reports?confidence=low',
      linkLabel: 'Review',
    },
    { key: 'shift', label: 'Reports this shift', value: thisShift.length, detail: `Since ${shift.name.toLowerCase()} shift started`, to: '/reports?date=shift', linkLabel: 'View reports' },
  ];

  return (
    <>
      <PhotoBanner photo={PHOTOS.supervisorHome} title={`${shift.name} shift overview`} sub={<span className="num">{formatDateTime(now)}</span>} />
      <ShiftRail
        now={now}
        perHour={reportsLoading ? undefined : reportsPerHour(reports, day.start, day.end)}
        summary={`Reports per hour today. ${thisShift.length} this shift.`}
      />

      <OverviewTiles tiles={tiles} loading={tasksLoading || reportsLoading} />

      <div className="split">
        <div className="stack">
          <Section
            id="attention"
            title="Needs attention"
            count={tasks.data ? attention.length : undefined}
            action={
              <Link to="/triage" className="btn btn-ghost">
                Open triage <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          >
            {tasksLoading && !tasks.error && <StripSkeleton rows={3} />}
            {tasks.error && !tasks.data && <ErrorState message="Couldn’t load tasks." onRetry={tasks.reload} />}
            {tasks.data && attention.length === 0 && (
              <EmptyState icon={CheckCircle} title="Nothing overdue or unassigned">
                Every open task has an owner and is within its due time.
              </EmptyState>
            )}
            {attention.length > 0 && (
              <StripList>
                {attention.map((task) => (
                  <TaskStrip
                    key={task.task_id}
                    task={task}
                    now={now}
                    currentUserId={me.user_id}
                    usersById={usersById}
                    assign={{ users, suggestion, onAssign: assignTask }}
                  />
                ))}
              </StripList>
            )}
          </Section>

          <Section
            id="review"
            title="Review queue"
            count={reportsRes.data ? lowReports.length : undefined}
            action={
              <Link to="/reports?confidence=low" className="btn btn-ghost">
                All low confidence <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          >
            <p className="section__hint">Lowest confidence first. Anything below {formatPercent(LOW_CONFIDENCE_THRESHOLD)} is marked to check.</p>
            {reportsLoading && !reportsRes.error && <StripSkeleton rows={3} />}
            {reportsRes.error && !reportsRes.data && <ErrorState message="Couldn’t load reports." onRetry={reportsRes.reload} />}
            {reportsRes.data && reports.length === 0 && <EmptyState title="No reports yet">Reports appear here as crews submit handovers.</EmptyState>}
            {reports.length > 0 && (
              <StripList>
                {reviewOrder(reports)
                  .slice(0, REVIEW_LIMIT)
                  .map((r) => (
                    <ReportStrip key={r.report_id} report={r} now={now} currentUserId={me.user_id} />
                  ))}
              </StripList>
            )}
          </Section>
        </div>

        <aside className="stack">
          <Section
            id="workload"
            title="Team workload"
            variant="raised"
            action={
              <Link to="/team" className="btn btn-ghost">
                Team <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          >
            {users?.data === undefined && !users?.error && <span className="skeleton" style={{ height: 96 }} />}
            {users?.error && !users.data && <ErrorState message="Couldn’t load the team." onRetry={users.reload} />}
            {team.length > 0 && (
              <BarList
                label="Open tasks per person"
                unit=" open tasks"
                rows={team.map((r) => ({
                  key: r.user.user_id,
                  title: r.user.full_name,
                  label: r.user.full_name,
                  value: r.open,
                  note:
                    suggestion?.user.user_id === r.user.user_id ? (
                      <span className="badge badge--accent">Suggested</span>
                    ) : r.overdue ? (
                      <span className="badge badge--critical">{r.overdue} overdue</span>
                    ) : null,
                }))}
              />
            )}
          </Section>

          <Section id="insights" title="Insights" variant="raised">
            {reportsLoading && <span className="skeleton" style={{ height: 160 }} />}
            {reportsRes.data && (
              <div className="insights">
                <div className="insight">
                  <h3 className="insight__title">Category mix</h3>
                  <BarList
                    label="Reports by category"
                    unit=" reports"
                    rows={mix.map((m) => {
                      const meta = categoryMeta(m.name);
                      const Icon = meta.icon;
                      return {
                        key: m.key,
                        title: meta.label,
                        label: (
                          <>
                            <Icon size={14} aria-hidden="true" /> {meta.short}
                          </>
                        ),
                        value: m.value,
                      };
                    })}
                  />
                  <p className="insight__foot num">
                    {reports.length} report{reports.length === 1 ? '' : 's'}
                    {reportsRes.data.capped ? ` (latest ${reports.length} of ${reportsRes.data.total})` : ''}
                  </p>
                </div>
                <div className="insight">
                  <h3 className="insight__title">Reports per shift</h3>
                  <ShiftTrend data={trend} />
                </div>
                <div className="insight">
                  <h3 className="insight__title">Recurring aircraft and components</h3>
                  {details.data === undefined && !details.error && <span className="skeleton" style={{ height: 64 }} />}
                  {details.data && recurring.length === 0 && (
                    <p className="chart-empty">Nothing mentioned in more than one of the latest {INSIGHT_DETAIL_WINDOW} reports.</p>
                  )}
                  {recurring.length > 0 && (
                    <ul className="recurring">
                      {recurring.map((e) => (
                        <li key={e.key}>
                          {e.type === 'AIRCRAFT' ? <Airplane size={16} aria-label="Aircraft" /> : <Gear size={16} aria-label="Component" />}
                          <span className="recurring__text" translate={e.type === 'AIRCRAFT' ? 'no' : undefined}>
                            {e.text}
                          </span>
                          <span className="recurring__count num">
                            {e.reports} <span className="visually-hidden">reports</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="insight__foot">From the latest {Math.min(INSIGHT_DETAIL_WINDOW, reports.length)} reports.</p>
                </div>
              </div>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
