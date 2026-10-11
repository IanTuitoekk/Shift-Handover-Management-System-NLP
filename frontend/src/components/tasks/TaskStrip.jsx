import { useState } from 'react';
import { CheckCircle, CircleDashed, Clock, WarningOctagon } from '@phosphor-icons/react';
import { Strip } from '../ui/Strip';
import { AssigneeBadge, CategoryBadge, DueBadge } from '../ui/Badges';
import { ResolveButton } from './ResolveButton';
import { AssignControl } from './AssignControl';
import { formatAge, formatDateTime, isOverdue, taskCategory, taskSummary } from '../../utils/format';
import { afterLeave } from '../../utils/motion';

/**
 * A task rendered as a strip.
 *   onResolve(task)        => Promise, resolves the task in the API; the strip then animates out
 *   onResolved(task, res)  called after the exit animation so the parent can drop it
 *   assign                 { users, suggestion, onAssign } for supervisors
 */
export function TaskStrip({ task, now, currentUserId, usersById, onResolve, onResolved, assign, showCategory = true, compact = false }) {
  const [leaving, setLeaving] = useState(false);
  const overdue = isOverdue(task, now?.getTime?.() ?? now);
  const resolved = task.status === 'resolved';
  const tone = resolved ? 'ok' : overdue ? 'critical' : task.assigned_to ? 'accent' : 'neutral';
  const icon = resolved ? CheckCircle : overdue ? WarningOctagon : task.assigned_to ? Clock : CircleDashed;
  const iconLabel = resolved ? 'Resolved' : overdue ? 'Overdue' : task.assigned_to ? 'Assigned, pending' : 'Unassigned';

  async function handleResolve() {
    const result = await onResolve(task);
    setLeaving(true);
    afterLeave(() => onResolved?.(task, result));
  }

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
          {!resolved && <DueBadge task={task} now={now} />}
          {category && <CategoryBadge name={category} short />}
          <AssigneeBadge task={task} currentUserId={currentUserId} usersById={usersById} />
          {resolved && task.resolved_at && (
            <span className="strip__note">
              Resolved <time dateTime={task.resolved_at}>{formatDateTime(task.resolved_at)}</time>
              {task.resolved_by && usersById?.get(task.resolved_by) ? ` by ${usersById.get(task.resolved_by).full_name}` : ''}
              {task.resolved_by && task.resolved_by === currentUserId ? ' by you' : ''}
            </span>
          )}
        </>
      }
      actions={
        !resolved && (onResolve || assign) ? (
          <>
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
            {onResolve && <ResolveButton onResolve={handleResolve} />}
          </>
        ) : null
      }
    />
  );
}
