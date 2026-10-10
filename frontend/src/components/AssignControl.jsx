import { useState } from 'react';

function roleText(role) {
  return role ? role.replace(/_/g, ' ') : '';
}

/**
 * Supervisor-only control for assigning a task to a person.
 * Choosing a person only selects them; nothing is sent until "Assign" is pressed.
 * `users` is the useResource result for GET /api/users.
 * `onAssign(taskId, userId)` must call the API and refresh the task; it rejects on failure.
 */
export function AssignControl({ task, users, currentUserId, onAssign }) {
  // The person picked in the dropdown but not yet assigned; null means no pending change.
  const [draft, setDraft] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const id = `assign-${task.task_id}`;
  const list = users.data ?? [];
  const usersLoading = users.loading && users.data === undefined;
  const usersFailed = Boolean(users.error) && users.data === undefined;
  const currentId = task.assigned_to ?? '';
  // An assignee can be missing from the list if their account was deactivated.
  const assigneeMissing = currentId && list.length > 0 && !list.some((u) => u.user_id === currentId);
  const selectedId = draft ?? currentId;
  const hasChange = Boolean(selectedId) && selectedId !== currentId;

  function handleChange(event) {
    setDraft(event.target.value);
    setError('');
    setAnnouncement('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!hasChange || assigning) return;
    const person = list.find((u) => u.user_id === selectedId);

    setAssigning(true);
    setError('');
    setAnnouncement('');
    try {
      await onAssign(task.task_id, selectedId);
      setDraft(null);
      setAnnouncement(`Assigned to ${person?.full_name ?? 'the selected person'}.`);
    } catch {
      // Keep the selection so the supervisor can press Assign again.
      setError('Couldn’t assign this task. Check your connection and try again.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <form className="assign-control" onSubmit={handleSubmit}>
      <label className="assign-label" htmlFor={id}>
        Assign to
      </label>

      {usersFailed ? (
        <div className="assign-failed">
          <p className="field-error">Couldn’t load the list of people.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={users.reload}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <select
            id={id}
            className="select assign-select"
            value={selectedId}
            onChange={handleChange}
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
                    Inactive user
                  </option>
                )}
                {list.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {`${u.full_name}${u.user_id === currentUserId ? ' (you)' : ''}, ${roleText(u.role)}`}
                  </option>
                ))}
              </>
            )}
          </select>
          <button
            type="submit"
            className="btn btn-secondary btn-sm assign-button"
            disabled={!hasChange || assigning || usersLoading}
          >
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </>
      )}

      <div aria-live="polite" className="assign-status">
        {assigning && <p className="visually-hidden">Assigning…</p>}
        {error && (
          <p className="field-error" id={`${id}-error`}>
            {error}
          </p>
        )}
        {!assigning && !error && announcement && <p className="visually-hidden">{announcement}</p>}
      </div>
    </form>
  );
}
