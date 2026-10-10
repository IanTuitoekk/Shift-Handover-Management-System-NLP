import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, WarningOctagon } from '@phosphor-icons/react';
import { OVERDUE_HOURS } from '../config';
import { formatDateTime, formatRelative, isOverdue } from '../utils/format';
import { AssignControl } from './AssignControl';

const COLLAPSED_COUNT = 6;
const CONFIRM_WINDOW_MS = 5000;

function TaskItem({ task, overdue, currentUserId, users, onResolve, onAssign }) {
  const [confirming, setConfirming] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  // Drop back out of the confirm step if the user doesn't follow through.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(id);
  }, [confirming]);

  async function handleConfirm() {
    setResolving(true);
    setError('');
    try {
      await onResolve(task.task_id);
    } catch {
      setError('Couldn’t resolve this task. Try again.');
      setResolving(false);
      setConfirming(false);
    }
  }

  return (
    <li className={`task ${overdue ? 'task-overdue' : ''}`}>
      <p className="task-description">{task.description}</p>
      <div className="task-meta">
        {overdue && (
          <span className="badge badge-critical">
            <WarningOctagon size={14} weight="fill" aria-hidden="true" />
            Overdue
          </span>
        )}
        {task.assigned_to && task.assigned_to === currentUserId && <span className="badge badge-accent">Assigned to you</span>}
        <time dateTime={task.created_at} title={formatDateTime(task.created_at)}>
          Raised {formatRelative(task.created_at)}
        </time>
      </div>
      {users && <AssignControl task={task} users={users} currentUserId={currentUserId} onAssign={onAssign} />}
      <div className="task-actions">
        <Link to={`/reports/${task.report_id}`} className="btn btn-ghost btn-sm">
          Open report
        </Link>
        {confirming ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={resolving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={resolving}>
              {resolving ? 'Resolving…' : 'Confirm resolved'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
            Mark resolved
          </button>
        )}
      </div>
      <div aria-live="polite">{error && <p className="field-error">{error}</p>}</div>
    </li>
  );
}

/**
 * `users` is the GET /api/users resource, passed only for supervisors; when present,
 * each task gets an assignment control and `onAssign(taskId, userId)` is called on selection.
 */
export function TasksPanel({ tasks, loading, error, now, currentUserId, users, onResolve, onAssign, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const sorted = (tasks ?? [])
    .map((task) => ({ task, overdue: isOverdue(task, now.getTime()) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || new Date(b.task.created_at) - new Date(a.task.created_at));
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);
  const initialLoad = loading && tasks === undefined;

  async function handleResolve(taskId) {
    await onResolve(taskId);
    setAnnouncement('Task marked resolved.');
  }

  return (
    <section className="panel" aria-labelledby="tasks-title">
      <div className="panel-header">
        <h2 id="tasks-title" className="panel-title">
          Open tasks
        </h2>
        {tasks && <span className="badge num">{tasks.length}</span>}
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {initialLoad && (
        <div className="stack-skeleton" role="status" aria-label="Loading tasks…">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" style={{ height: '5.5rem' }} />
          ))}
        </div>
      )}

      {error && !initialLoad && tasks === undefined && (
        <div className="empty">
          <strong>Couldn’t load tasks</strong>
          <p>Check your connection, then try again.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {tasks && tasks.length === 0 && (
        <div className="empty">
          <CheckCircle size={32} aria-hidden="true" />
          <strong>No open tasks</strong>
          <p>Tasks are raised automatically from each submitted handover.</p>
        </div>
      )}

      {visible.length > 0 && (
        <>
          <ul className="task-list">
            {visible.map(({ task, overdue }) => (
              <TaskItem
                key={task.task_id}
                task={task}
                overdue={overdue}
                currentUserId={currentUserId}
                users={users}
                onResolve={handleResolve}
                onAssign={onAssign}
              />
            ))}
          </ul>
          <p className="task-footnote">Tasks open longer than {OVERDUE_HOURS} hours are marked overdue.</p>
        </>
      )}

      {sorted.length > COLLAPSED_COUNT && (
        <div className="panel-footer">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show fewer' : `Show all ${sorted.length} tasks`}
          </button>
        </div>
      )}
    </section>
  );
}
