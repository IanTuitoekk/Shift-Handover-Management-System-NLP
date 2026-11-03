import { useMemo } from 'react';
import { CheckCircle, PaperPlaneTilt, Tray } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { PageHeader, Section, EmptyState, ErrorState } from '../../components/ui/Layout';
import { Strip, StripList, StripSkeleton } from '../../components/ui/Strip';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { useMyReports } from '../../hooks/useData';
import { ShiftFilter } from '../../components/ui/ShiftFilter';
import { matchesShift, shiftCounts, useShiftParam } from '../../hooks/useShiftParam';
import { categoryMeta } from '../../utils/categories';
import { inShift, byDue, previousShift, shiftAt, shiftLabel, taskSummary } from '../../utils/format';
import { myShiftEvents } from './events';

export function MyTasksPage() {
  const { me, now, tasks, markTaskDone, applyTaskUpdate } = useShell();
  const myReports = useMyReports();
  const t = now.getTime();

  const [shiftFilter, setShiftFilter] = useShiftParam();
  const allPending = useMemo(() => (tasks.data ?? []).filter((x) => x.status === 'pending'), [tasks.data]);
  const pending = allPending.filter((x) => matchesShift(x, shiftFilter));
  const byUrgency = (a, b) => byDue(a, b, t);
  // Tasks still to do first; ones marked done (waiting for sign-off) after them.
  const mine = pending.filter((x) => x.assigned_to === me.user_id).sort((a, b) => Number(Boolean(a.done_at)) - Number(Boolean(b.done_at)) || byUrgency(a, b));
  const others = pending
    .filter((x) => x.assigned_to !== me.user_id)
    // Unassigned first: they still need an owner.
    .sort((a, b) => Number(Boolean(a.assigned_to)) - Number(Boolean(b.assigned_to)) || byUrgency(a, b));

  const shift = shiftAt(now);
  const prev = previousShift(now);
  const events = myShiftEvents({ myReports: myReports.data?.reports, tasks: tasks.data ?? [], me });
  const timeline = [
    { shift, items: events.filter((e) => inShift(e.at, shift)) },
    { shift: prev, items: events.filter((e) => inShift(e.at, prev)) },
  ];
  const loading = tasks.data === undefined && !tasks.error;

  // Crew mark their own tasks done; a supervisor signs them off. Other people's tasks are read-only.
  const strip = (task) => (
    <TaskStrip
      key={task.task_id}
      task={task}
      now={now}
      currentUserId={me.user_id}
      onMarkDone={task.assigned_to === me.user_id ? markTaskDone : undefined}
      onUpdated={applyTaskUpdate}
    />
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
      <ShiftFilter shift={shiftFilter} onChange={setShiftFilter} counts={tasks.data ? shiftCounts(allPending) : undefined} />
      <div className="split split--wide-left">
        <div className="stack">
          {tasks.error && !tasks.data && <ErrorState message="Couldn’t load tasks." onRetry={tasks.reload} />}
          <Section id="mine" title="Assigned to you" count={tasks.data ? mine.length : undefined}>
            {loading && <StripSkeleton rows={3} />}
            {mine.length > 0 && <p className="field-hint">When you’ve finished a task, mark it done. A supervisor then signs it off, or sends it back if more is needed.</p>}
            {tasks.data && mine.length === 0 && (
              <EmptyState icon={CheckCircle} title="Nothing assigned to you">
                Tasks from the outgoing shift’s handovers are shared out automatically to the incoming shift, and your supervisor can assign you more. They appear here first.
              </EmptyState>
            )}
            {mine.length > 0 && <StripList>{mine.map(strip)}</StripList>}
          </Section>

          <Section id="others" title="Other open tasks" count={tasks.data ? others.length : undefined}>
            {others.length > 0 && <p className="field-hint">For awareness. A supervisor marks each task resolved.</p>}
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
                            <span className="badge badge--ok">Resolved</span>
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
