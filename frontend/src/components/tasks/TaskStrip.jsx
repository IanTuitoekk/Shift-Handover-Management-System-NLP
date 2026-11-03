import { useState } from 'react';
import { ArrowUUpLeft, Check, CheckCircle, CircleDashed, Clock, HourglassMedium, WarningOctagon } from '@phosphor-icons/react';
import { Strip } from '../ui/Strip';
import { AssigneeBadge, CategoryBadge, DueBadge, SignOffBadge } from '../ui/Badges';
import { ResolveButton } from './ResolveButton';
import { TaskActionButton } from './TaskActionButton';
import { AssignControl } from './AssignControl';
import { formatAge, formatDateTime, isOverdue, personName, taskCategory, taskPerson, taskSummary } from '../../utils/format';
import { afterLeave } from '../../utils/motion';

/**
 * A task rendered as a strip.
 *   onResolve(task)        => Promise, resolves (signs off) the task in the API; the strip then animates out
 *   onMarkDone(task)       => Promise, the assignee marks it done (shown until it is done)
 *   onSendBack(task)       => Promise, a supervisor returns a done task to its assignee (shown once done)
 *   onUpdated(task, res)   called with the API's result (after the exit animation when resolving)
 *   assign                 { users, suggestion, onAssign } for supervisors
 */
export function TaskStrip({ task, now, currentUserId, usersById, onResolve, onMarkDone, onSendBack, onUpdated, assign, showCategory = true, compact = false }) {
  const [leaving, setLeaving] = useState(false);
  const overdue = isOverdue(task, now?.getTime?.() ?? now);
  const resolved = task.status === 'resolved';
  const done = !resolved && Boolean(task.done_at);
  const tone = resolved || done ? 'ok' : overdue ? 'critical' : task.assigned_to ? 'accent' : 'neutral';
  const icon = resolved ? CheckCircle : done ? HourglassMedium : overdue ? WarningOctagon : task.assigned_to ? Clock : CircleDashed;
  const iconLabel = resolved ? 'Resolved' : done ? 'Done, awaiting sign-off' : overdue ? 'Overdue' : task.assigned_to ? 'Assigned, pending' : 'Unassigned';

  async function handleResolve() {
    const result = await onResolve(task);
    setLeaving(true);
    afterLeave(() => onUpdated?.(task, result));
  }

  const update = (action) => async () => onUpdated?.(task, await action(task));
  const markDone = onMarkDone && !done && !resolved;
  const sendBack = onSendBack && done;

  const category = showCategory ? taskCategory(task) : null;

  return (
    <Strip
      tone={tone}
      icon={icon}
      iconLabel={iconLabel}
      time={task.created_at}
      timeSub={resolved ? null : <span className={overdue ? 'age age--critical' : 'age'}>{formatAge(task.created_at, now)}</span>}
      to={`/reports/${task.report_id}`}
      title={taskSummary(task)}
      className={`${leaving ? 'strip--leaving' : ''} ${compact ? 'strip--compact' : ''}`}
      meta={
        <>
          {done ? <SignOffBadge task={task} /> : !resolved && <DueBadge task={task} now={now} />}
          {category && <CategoryBadge name={category} short />}
          <AssigneeBadge task={task} currentUserId={currentUserId} usersById={usersById} />
          {resolved && task.resolved_at && (
            <span className="strip__note">
              Resolved <time dateTime={task.resolved_at}>{formatDateTime(task.resolved_at)}</time>
              {task.resolved_by === currentUserId
                ? ' by you'
                : taskPerson(task, 'resolver', usersById)
                  ? ` by ${personName(taskPerson(task, 'resolver', usersById))}`
                  : ''}
            </span>
          )}
        </>
      }
      actions={
        !resolved && (onResolve || assign || markDone || sendBack) ? (
          <>
            {markDone && <TaskActionButton onAction={update(onMarkDone)} label="Mark done" busyLabel="Marking done…" icon={Check} />}
            {sendBack && <TaskActionButton onAction={update(onSendBack)} label="Send back" busyLabel="Sending back…" icon={ArrowUUpLeft} variant="ghost" />}
            {assign && (
              <AssignControl
                task={task}
                users={assign.users}
                currentUserId={currentUserId}
                suggestion={assign.suggestion}
                onAssign={assign.onAssign}
                showSuggestion={assign.showSuggestion !== false}
                compact
              />
            )}
            {onResolve && <ResolveButton onResolve={handleResolve} label={done ? 'Sign off' : 'Mark resolved'} />}
          </>
        ) : null
      }
    />
  );
}
