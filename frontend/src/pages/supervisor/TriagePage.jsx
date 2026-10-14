import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, CircleDashed, Clock, Lightbulb, Tray, WarningOctagon } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { PageHeader, EmptyState, ErrorState } from '../../components/ui/Layout';
import { StripList, StripSkeleton } from '../../components/ui/Strip';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { byDue, isOverdue, needsOwner } from '../../utils/format';
import { leastLoaded } from '../../utils/insights';
import { ShiftFilter } from '../../components/ui/ShiftFilter';
import { matchesShift, useShiftParam } from '../../hooks/useShiftParam';

const BAYS = [
  { key: 'unassigned', title: 'Unassigned', icon: CircleDashed, empty: 'Every open task has an owner.' },
  { key: 'assigned', title: 'Assigned', icon: Clock, empty: 'Nothing assigned and in progress.' },
  { key: 'overdue', title: 'Overdue', icon: WarningOctagon, empty: 'Nothing past its due time.' },
];

export function TriagePage() {
  const { me, now, tasks, users, usersById, assignTask } = useShell();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'resolved' ? 'resolved' : 'open';
  const sort = ['newest', 'oldest'].includes(params.get('sort')) ? params.get('sort') : 'due';
  const assignee = params.get('assignee') ?? 'all';
  const focusLane = params.get('lane');
  const t = now.getTime();

  function setParam(key, value, fallback) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  // Bring a lane into view when arriving from an overview tile.
  useEffect(() => {
    if (focusLane) document.getElementById(`bay-${focusLane}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusLane]);

  const all = tasks.data ?? [];
  const matchesAssignee = (task) =>
    assignee === 'all' || (assignee === 'unassigned' ? needsOwner(task) : task.assigned_to === assignee);
  const byAge = (a, b) =>
    sort === 'due' ? byDue(a, b, t) : (sort === 'oldest' ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at));
  const [shift, setShift] = useShiftParam();
  const pending = all.filter((x) => x.status === 'pending' && matchesAssignee(x) && matchesShift(x, shift));
  const bays = {
    unassigned: pending.filter((x) => needsOwner(x) && !isOverdue(x, t)).sort(byAge),
    assigned: pending.filter((x) => !needsOwner(x) && !isOverdue(x, t)).sort(byAge),
    overdue: pending.filter((x) => isOverdue(x, t)).sort(byAge),
  };
  const resolved = all
    .filter((x) => x.status === 'resolved' && matchesAssignee(x) && matchesShift(x, shift))
    .sort((a, b) => new Date(b.resolved_at ?? b.updated_at) - new Date(a.resolved_at ?? a.updated_at));
  const suggestion = users?.data ? leastLoaded(users.data, all) : null;
  const loading = tasks.data === undefined && !tasks.error;

  return (
    <>
      <PageHeader
        title="Triage"
        sub={
          tasks.data ? (
            <>
              <span className="num">{all.filter((x) => x.status === 'pending').length}</span> open,{' '}
              <span className="num">{all.filter((x) => x.status === 'resolved').length}</span> resolved
            </>
          ) : (
            'Loading tasks…'
          )
        }
      />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Task view">
          {[
            ['open', 'Open'],
            ['resolved', 'Resolved'],
          ].map(([value, label]) => (
            <button key={value} type="button" className="segmented__btn" aria-pressed={view === value} onClick={() => setParam('view', value, 'open')}>
              {label}
            </button>
          ))}
        </div>
        <ShiftFilter shift={shift} onChange={setShift} />
        <div className="toolbar__filters">
          <label className="inline-field inline-field--row">
            <span>Sort</span>
            <select className="select" value={sort} onChange={(e) => setParam('sort', e.target.value, 'due')} autoComplete="off">
              <option value="due">Due soonest</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
          <label className="inline-field inline-field--row">
            <span>Assignee</span>
            <select className="select" value={assignee} onChange={(e) => setParam('assignee', e.target.value, 'all')} autoComplete="off">
              <option value="all">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {(users?.data ?? []).map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tasks.error && !tasks.data && <ErrorState message="Couldn’t load tasks." onRetry={tasks.reload} />}

      {view === 'open' ? (
        <div className="bays">
          {BAYS.map(({ key, title, icon: Icon, empty }) => (
            <section
              key={key}
              id={`bay-${key}`}
              className={`bay bay--${key} ${focusLane === key ? 'bay--focus' : ''}`}
              aria-labelledby={`bay-${key}-title`}
            >
              <h2 id={`bay-${key}-title`} className="bay__title">
                <Icon size={18} weight={key === 'overdue' ? 'fill' : 'regular'} aria-hidden="true" />
                {title}
                {tasks.data && <span className="count">{bays[key].length}</span>}
              </h2>
              {suggestion && key !== 'assigned' && bays[key].length > 0 && (
                <p className="bay__note">
                  <Lightbulb size={14} aria-hidden="true" />
                  Suggested owner: {suggestion.user.full_name}, <span className="num">{suggestion.open}</span> open
                </p>
              )}
              {loading && <StripSkeleton rows={2} />}
              {tasks.data && bays[key].length === 0 && <p className="bay__empty">{empty}</p>}
              {bays[key].length > 0 && (
                <StripList className="strip-list--bay">
                  {bays[key].map((task) => (
                    <TaskStrip
                      key={task.task_id}
                      task={task}
                      now={now}
                      currentUserId={me.user_id}
                      usersById={usersById}
                      assign={{ users, suggestion, onAssign: assignTask, showSuggestion: false }}
                      compact
                    />
                  ))}
                </StripList>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="narrow">
          {loading && <StripSkeleton rows={4} />}
          {tasks.data && resolved.length === 0 && (
            <EmptyState icon={Tray} title="No resolved tasks">
              Resolved tasks appear here with who closed them and when.
            </EmptyState>
          )}
          {resolved.length > 0 && (
            <StripList label="Resolved tasks">
              {resolved.map((task) => (
                <TaskStrip key={task.task_id} task={task} now={now} currentUserId={me.user_id} usersById={usersById} />
              ))}
            </StripList>
          )}
          {resolved.length > 0 && (
            <p className="field-hint list-foot">
              <CheckCircle size={14} aria-hidden="true" /> <span className="num">{resolved.length}</span> resolved
            </p>
          )}
        </div>
      )}
    </>
  );
}
