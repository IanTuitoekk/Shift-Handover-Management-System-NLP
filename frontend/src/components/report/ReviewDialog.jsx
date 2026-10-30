import { useRef, useState } from 'react';
import { Plus, TextAa, Trash, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { KNOWN_CATEGORIES, categoryMeta } from '../../utils/categories';
import { errorMessage } from '../../utils/format';

const ENTITY_TYPE_OPTIONS = [
  { type: 'AIRCRAFT', label: 'Aircraft' },
  { type: 'COMPONENT', label: 'Component' },
  { type: 'LOCATION', label: 'Location' },
  { type: 'ROLE', label: 'Role' },
  { type: 'TASK', label: 'Task' },
  { type: 'TIME', label: 'Time' },
];

let nextId = 0;
const row = (type, text) => ({ id: ++nextId, type, text });

/**
 * Supervisor review of the model's analysis: confirm or correct the category and the entities.
 * Each entity must be words from the original handover (the server checks the same), so reviewed
 * reports can be used as training data.
 */
export function ReviewDialog({ report, open, onClose, onSaved }) {
  const original = report.submission?.content ?? '';
  const [category, setCategory] = useState(report.category_name ?? KNOWN_CATEGORIES[0]);
  const [rows, setRows] = useState(() => (report.entities ?? []).map((e) => row(e.entity_type, e.entity_text)));
  const [selection, setSelection] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);

  const inText = (text) => !text.trim() || original.toLowerCase().includes(text.trim().replace(/\s+/g, ' ').toLowerCase());
  const problems = rows.filter((r) => !r.text.trim() || !inText(r.text));

  const update = (id, patch) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => setRows((list) => list.filter((r) => r.id !== id));
  const add = (type = 'COMPONENT', text = '') => setRows((list) => [...list, row(type, text)]);

  // Text selected inside the original handover can be added as an entity in one click.
  function captureSelection() {
    const sel = window.getSelection();
    const inside = sel && textRef.current && sel.anchorNode && textRef.current.contains(sel.anchorNode);
    setSelection(inside ? sel.toString().trim() : '');
  }

  async function save(event) {
    event.preventDefault();
    if (problems.length) {
      setError('Every entity needs words that appear in the handover text. Fix or remove the ones marked below.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const updated = await api.reviewReport(report.report_id, {
        category_name: category,
        entities: rows.map((r) => ({ type: r.type, text: r.text.trim() })),
      });
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Review analysis" titleId="review-title" wide>
      <form className="review" onSubmit={save} noValidate>
        <p className="field-hint">
          Confirm or correct what the model found. Your version replaces it everywhere (reports, filters, insights); the
          model’s original answer is kept for comparison and training.
        </p>

        <div className="review__original">
          <p className="field-label" id="review-original-label">
            Original handover <span className="field-hint">(select words to add them as an entity)</span>
          </p>
          <p className="review__text" ref={textRef} onMouseUp={captureSelection} onKeyUp={captureSelection} aria-labelledby="review-original-label">
            {original}
          </p>
          {selection && (
            <button type="button" className="btn btn-secondary review__add-selection" onClick={() => { add('COMPONENT', selection); setSelection(''); }}>
              <TextAa size={16} aria-hidden="true" />
              Add “{selection.length > 40 ? `${selection.slice(0, 40)}…` : selection}” as an entity
            </button>
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="review-category">
            Category
          </label>
          <select id="review-category" className="select" value={category} onChange={(e) => setCategory(e.target.value)} autoComplete="off">
            {KNOWN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryMeta(c).label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="review__entities">
          <legend className="field-label">Entities</legend>
          {rows.length === 0 && <p className="field-hint">No entities. Add the aircraft, components, places, people, tasks and times the handover mentions.</p>}
          <ul className="review__rows">
            {rows.map((r, i) => {
              const bad = !r.text.trim() ? 'Enter the words' : !inText(r.text) ? 'Not in the handover text' : '';
              return (
                <li key={r.id} className="review__row">
                  <select
                    className="select"
                    value={r.type}
                    onChange={(e) => update(r.id, { type: e.target.value })}
                    aria-label={`Type of entity ${i + 1}`}
                    autoComplete="off"
                  >
                    {ENTITY_TYPE_OPTIONS.map((o) => (
                      <option key={o.type} value={o.type}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={r.text}
                    onChange={(e) => update(r.id, { text: e.target.value })}
                    aria-label={`Words of entity ${i + 1}`}
                    aria-invalid={bad ? 'true' : undefined}
                    aria-describedby={bad ? `review-row-${r.id}-error` : undefined}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" className="icon-btn" onClick={() => remove(r.id)} aria-label={`Remove entity ${i + 1}`} title="Remove">
                    <Trash size={18} aria-hidden="true" />
                  </button>
                  {bad && (
                    <p className="field-error review__row-error" id={`review-row-${r.id}-error`}>
                      {bad}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-ghost" onClick={() => add()}>
            <Plus size={16} aria-hidden="true" />
            Add entity
          </button>
        </fieldset>

        <div aria-live="polite">
          {error && (
            <p className="notice notice--critical" role="alert">
              <WarningOctagon size={18} weight="fill" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>

        <div className="review__actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save review'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
