import { useState } from 'react';
import { Moon, PencilSimple, Plus, Sun, Trash } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { useShell } from '../../components/shell/ShellContext';
import { Section, ErrorState } from '../../components/ui/Layout';
import { StripSkeleton } from '../../components/ui/Strip';
import { formatNumber } from '../../utils/format';

const crossesMidnight = (s) => s.end_time < s.start_time;
const isDaytime = (s) => {
  const hour = Number(s.start_time.slice(0, 2));
  return hour >= 5 && hour < 17;
};

/**
 * Shift settings: the named daily shifts (e.g. Day 06:00 to 18:00), which supervisors add, edit,
 * deactivate and, while no handover has used them, delete. A shift with handovers can only be
 * deactivated, so old reports keep pointing at it; renaming one doesn't change old reports. The
 * server refuses overlapping active shifts and duplicate names.
 */
export function ShiftSettings({ onChanged }) {
  const { refreshAll } = useShell();
  const { data, error, loading, reload } = useResource('shifts:all', () => api.listShifts(true));
  const [editing, setEditing] = useState(null); // a shift id, or 'new'

  function saved() {
    setEditing(null);
    reload();
    refreshAll(); // new shift windows for this screen straight away
    onChanged?.();
  }

  const active = (data ?? []).filter((s) => s.is_active);
  const inactive = (data ?? []).filter((s) => !s.is_active);

  return (
    <Section
      id="shift-settings"
      title="Shift settings"
      variant="raised"
      action={
        data &&
        editing !== 'new' && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden="true" />
            Add shift
          </button>
        )
      }
    >
      <p className="field-hint">
        Each shift repeats every day. Active shifts can’t overlap, so every moment belongs to at most one shift. A shift that ends
        before it starts runs past midnight. A shift with handovers can only be deactivated, so old reports keep it.
      </p>
      {error && !data && <ErrorState message="Couldn’t load the shifts." onRetry={reload} />}
      {loading && !data && <StripSkeleton rows={2} />}
      {editing === 'new' && <ShiftForm onCancel={() => setEditing(null)} onSaved={saved} />}
      {data && active.length === 0 && editing !== 'new' && (
        <p className="notice notice--critical">No shift is active, so every screen shows “No shift” and tasks wait for a supervisor. Add one.</p>
      )}
      <ul className="shift-settings" aria-label="Shifts">
        {[...active, ...inactive].map((s) =>
          editing === s.shift_id ? (
            <li key={s.shift_id} className="shift-settings__row shift-settings__row--editing">
              <ShiftForm shift={s} onCancel={() => setEditing(null)} onSaved={saved} />
            </li>
          ) : (
            <ShiftRow key={s.shift_id} shift={s} onEdit={() => setEditing(s.shift_id)} onSaved={saved} />
          ),
        )}
      </ul>
    </Section>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function ShiftRow({ shift, onEdit, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Old reports point at their shift, so only a shift no handover has used can be deleted.
  const deletable = shift.handovers === 0;

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.deleteShift(shift.shift_id);
      onSaved(); // the row disappears
    } catch (err) {
      setError(err.response?.data?.error ?? 'Couldn’t delete the shift. Try again.');
      setConfirmingDelete(false);
      setBusy(false);
    }
  }
  const Icon = isDaytime(shift) ? Sun : Moon;

  async function setActive(isActive) {
    setBusy(true);
    setError('');
    try {
      await api.updateShift(shift.shift_id, { is_active: isActive });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error ?? 'Couldn’t update the shift. Try again.');
    } finally {
      setBusy(false); // the row stays on screen (as active or inactive), so it must be usable again
    }
  }

  return (
    <li className={`shift-settings__row ${shift.is_active ? '' : 'shift-settings__row--inactive'}`}>
      <Icon size={18} aria-hidden="true" />
      <div className="shift-settings__main">
        <span className="shift-settings__name">
          {shift.name}
          {!shift.is_active && <span className="badge">Inactive</span>}
        </span>
        <span className="field-hint">
          <span className="num">{shift.start_time}</span> to <span className="num">{shift.end_time}</span>
          {crossesMidnight(shift) && ', past midnight'}
          {' · '}
          <span className="num">{formatNumber(shift.handovers)}</span> handover{shift.handovers === 1 ? '' : 's'}
          {shift.handovers > 0 && ' (deactivate only)'}
        </span>
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
        {confirmingDelete && (
          <span className="field-hint" role="alert">
            Delete {shift.name} for good?
            {shift.plans > 0 && ` Its ${plural(shift.plans, 'shift plan')} will be removed.`}
            {shift.rostered > 0 && ` ${plural(shift.rostered, 'person')} rostered on it will become not rostered.`} This can’t be undone.
          </span>
        )}
      </div>
      {confirmingDelete ? (
        <div className="shift-settings__actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
            <Trash size={16} aria-hidden="true" />
            {busy ? 'Deleting…' : `Delete ${shift.name}`}
          </button>
        </div>
      ) : (
      <div className="shift-settings__actions">
        {shift.is_active && (
          <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={busy} aria-label={`Edit ${shift.name}`}>
            <PencilSimple size={16} aria-hidden="true" />
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setActive(!shift.is_active)}
          disabled={busy}
          aria-label={`${shift.is_active ? 'Deactivate' : 'Reactivate'} ${shift.name}`}
        >
          {busy ? 'Saving…' : shift.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
        {deletable && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(true)} disabled={busy} aria-label={`Delete ${shift.name}`}>
            <Trash size={16} aria-hidden="true" />
            Delete
          </button>
        )}
      </div>
      )}
    </li>
  );
}

/** Add a shift, or edit one (`shift`). Errors show beside the field they are about. */
function ShiftForm({ shift = null, onCancel, onSaved }) {
  const [values, setValues] = useState({ name: shift?.name ?? '', start_time: shift?.start_time ?? '', end_time: shift?.end_time ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const prefix = shift ? `shift-${shift.shift_id}` : 'shift-new';

  async function submit(event) {
    event.preventDefault();
    const e = {};
    if (!values.name.trim()) e.name = 'Give the shift a name.';
    if (!values.start_time) e.start_time = 'Choose when it starts.';
    if (!values.end_time) e.end_time = 'Choose when it ends.';
    else if (values.start_time === values.end_time) e.end_time = 'The end must differ from the start.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { name: values.name.trim(), start_time: values.start_time, end_time: values.end_time };
      if (shift) await api.updateShift(shift.shift_id, body);
      else await api.addShift(body);
      onSaved();
    } catch (err) {
      const { field, error } = err.response?.data ?? {};
      setErrors({ [['name', 'start_time', 'end_time'].includes(field) ? field : 'form']: error ?? 'Couldn’t save the shift. Try again.' });
      setSaving(false);
    }
  }

  const field = (name, label, input) => (
    <label className="field" htmlFor={`${prefix}-${name}`}>
      <span className="field-label">{label}</span>
      {input}
      {errors[name] && (
        <span className="field-error" id={`${prefix}-${name}-error`}>
          {errors[name]}
        </span>
      )}
    </label>
  );
  const describedBy = (name) => (errors[name] ? `${prefix}-${name}-error` : undefined);

  return (
    <form className="shift-form" onSubmit={submit} noValidate aria-label={shift ? `Edit ${shift.name}` : 'Add a shift'}>
      {field(
        'name',
        'Name',
        <input
          id={`${prefix}-name`}
          className="input"
          value={values.name}
          onChange={set('name')}
          maxLength={50}
          placeholder="e.g. Early, Late, Night…"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('name')}
          autoComplete="off"
        />,
      )}
      {field(
        'start_time',
        'Starts',
        <input id={`${prefix}-start_time`} type="time" className="input" value={values.start_time} onChange={set('start_time')} aria-invalid={Boolean(errors.start_time)} aria-describedby={describedBy('start_time')} />,
      )}
      {field(
        'end_time',
        'Ends',
        <input id={`${prefix}-end_time`} type="time" className="input" value={values.end_time} onChange={set('end_time')} aria-invalid={Boolean(errors.end_time)} aria-describedby={describedBy('end_time')} />,
      )}
      <div className="shift-form__actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : shift ? 'Save changes' : 'Add shift'}
        </button>
      </div>
      <p className="field-hint shift-form__hint" aria-live="polite">
        {errors.form ? (
          <span className="field-error">{errors.form}</span>
        ) : values.start_time && values.end_time && values.end_time < values.start_time ? (
          'Ends the next morning (runs past midnight).'
        ) : shift ? (
          'Old reports keep the name they were written under.'
        ) : (
          ''
        )}
      </p>
    </form>
  );
}
