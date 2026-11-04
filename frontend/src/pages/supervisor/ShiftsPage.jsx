import { useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck, CalendarPlus, UserCircle } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { SHIFT_PLANS_CHANGED } from '../../hooks/useRealtime';
import { PageHeader, Section, ErrorState } from '../../components/ui/Layout';
import { StripSkeleton } from '../../components/ui/Strip';
import { errorMessage, formatDateTime, formatTime, personName, rosterLabel, shiftLabel, shiftTitle } from '../../utils/format';
import { activeShifts } from '../../utils/shiftClock';
import { ShiftSettings } from './ShiftSettings';

// A run of a shift is named by its start date and shift id.
const runId = (s) => `${s.date}:${s.shift_id}`;
const runDomId = (s) => `shift-${s.date}-${s.shift_id}`;
const DAY_MS = 24 * 3600 * 1000;
// 'YYYY-MM-DD' in the browser's time zone (the en-CA locale writes dates that way).
const isoDate = (date) => date.toLocaleDateString('en-CA');

/**
 * Supervisors plan who works each coming shift and who each person takes over from. A handover's
 * task then goes to the person taking over from the writer (see the backend's assignmentService).
 */
export function ShiftsPage() {
  const { data, error, loading, reload } = useResource('shift-plans', () => api.listShiftPlans());
  const [editing, setEditing] = useState(null);
  // Creating a shift: null, 'pick' (choosing the date), or the chosen shift being planned.
  const [creating, setCreating] = useState(null);
  // Another supervisor may change a plan while this page is open.
  useEffect(() => {
    window.addEventListener(SHIFT_PLANS_CHANGED, reload);
    return () => window.removeEventListener(SHIFT_PLANS_CHANGED, reload);
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Shifts"
        sub="Set up the shifts, then plan who works each one and who they take over from. A handover’s task goes to the person taking over from its writer."
      />
      <ShiftSettings onChanged={reload} />
      <div className="shift-plans__head">
        <h2 className="section-title">Coming shifts</h2>
        {data && !creating && activeShifts().length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => setCreating('pick')}>
            <CalendarPlus size={16} aria-hidden="true" />
            Plan a later shift
          </button>
        )}
      </div>
      {data && creating === 'pick' && (
        <CreateShift
          maxDaysAhead={data.max_days_ahead}
          onCancel={() => setCreating(null)}
          onPicked={(shift) => {
            // Already listed: plan it in place rather than twice.
            if (data.shifts.some((s) => runId(s) === runId(shift))) {
              setCreating(null);
              setEditing(runId(shift));
              requestAnimationFrame(() => document.getElementById(runDomId(shift))?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
            } else {
              setCreating(shift);
            }
          }}
        />
      )}
      {data && creating && creating !== 'pick' && (
        <div className="shift-plans shift-plans--new">
          <ShiftCard
            shift={creating}
            crew={data.crew}
            editing
            isNew
            onClose={() => setCreating(null)}
            onSaved={() => {
              setCreating(null);
              reload();
            }}
          />
        </div>
      )}
      {error && !data && <ErrorState message="Couldn’t load shift plans." onRetry={reload} />}
      {loading && !data && <StripSkeleton rows={4} />}
      {data && data.shifts.length === 0 && <p className="field-hint">No shifts are active. Add one above to start planning.</p>}
      {data && (
        <div className="shift-plans">
          {data.shifts.map((shift) => (
            <ShiftCard
              key={runId(shift)}
              shift={shift}
              crew={data.crew}
              editing={editing === runId(shift)}
              onEdit={() => setEditing(runId(shift))}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Choose a date and one of the shifts to plan; its hours come from the shift settings above. */
function CreateShift({ maxDaysAhead = 60, onCancel, onPicked }) {
  const today = new Date();
  const [date, setDate] = useState(isoDate(today));
  const [key, setKey] = useState(() => activeShifts()[0]?.shift_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onPicked(await api.getShiftPlan(date, key));
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t open that shift. Try again.'));
      setBusy(false);
    }
  }

  return (
    <Section id="create-shift" title="Plan a later shift" variant="raised" className="create-shift">
      <form className="create-shift__form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Date</span>
          <input
            type="date"
            className="input"
            value={date}
            min={isoDate(today)}
            max={isoDate(new Date(today.getTime() + maxDaysAhead * DAY_MS))}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Shift</span>
          <select className="select" value={key} onChange={(e) => setKey(e.target.value)} required autoComplete="off">
            {activeShifts().map((s) => (
              <option key={s.shift_id} value={s.shift_id}>
                {s.name} ({s.start_time} to {s.end_time})
              </option>
            ))}
          </select>
        </label>
        <div className="create-shift__actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !date || !key}>
            {busy ? 'Opening…' : 'Next: choose the crew'}
            {!busy && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
        <p className="field-hint create-shift__hint" aria-live="polite">
          {error ? <span className="field-error">{error}</span> : `Up to ${maxDaysAhead} days ahead.`}
        </p>
      </form>
    </Section>
  );
}

function ShiftCard({ shift, crew, editing, isNew = false, onEdit, onClose, onSaved }) {
  const plan = shift.plan;
  const rostered = crew.filter((c) => c.shift_id === shift.shift_id);
  const id = runDomId(shift);
  return (
    <Section
      id={id}
      title={`${isNew ? 'New: ' : ''}${shiftLabel({ name: shift.name, start: shift.start })}`}
      variant="raised"
      action={
        <span className="shift-card__status">
          {shift.current && <span className="badge badge--accent">Now</span>}
          {plan ? <span className="badge badge--ok">Planned, {plan.members.length}</span> : <span className="badge">Not planned</span>}
        </span>
      }
    >
      <p className="field-hint">
        <span className="num">{formatTime(shift.start)}</span> to <span className="num">{formatTime(shift.end)}</span>
      </p>
      {editing ? (
        <PlanEditor shift={shift} crew={crew} onCancel={onClose} onSaved={onSaved} />
      ) : (
        <>
          {plan ? (
            <ul className="plan-list" aria-label={`Crew on the ${shiftTitle(shift.name)}`}>
              {plan.members.map((m) => (
                <li key={m.user_id} className="plan-list__row">
                  <UserCircle size={18} aria-hidden="true" />
                  <span className="plan-list__name">
                    {personName(m)}
                    {!m.is_active && <span className="field-hint"> (deactivated: gets no tasks)</span>}
                  </span>
                  <span className="plan-list__from">
                    {m.takes_over_from ? (
                      <>
                        takes over from <strong>{m.takes_over_from_name ?? 'a former colleague'}</strong>
                      </>
                    ) : (
                      'takes over from anyone'
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">
              {rostered.length
                ? `No plan yet, so tasks for this shift go to the least busy of those rostered on the ${shiftTitle(shift.name)}: ${rostered.map((c) => c.full_name).join(', ')}.`
                : `No plan yet, and nobody is rostered on the ${shiftTitle(shift.name)}, so tasks for this shift wait for a supervisor.`}
            </p>
          )}
          <div className="shift-card__foot">
            {plan?.updated_at && (
              <span className="field-hint">
                Updated{plan.updated_by_name ? ` by ${plan.updated_by_name}` : ''}, <span className="num">{formatDateTime(plan.updated_at)}</span>
              </span>
            )}
            <button type="button" className="btn btn-secondary" onClick={onEdit}>
              <CalendarCheck size={16} aria-hidden="true" />
              {plan ? 'Edit plan' : 'Plan shift'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

/** Tick who works the shift and, for each, who they take over from. Starts from the plan, or the roster. */
function PlanEditor({ shift, crew, onCancel, onSaved }) {
  const [rows, setRows] = useState(() => {
    const planned = new Map((shift.plan?.members ?? []).map((m) => [m.user_id, m.takes_over_from ?? '']));
    return Object.fromEntries(
      crew.map((c) => [c.user_id, { on: shift.plan ? planned.has(c.user_id) : c.shift_id === shift.shift_id, from: planned.get(c.user_id) ?? '' }]),
    );
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prev = shift.previous;
  const onShift = new Set(Object.keys(rows).filter((id) => rows[id].on));
  // Who handed over to this shift: the previous plan, or the people rostered on that shift.
  const handingOver = new Set(!prev ? [] : prev.planned ? prev.members : crew.filter((c) => c.shift_id === prev.shift_id).map((c) => c.user_id));

  function toggle(userId, on) {
    setRows((current) => {
      const next = { ...current, [userId]: { ...current[userId], on } };
      // Nobody takes over from someone on their own shift.
      if (on) for (const id of Object.keys(next)) if (next[id].from === userId) next[id] = { ...next[id], from: '' };
      return next;
    });
  }

  async function save(members) {
    setSaving(true);
    setError('');
    try {
      await api.saveShiftPlan(shift.date, shift.shift_id, members);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t save the plan. Try again.'));
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    save(crew.filter((c) => rows[c.user_id].on).map((c) => ({ user_id: c.user_id, takes_over_from: rows[c.user_id].from || null })));
  }

  if (!crew.length) {
    return (
      <div className="stack">
        <p className="field-hint">There are no active ground crew to plan yet.</p>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  const candidates = (userId) => crew.filter((c) => c.user_id !== userId && !onShift.has(c.user_id));
  return (
    <form className="plan-editor" onSubmit={submit} aria-label={`Plan the ${shiftLabel({ name: shift.name, start: shift.start })}`}>
      <p className="field-hint">
        Tick who works this shift. For each person you can choose who they take over from; with “Anyone”, they share the handovers
        that have no named relief, least busy first.
      </p>
      <ul className="plan-editor__rows">
        {crew.map((c) => {
          const row = rows[c.user_id];
          const options = candidates(c.user_id);
          const before = options.filter((o) => handingOver.has(o.user_id));
          const others = options.filter((o) => !handingOver.has(o.user_id));
          return (
            <li key={c.user_id} className={`plan-editor__row ${row.on ? 'plan-editor__row--on' : ''}`}>
              <label className="check">
                <input type="checkbox" checked={row.on} onChange={(e) => toggle(c.user_id, e.target.checked)} />
                <span>
                  {c.full_name}
                  <span className="field-hint"> {rosterLabel(c.shift_id) ?? 'Not rostered'}</span>
                </span>
              </label>
              <label className="inline-field plan-editor__from">
                <span>Takes over from</span>
                <select
                  className="select"
                  value={row.from}
                  disabled={!row.on}
                  onChange={(e) => setRows((current) => ({ ...current, [c.user_id]: { ...current[c.user_id], from: e.target.value } }))}
                  aria-label={`Who ${c.full_name} takes over from`}
                  autoComplete="off"
                >
                  <option value="">Anyone</option>
                  {before.length > 0 && (
                    <optgroup label={`${shiftTitle(prev.name)} before this`}>
                      {before.map((o) => (
                        <option key={o.user_id} value={o.user_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label="Others">
                      {others.map((o) => (
                        <option key={o.user_id} value={o.user_id}>
                          {o.full_name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="plan-editor__actions" aria-live="polite">
        {error && <span className="field-error">{error}</span>}
        {shift.plan && (
          <button type="button" className="btn btn-ghost" onClick={() => save([])} disabled={saving}>
            Clear plan, use the roster
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || onShift.size === 0}>
          {saving ? 'Saving…' : 'Save plan'}
          {!saving && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
