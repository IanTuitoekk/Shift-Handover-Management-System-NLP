import { useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { ROLES } from '../../config';

/**
 * Supervisor-only role change, same pattern as assignment: choosing only selects; nothing is sent
 * until "Change role" is pressed. Not shown for the signed-in supervisor's own row.
 */
export function RoleControl({ user, onChange }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const selected = draft ?? user.role;
  const changed = selected !== user.role;
  const id = `role-${user.user_id}`;

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(''), 5000);
    return () => clearTimeout(t);
  }, [done]);

  async function submit(event) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setError('');
    try {
      await onChange(user.user_id, selected);
      setDraft(null);
      setDone(`${user.full_name} is now ${ROLES.find((r) => r.value === selected)?.label.toLowerCase()}.`);
    } catch {
      setError('Couldn’t change the role. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="assign role-control" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={id}>
        Role for {user.full_name}
      </label>
      <select id={id} className="select assign__select" value={selected} onChange={(e) => setDraft(e.target.value)} disabled={saving} autoComplete="off">
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary" disabled={!changed || saving}>
        {saving ? 'Saving…' : 'Change role'}
      </button>
      <div aria-live="polite" className="assign__status">
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
