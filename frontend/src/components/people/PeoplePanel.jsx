import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, PencilSimple, Prohibit, Trash, UserCircle, UserMinus, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { ROLES } from '../../config';
import { useResource } from '../../hooks/useResource';
import { USERS_CHANGED } from '../../hooks/useRealtime';
import { errorMessage, formatDateTime, personName, roleLabel } from '../../utils/format';
import { Section, ErrorState } from '../ui/Layout';
import { Strip, StripList, StripSkeleton } from '../ui/Strip';
import { Dialog } from '../ui/Dialog';
import { TextField } from '../TextField';

function FormError({ message }) {
  return (
    <div aria-live="polite">
      {message && (
        <p className="notice notice--critical" role="alert">
          <WarningOctagon size={18} weight="fill" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

/** Name, email, staff number and station of a ground crew member. Sends only what changed. */
function DetailsForm({ person, onSaved }) {
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      full_name: String(data.get('full_name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      staff_number: String(data.get('staff_number') ?? '').trim(),
      station: String(data.get('station') ?? '').trim(),
    };
    const e = {};
    if (!values.full_name) e.name = 'Enter their full name.';
    if (!/^\S+@\S+\.\S+$/.test(values.email)) e.email = 'Enter a valid email, like name@kenya-airways.com.';
    setErrors(e);
    setFormError('');
    if (e.name) return nameRef.current?.focus();
    if (e.email) return emailRef.current?.focus();

    const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (person[k] ?? '')));
    if (Object.keys(changes).length === 0) return onSaved(null);
    setSaving(true);
    try {
      onSaved(await api.updateUser(person.user_id, changes));
    } catch (err) {
      setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="person-form" onSubmit={handleSubmit} noValidate>
      <FormError message={formError} />
      <TextField id="person-name" inputRef={nameRef} label="Full name" name="full_name" autoComplete="off" defaultValue={person.full_name} error={errors.name} />
      <TextField
        id="person-email"
        inputRef={emailRef}
        label="Work email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        defaultValue={person.email}
        error={errors.email}
      />
      <div className="person-form__pair">
        <TextField
          id="person-staff"
          label="Staff number"
          name="staff_number"
          autoComplete="off"
          spellCheck={false}
          maxLength={50}
          defaultValue={person.staff_number ?? ''}
          hint="Optional. Unique per person."
        />
        <TextField
          id="person-station"
          label="Station"
          name="station"
          autoComplete="off"
          maxLength={100}
          defaultValue={person.station ?? ''}
          placeholder="e.g. JKIA…"
          hint="Optional."
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save details'}
      </button>
    </form>
  );
}

function RoleForm({ person, onSaved }) {
  const [role, setRole] = useState(person.role);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setError('');
    try {
      onSaved(await api.setUserRole(person.user_id, role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="person-block">
      <FormError message={error} />
      <div className="field">
        <label className="field-label" htmlFor="person-role">
          Role
        </label>
        <div className="person-role">
          <select id="person-role" className="select" value={role} onChange={(e) => setRole(e.target.value)} autoComplete="off">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={save} disabled={saving || role === person.role}>
            {saving ? 'Saving…' : 'Change role'}
          </button>
        </div>
        <p className="field-hint">Their menu switches straight away.</p>
      </div>
    </div>
  );
}

/** Deactivate (with an optional reason) or reactivate, each confirmed. */
function ActiveControl({ person, onSaved }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef(null);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const reason = reasonRef.current?.value.trim();
      onSaved(await api.setUserActive(person.user_id, !person.is_active, reason));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
          {person.is_active ? <UserMinus size={16} aria-hidden="true" /> : <ArrowCounterClockwise size={16} aria-hidden="true" />}
          {person.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
    );
  }
  return (
    <div className="person-confirm">
      <FormError message={error} />
      {person.is_active ? (
        <>
          <p>
            <strong>{person.full_name}</strong> will be signed out at once and can’t log in until reactivated. Their open tasks
            will be marked <em>Needs reassignment</em>.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="deactivate-reason">
              Reason <span className="field-hint">(optional, seen by supervisors)</span>
            </label>
            <textarea id="deactivate-reason" ref={reasonRef} className="input" rows={2} maxLength={500} placeholder="e.g. Transferred to Mombasa…" />
          </div>
        </>
      ) : (
        <p>
          <strong>{person.full_name}</strong> will be able to log in again. Tasks still assigned to them stop needing reassignment.
        </p>
      )}
      <div className="person-actions__row">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Working…' : person.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
    </div>
  );
}

/** Irreversible. Only offered for deactivated ground crew; the email must be typed to confirm. */
function DeleteDialog({ person, open, onClose, onDeleted }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === person.email.toLowerCase();

  async function run(event) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError('');
    try {
      onDeleted(await api.deleteUser(person.user_id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Delete ${person.full_name} permanently`} titleId="delete-person-title">
      <form className="person-form" onSubmit={run} noValidate>
        <FormError message={error} />
        <div className="danger-box">
          <p>
            <strong>This can’t be undone.</strong> Their name, email, password, staff number, station and personal alerts are
            erased.
          </p>
          <ul>
            <li>If they never wrote a handover or handled a task, the account is removed completely.</li>
            <li>
              Otherwise their handovers and tasks stay for the safety record, shown as <strong>Former employee</strong>, and any
              open tasks become unassigned.
            </li>
          </ul>
        </div>
        <TextField
          id="delete-confirm"
          label={`Type ${person.email} to confirm`}
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="person-actions__row">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!matches || busy}>
            <Trash size={16} aria-hidden="true" />
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PersonMeta({ p }) {
  const extra = [p.staff_number && `Staff ${p.staff_number}`, p.station].filter(Boolean).join(' · ');
  return (
    <>
      <span className="badge badge--role">{roleLabel(p.role)}</span>
      {p.anonymised_at ? (
        <span className="badge">Deleted</span>
      ) : (
        <>
          <span className="person-email">{p.email}</span>
          {extra && <span className="person-extra">{extra}</span>}
        </>
      )}
      {!p.is_active && !p.anonymised_at && (
        <span className="person-extra">
          Deactivated{p.deactivated_by ? ` by ${p.deactivated_by.full_name}` : ''}
          {p.deactivated_at ? `, ${formatDateTime(p.deactivated_at)}` : ''}
          {p.deactivation_reason ? `: “${p.deactivation_reason}”` : ''}
        </span>
      )}
    </>
  );
}

/** Supervisor-only: everyone with an account, including deactivated and deleted ones. */
export function PeoplePanel({ me, onChanged }) {
  const directory = useResource('users:directory', api.listDirectory);
  const { reload } = directory;
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.addEventListener(USERS_CHANGED, reload);
    return () => window.removeEventListener(USERS_CHANGED, reload);
  }, [reload]);

  const people = directory.data ?? [];
  const person = people.find((p) => p.user_id === editingId && !p.anonymised_at) ?? null;

  function changed(text) {
    reload();
    onChanged?.();
    setMessage(text);
  }
  function close() {
    setEditingId(null);
    setDeleting(false);
  }

  return (
    <Section id="people" title="People" count={directory.data ? people.filter((p) => p.is_active).length : undefined}>
      <p className="visually-hidden" aria-live="polite">
        {message}
      </p>
      <p className="section__hint">New ground crew sign up themselves. Forgotten passwords are reset from the log in page.</p>
      {directory.data === undefined && !directory.error && <StripSkeleton rows={3} />}
      {directory.error && !directory.data && <ErrorState message="Couldn’t load people." onRetry={reload} />}
      {people.length > 0 && (
        <StripList label="People">
          {people.map((p) => {
            const self = p.user_id === me.user_id;
            return (
              <Strip
                key={p.user_id}
                className={p.is_active ? '' : 'strip--read'}
                icon={p.anonymised_at ? Trash : p.is_active ? UserCircle : Prohibit}
                iconLabel={p.anonymised_at ? 'Deleted' : p.is_active ? 'Active' : 'Deactivated'}
                title={
                  <>
                    {personName(p)}
                    {self && <span className="field-hint"> (you)</span>}
                  </>
                }
                meta={<PersonMeta p={p} />}
                aside={
                  !self &&
                  !p.anonymised_at && (
                    <button type="button" className="btn btn-ghost" onClick={() => setEditingId(p.user_id)} aria-label={`Manage ${p.full_name}`}>
                      <PencilSimple size={16} aria-hidden="true" />
                      Manage
                    </button>
                  )
                }
              />
            );
          })}
        </StripList>
      )}

      <Dialog open={Boolean(person)} onClose={close} title={person ? `Manage ${person.full_name}` : 'Manage'} titleId="manage-person-title">
        {person && (
          <div className="person-edit">
            {person.role === 'ground_crew' && (
              <section className="person-block" aria-labelledby="details-heading">
                <h3 id="details-heading" className="insight__title">
                  Personal details
                </h3>
                <DetailsForm
                  key={`${person.user_id}-${person.email}-${person.full_name}`}
                  person={person}
                  onSaved={(user) => {
                    if (user) changed(`${user.full_name} updated.`);
                    close();
                  }}
                />
              </section>
            )}
            {person.is_active && (
              <RoleForm
                key={`${person.user_id}-${person.role}`}
                person={person}
                onSaved={(user) => changed(`${user.full_name} is now ${roleLabel(user.role).toLowerCase()}.`)}
              />
            )}
            <section className="person-actions" aria-labelledby="account-heading">
              <h3 id="account-heading" className="insight__title">
                Account
              </h3>
              <ActiveControl
                key={`${person.user_id}-${person.is_active}`}
                person={person}
                onSaved={(user) =>
                  changed(
                    user.is_active
                      ? `${user.full_name} reactivated.`
                      : `${user.full_name} deactivated${user.tasks_needing_reassignment ? `; ${user.tasks_needing_reassignment} open tasks need reassignment` : ''}.`,
                  )
                }
              />
              {!person.is_active && person.role === 'ground_crew' && (
                <>
                  <p className="field-hint">Deleting erases their personal details for good. Deactivated is enough if they might come back.</p>
                  <div>
                    <button type="button" className="btn btn-danger-ghost" onClick={() => setDeleting(true)}>
                      <Trash size={16} aria-hidden="true" />
                      Delete permanently…
                    </button>
                  </div>
                </>
              )}
              {!person.is_active && person.role !== 'ground_crew' && (
                <p className="field-hint">Supervisor accounts can be deactivated but never deleted.</p>
              )}
            </section>
          </div>
        )}
      </Dialog>

      {person && (
        <DeleteDialog
          key={person.user_id}
          person={person}
          open={deleting}
          onClose={() => setDeleting(false)}
          onDeleted={(result) => {
            changed(
              result.outcome === 'deleted'
                ? `${person.full_name} deleted.`
                : `${person.full_name} deleted; their handovers now show Former employee.`,
            );
            close();
          }}
        />
      )}
    </Section>
  );
}
