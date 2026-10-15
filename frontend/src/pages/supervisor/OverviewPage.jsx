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
import { useOverviewStats, useRecurringEntities, useReportList } from '../../hooks/useData';
import { INSIGHT_DAYS, LOW_CONFIDENCE_THRESHOLD, TREND_SHIFTS } from '../../config';
import { KNOWN_CATEGORIES, categoryMeta } from '../../utils/categories';
import { byDue, formatAge, formatDateTime, formatPercent, isOverdue, needsOwner, shiftAt } from '../../utils/format';
import { leastLoaded, workload } from '../../utils/insights';
import { OverviewTiles } from './OverviewTiles';

const ATTENTION_LIMIT = 6;
const REVIEW_LIMIT = 5;
const REVIEW_FILTERS = { review: true, sort: 'confidence' };

/** Category rows for the bar list: every known category (even at 0), then unclassified if any. */
function categoryRows(categories) {
  const counts = new Map(KNOWN_CATEGORIES.map((name) => [name, 0]));
  let unclassified = 0;
  for (const c of categories) {
    if (c.category_name) counts.set(c.category_name, c.reports);
    else unclassified = c.reports;
  }
  const rows = [...counts].map(([name, value]) => ({ key: name, name, value }));
  if (unclassified) rows.push({ key: 'unclassified', name: null, value: unclassified });
  return rows.sort((a, b) => b.value - a.value);
}

/** Start of the day INSIGHT_DAYS ago, so the key changes once a day. */
function insightSince(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - INSIGHT_DAYS);
  return d.toISOString();
}

export function OverviewPage() {
  const { me, now, tasks, users, usersById, assignTask } = useShell();
  const statsRes = useOverviewStats(TREND_SHIFTS);
  const stats = statsRes.data;
  const reviewRes = useReportList(REVIEW_FILTERS, REVIEW_LIMIT);
  const since = insightSince(now);
  const entitiesRes = useRecurringEntities(since);

  const t = now.getTime();
  const shift = shiftAt(now);
  const allTasks = tasks.data ?? [];
  // Task counts come from the live task list (updated instantly by the real-time push).
  const pending = allTasks.filter((x) => x.status === 'pending');
  const overdue = pending.filter((x) => isOverdue(x, t));
  const unassigned = pending.filter(needsOwner);
  const lowCount = stats?.reports.needs_review ?? 0;
  const shiftCount = stats?.current_shift.reports ?? 0;

  const attention = [...new Set([...overdue, ...unassigned])]
    .sort((a, b) => byDue(a, b, t))
    .slice(0, ATTENTION_LIMIT);

  const team = users?.data ? workload(users.data, allTasks, t) : [];
  const suggestion = users?.data ? leastLoaded(users.data, allTasks) : null;
  const mix = useMemo(() => (stats ? categoryRows(stats.categories) : []), [stats]);
  const trend = useMemo(
    () =>
      (stats?.recent_shifts ?? []).map((s) => ({
        shift: { key: `${s.key}-${s.start}`, name: s.name, start: new Date(s.start) },
        value: s.reports,
        lowConfidence: s.low_confidence,
      })),
    [stats],
  );
  const recurring = entitiesRes.data ?? [];

  const tasksLoading = tasks.data === undefined;
  const reportsLoading = stats === undefined;

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
      value: lowCount,
      critical: lowCount > 0,
      detail: `Below ${formatPercent(LOW_CONFIDENCE_THRESHOLD)} confidence`,
      to: '/reports?confidence=low',
      linkLabel: 'Review',
    },
    { key: 'shift', label: 'Reports this shift', value: shiftCount, detail: `Since ${shift.name.toLowerCase()} shift started`, to: '/reports?date=shift', linkLabel: 'View reports' },
  ];

  return (
    <>
      <PhotoBanner photo={PHOTOS.supervisorHome} title={`${shift.name} shift overview`} sub={<span className="num">{formatDateTime(now)}</span>} />
      <ShiftRail
        now={now}
        perHour={stats?.today.reports_per_hour}
        summary={`Reports per hour today. ${shiftCount} this shift.`}
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
            count={stats ? lowCount : undefined}
            action={
              <Link to="/reports?confidence=low" className="btn btn-ghost">
                All low confidence <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          >
            <p className="section__hint">Lowest confidence first. Anything below {formatPercent(LOW_CONFIDENCE_THRESHOLD)} is marked to check.</p>
            {reviewRes.data === undefined && !reviewRes.error && <StripSkeleton rows={3} />}
            {reviewRes.error && !reviewRes.data && <ErrorState message="Couldn’t load reports." onRetry={reviewRes.reload} />}
            {reviewRes.data && reviewRes.data.total === 0 && (
              <EmptyState icon={CheckCircle} title="Nothing to review">
                Every report is classified with enough confidence.
              </EmptyState>
            )}
            {reviewRes.data?.reports.length > 0 && (
              <StripList>
                {reviewRes.data.reports.map((r) => (
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
            {reportsLoading && !statsRes.error && <span className="skeleton" style={{ height: 160 }} />}
            {statsRes.error && !stats && <ErrorState message="Couldn’t load insights." onRetry={statsRes.reload} />}
            {stats && (
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
                    {stats.reports.total} report{stats.reports.total === 1 ? '' : 's'} in total
                  </p>
                </div>
                <div className="insight">
                  <h3 className="insight__title">Reports per shift</h3>
                  <ShiftTrend data={trend} />
                </div>
                <div className="insight">
                  <h3 className="insight__title">Recurring aircraft and components</h3>
                  {entitiesRes.data === undefined && !entitiesRes.error && <span className="skeleton" style={{ height: 64 }} />}
                  {entitiesRes.data && recurring.length === 0 && (
                    <p className="chart-empty">Nothing mentioned in more than one report in the last {INSIGHT_DAYS} days.</p>
                  )}
                  {recurring.length > 0 && (
                    <ul className="recurring">
                      {recurring.map((e) => (
                        <li key={`${e.entity_type}:${e.entity_text}`}>
                          {e.entity_type === 'AIRCRAFT' ? <Airplane size={16} aria-label="Aircraft" /> : <Gear size={16} aria-label="Component" />}
                          <span className="recurring__text" translate={e.entity_type === 'AIRCRAFT' ? 'no' : undefined}>
                            {e.entity_text}
                          </span>
                          <span className="recurring__count num">
                            {e.report_count} <span className="visually-hidden">reports</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="insight__foot">Mentioned in two or more reports in the last {INSIGHT_DAYS} days.</p>
                </div>
              </div>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
