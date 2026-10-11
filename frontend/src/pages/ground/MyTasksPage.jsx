import { useMemo } from 'react';
import { CheckCircle, PaperPlaneTilt, Tray } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { PageHeader, Section, EmptyState, ErrorState } from '../../components/ui/Layout';
import { Strip, StripList, StripSkeleton } from '../../components/ui/Strip';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { useMyReports } from '../../hooks/useData';
import { categoryMeta } from '../../utils/categories';
import { inShift, byDue, previousShift, shiftAt, shiftLabel, taskSummary } from '../../utils/format';
import { myShiftEvents } from './events';

export function MyTasksPage() {
  const { me, now, tasks, resolveTask, applyTaskUpdate } = useShell();
  const myReports = useMyReports();
  const t = now.getTime();

  const pending = useMemo(() => (tasks.data ?? []).filter((x) => x.status === 'pending'), [tasks.data]);
  const byUrgency = (a, b) => byDue(a, b, t);
  const mine = pending.filter((x) => x.assigned_to === me.user_id).sort(byUrgency);
  const others = pending
    .filter((x) => x.assigned_to !== me.user_id)
    // Unassigned first: anyone can pick those up.
    .sort((a, b) => Number(Boolean(a.assigned_to)) - Number(Boolean(b.assigned_to)) || byUrgency(a, b));

  const shift = shiftAt(now);
  const prev = previousShift(now);
  const events = myShiftEvents({ myReports: myReports.data?.reports, tasks: tasks.data ?? [], me });
  const timeline = [
    { shift, items: events.filter((e) => inShift(e.at, shift)) },
    { shift: prev, items: events.filter((e) => inShift(e.at, prev)) },
  ];
  const loading = tasks.data === undefined && !tasks.error;

  const strip = (task) => (
    <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} onResolve={resolveTask} onResolved={applyTaskUpdate} />
  );

  return (
    <>
      <PageHeader
        title="My tasks"
        sub={
          tasks.data ? (
            <>
              <span className="num">{mine.length}</span> assigned to you, <span className="num">{others.length}</span> other open
            </>
          ) : (
            'Loading tasks…'
          )
        }
      />
      <div className="split split--wide-left">
        <div className="stack">
          {tasks.error && !tasks.data && <ErrorState message="Couldn’t load tasks." onRetry={tasks.reload} />}
          <Section id="mine" title="Assigned to you" count={tasks.data ? mine.length : undefined}>
            {loading && <StripSkeleton rows={3} />}
            {tasks.data && mine.length === 0 && (
              <EmptyState icon={CheckCircle} title="Nothing assigned to you">
                When your supervisor assigns you a task it appears here first. You can also pick up an open task below.
              </EmptyState>
            )}
            {mine.length > 0 && <StripList>{mine.map(strip)}</StripList>}
          </Section>

          <Section id="others" title="Other open tasks" count={tasks.data ? others.length : undefined}>
            {loading && <StripSkeleton rows={3} />}
            {tasks.data && others.length === 0 && (
              <EmptyState icon={Tray} title="No other open tasks">
                The board is clear. New tasks are raised automatically from each handover.
              </EmptyState>
            )}
            {others.length > 0 && <StripList>{others.map(strip)}</StripList>}
          </Section>
        </div>

        <aside className="stack">
          <Section id="timeline" title="My shift" variant="raised">
            {timeline.map(({ shift: s, items }) => (
              <div key={s.key} className="timeline">
                <h3 className="timeline__label">{shiftLabel(s)}</h3>
                {items.length === 0 ? (
                  <p className="timeline__empty">Nothing recorded.</p>
                ) : (
                  <StripList>
                    {items.map((e, i) => (
                      <Strip
                        key={`${e.kind}-${e.at}-${i}`}
                        tone={e.kind === 'resolved' ? 'ok' : 'accent'}
                        icon={e.kind === 'resolved' ? CheckCircle : PaperPlaneTilt}
                        iconLabel={e.kind === 'resolved' ? 'Resolved' : 'Submitted'}
                        time={e.at}
                        to={`/reports/${e.reportId}`}
                        title={e.kind === 'resolved' ? taskSummary(e.task) : `Handover submitted`}
                        meta={
                          e.kind === 'submitted' ? (
                            <span className="badge">{categoryMeta(e.label === 'Handover' ? null : e.label).label}</span>
                          ) : (
                            <span className="badge badge--ok">Resolved by you</span>
                          )
                        }
                      />
                    ))}
                  </StripList>
                )}
              </div>
            ))}
          </Section>
        </aside>
      </div>
    </>
  );
}
