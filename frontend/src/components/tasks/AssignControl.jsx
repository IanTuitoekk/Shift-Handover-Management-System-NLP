import { useEffect, useState } from 'react';
import { CheckCircle, Lightbulb } from '@phosphor-icons/react';
import { personName, taskPerson } from '../../utils/format';

function roleText(role) {
  return role ? role.replace(/_/g, ' ') : '';
}

/**
 * Supervisor-only control for assigning a task. Choosing a person only selects them; nothing is
 * sent until "Assign" is pressed. `suggestion` ({ user, open }) is the least-loaded person and
 * can be picked with one click.
 *   users        GET /api/users resource ({ data, loading, error, reload })
 *   onAssign     (taskId, userId) => Promise; rejects on failure
 */
export function AssignControl({ task, users, currentUserId, suggestion, onAssign, compact = false, showSuggestion: allowSuggestion = true }) {
  const [draft, setDraft] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');

  // The confirmation is shown briefly, then cleared (also covers reduced motion, where it doesn't fade).
  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(''), 5000);
    return () => clearTimeout(t);
  }, [announcement]);

  const id = `assign-${task.task_id}`;
  const list = users.data ?? [];
  const usersLoading = users.loading && users.data === undefined;
  const usersFailed = Boolean(users.error) && users.data === undefined;
  const currentId = task.assigned_to ?? '';
  const assigneeMissing = currentId && list.length > 0 && !list.some((u) => u.user_id === currentId);
  const selectedId = draft ?? currentId;
  const hasChange = Boolean(selectedId) && selectedId !== currentId;
  const showSuggestion =
    allowSuggestion && suggestion && suggestion.user.user_id !== currentId && suggestion.user.user_id !== selectedId;
  const actionLabel = currentId ? 'Reassign' : 'Assign';

  function choose(userId) {
    setDraft(userId);
    setError('');
    setAnnouncement('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!hasChange || assigning) return;
    const person = list.find((u) => u.user_id === selectedId);
    setAssigning(true);
    setError('');
    try {
      await onAssign(task.task_id, selectedId);
      setDraft(null);
      setAnnouncement(`Assigned to ${person?.full_name ?? 'the selected person'}.`);
    } catch {
      setError('Couldn’t assign this task. Check your connection and try again.');
    } finally {
      setAssigning(false);
    }
  }

  if (usersFailed) {
    return (
      <div className="assign assign--failed">
        <span className="field-error">Couldn’t load the list of people.</span>
        <button type="button" className="btn btn-ghost" onClick={users.reload}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <form className={`assign ${compact ? 'assign--compact' : ''}`} onSubmit={handleSubmit}>
      <label className={compact ? 'visually-hidden' : 'assign__label'} htmlFor={id}>
        Assign to
      </label>
      <select
        id={id}
        className="select assign__select"
        value={selectedId}
        onChange={(e) => choose(e.target.value)}
        disabled={usersLoading || assigning}
        aria-busy={usersLoading || assigning || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? 'true' : undefined}
        autoComplete="off"
      >
        {usersLoading ? (
          <option value={currentId}>Loading people…</option>
        ) : (
          <>
            <option value="" disabled>
              Choose a person…
            </option>
            {assigneeMissing && (
              <option value={currentId} disabled>
                {personName(taskPerson(task, 'assignee')) ?? 'Someone no longer active'}
              </option>
            )}
            {list.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {`${u.full_name}${u.user_id === currentUserId ? ' (you)' : ''}, ${roleText(u.role)}${
                  suggestion?.user.user_id === u.user_id ? ', suggested' : ''
                }`}
              </option>
            ))}
          </>
        )}
      </select>
      <button type="submit" className="btn btn-secondary assign__button" disabled={!hasChange || assigning || usersLoading}>
        {assigning ? 'Assigning…' : actionLabel}
      </button>
      {showSuggestion && !usersLoading && (
        <button type="button" className="assign__suggest" onClick={() => choose(suggestion.user.user_id)}>
          <Lightbulb size={14} aria-hidden="true" />
          Suggested: {suggestion.user.full_name} <span className="num">({suggestion.open} open)</span>
        </button>
      )}
      <div aria-live="polite" className="assign__status">
        {assigning && <span className="visually-hidden">Assigning…</span>}
        {error && (
          <span className="field-error" id={`${id}-error`}>
            {error}
          </span>
        )}
        {!assigning && !error && announcement && (
          <span className="assign__done">
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
            {announcement}
          </span>
        )}
      </div>
    </form>
  );
}
