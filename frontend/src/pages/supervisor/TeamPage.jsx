import { Link } from 'react-router-dom';
import { ArrowRight, UsersThree } from '@phosphor-icons/react';
import { useShell } from '../../components/shell/ShellContext';
import { PageHeader, Section, EmptyState, ErrorState } from '../../components/ui/Layout';
import { StripList } from '../../components/ui/Strip';
import { TaskStrip } from '../../components/tasks/TaskStrip';
import { BarList } from '../../components/charts/BarList';
import { byDue, inShift, needsOwner, roleLabel, shiftAt } from '../../utils/format';
import { leastLoaded, workload } from '../../utils/insights';
import { useAllReports } from '../../hooks/useData';
import { PeoplePanel } from '../../components/people/PeoplePanel';

export function TeamPage() {
  const { me, now, tasks, users, usersById, assignTask } = useShell();
  const t = now.getTime();
  const shift = shiftAt(now);
  const all = tasks.data ?? [];
  const rows = users?.data ? workload(users.data, all, t) : [];
  const suggestion = users?.data ? leastLoaded(users.data, all) : null;
  const unassigned = all.filter(needsOwner);
  const reports = useAllReports();
  const handoversThisShift = (userId) =>
    (reports.data?.reports ?? []).filter((r) => r.submitted_by?.user_id === userId && inShift(r.generated_at, shift)).length;
  const resolvedThisShift = (userId) =>
    all.filter((x) => x.status === 'resolved' && x.resolved_by === userId && x.resolved_at && inShift(x.resolved_at, shift)).length;
  const loading = (users?.data === undefined && !users?.error) || (tasks.data === undefined && !tasks.error);

  return (
    <>
      <PageHeader
        title="Team"
        sub={
          users?.data ? (
            <>
              <span className="num">{users.data.length}</span> active people, <span className="num">{unassigned.length}</span> unassigned tasks
            </>
          ) : (
            'Loading team…'
          )
        }
      />
      {users?.error && !users.data && <ErrorState message="Couldn’t load the team." onRetry={users.reload} />}

      <div className="split">
        <div className="stack">
          {loading && <span className="skeleton" style={{ height: 240 }} />}
          {users?.data && users.data.length === 0 && (
            <EmptyState icon={UsersThree} title="No active people">
              People appear here once they have an account.
            </EmptyState>
          )}
          {rows.map(({ user, open, overdue }) => {
            const theirs = all
              .filter((x) => x.status === 'pending' && x.assigned_to === user.user_id)
              .sort((a, b) => byDue(a, b, t));
            return (
              <Section
                key={user.user_id}
                id={`person-${user.user_id}`}
                title={user.full_name}
                count={open}
                action={
                  <span className="person__meta">
                    <span className="badge badge--role">{roleLabel(user.role)}</span>
                    {overdue > 0 && <span className="badge badge--critical">{overdue} overdue</span>}
                    {suggestion?.user.user_id === user.user_id && <span className="badge badge--accent">Least loaded</span>}
                    <span className="field-hint">
                      <span className="num">{handoversThisShift(user.user_id)}</span> handovers,{' '}
                      <span className="num">{resolvedThisShift(user.user_id)}</span> resolved this shift
                    </span>
                  </span>
                }
              >
                {theirs.length === 0 ? (
                  <p className="bay__empty">No open tasks.</p>
                ) : (
                  <StripList>
                    {theirs.map((task) => (
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
            );
          })}
        </div>

        <aside className="stack">
          <PeoplePanel me={me} onChanged={users?.reload} />
          <Section id="workload-chart" title="Open tasks per person" variant="raised">
            {rows.length > 0 && (
              <BarList
                label="Open tasks per person"
                unit=" open tasks"
                rows={rows.map((r) => ({
                  key: r.user.user_id,
                  title: r.user.full_name,
                  label: r.user.full_name,
                  value: r.open,
                  note: suggestion?.user.user_id === r.user.user_id ? <span className="badge badge--accent">Suggested</span> : null,
                }))}
              />
            )}
            <p className="section__hint">
              Suggestions go to the ground crew member with the fewest open tasks.
            </p>
            {unassigned.length > 0 && (
              <Link to="/triage?lane=unassigned" className="btn btn-secondary">
                Assign {unassigned.length} unassigned <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
