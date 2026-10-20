import { useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { formatDateTime, shiftAt } from '../../utils/format';

/** ISO string -> value for <input type="datetime-local"> in local time. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Supervisor-only due time. Picking a time (or a shortcut) only fills the field; nothing is sent
 * until "Set due time" is pressed. "Clear" removes the due time.
 *   onSave(taskId, isoOrNull) => Promise
 */
export function DueControl({ task, now, onSave }) {
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const id = `due-${task.task_id}`;
  const current = toLocalInput(task.due_at);
  const shown = value ?? current;
  const changed = shown !== current && shown !== '';

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(''), 5000);
    return () => clearTimeout(t);
  }, [done]);

  async function save(iso) {
    setSaving(true);
    setError('');
    try {
      await onSave(task.task_id, iso);
      setValue(null);
      setDone(iso ? `Due ${formatDateTime(iso)}.` : 'Due time cleared.');
    } catch {
      setError('Couldn’t save the due time. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (!changed || saving) return;
    save(new Date(shown).toISOString());
  }

  const endOfShift = shiftAt(now).end;
  const inFourHours = new Date(new Date(now).getTime() + 4 * 3600000);

  return (
    <form className="due" onSubmit={submit}>
      <label className="assign__label" htmlFor={id}>
        Due time
      </label>
      <div className="due__row">
        <input
          id={id}
          type="datetime-local"
          className="input due__input"
          value={shown}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
        />
        <button type="submit" className="btn btn-secondary" disabled={!changed || saving}>
          {saving ? 'Saving…' : 'Set due time'}
        </button>
      </div>
      <div className="due__shortcuts">
        <button type="button" className="assign__suggest" onClick={() => setValue(toLocalInput(endOfShift.toISOString()))} disabled={saving}>
          End of this shift
        </button>
        <button type="button" className="assign__suggest" onClick={() => setValue(toLocalInput(inFourHours.toISOString()))} disabled={saving}>
          In 4 hours
        </button>
        {task.due_at && (
          <button type="button" className="assign__suggest" onClick={() => save(null)} disabled={saving}>
            Clear due time
          </button>
        )}
      </div>
      <div aria-live="polite">
        {error && <span className="field-error">{error}</span>}
        {done && (
          <span className="assign__done">
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
            {done}
          </span>
        )}
      </div>
    </form>
  );
}
