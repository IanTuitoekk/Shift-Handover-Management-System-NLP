import { useEffect, useRef, useState } from 'react';
import { Microphone, PaperPlaneTilt, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { LANGUAGE_VARIANTS } from '../../config';
import { draftStore, submissionStore } from '../../utils/deviceStore';
import { errorMessage, formatTime, shiftAt } from '../../utils/format';
import { CompletenessHints } from './CompletenessHints';
import { SubmitResult } from './SubmitResult';

const SAVE_DELAY_MS = 600;

function initialDraft(userId) {
  const saved = userId ? draftStore.load(userId) : null;
  return {
    text: saved?.text ?? '',
    shift: saved?.shift ?? shiftAt().name,
    language: saved?.language ?? 'mixed',
    savedAt: saved?.savedAt ?? null,
  };
}

/**
 * The handover composer. Used as the hero on the ground crew home and inside a dialog for
 * supervisors (`variant="dialog"`). The draft is saved per user in this browser so a reload,
 * a dropped connection or a logout does not lose it.
 */
export function Composer({ userId, variant = 'hero', onSubmitted, titleId = 'composer-title' }) {
  const [draft, setDraft] = useState(() => initialDraft(userId));
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultWarning, setResultWarning] = useState('');
  const textRef = useRef(null);
  const dirty = useRef(false);

  // Persist the draft shortly after typing stops.
  useEffect(() => {
    if (!userId || !dirty.current) return;
    const id = setTimeout(() => {
      if (draft.text.trim()) {
        const savedAt = new Date().toISOString();
        if (draftStore.save(userId, { ...draft, savedAt })) setDraft((d) => ({ ...d, savedAt }));
      } else {
        draftStore.clear(userId);
      }
      dirty.current = false;
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [draft, userId]);

  function update(patch) {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const text = draft.text.trim();
    setFormError('');
    setResultWarning('');
    if (!text) {
      setFieldError('Write the handover before submitting.');
      textRef.current?.focus();
      return;
    }
    setFieldError('');
    setSubmitting(true);
    try {
      const created = await api.submitHandover({
        narrative_text: text,
        input_type: 'text',
        shift: draft.shift,
        language_variant: draft.language,
      });
      const reportId = created.report.report_id;
      // The create response has no category name; the detail endpoint has everything.
      let detail;
      try {
        detail = await api.getReport(reportId);
      } catch {
        detail = { ...created.report, entities: created.entities ?? [], category_name: null };
        setResultWarning('Submitted, but the full result could not be loaded. Open the report to see it.');
      }
      if (userId) {
        submissionStore.add(userId, {
          reportId,
          at: detail.generated_at ?? new Date().toISOString(),
          category: detail.category_name,
          confidence: detail.category_confidence,
        });
        draftStore.clear(userId);
      }
      dirty.current = false;
      setDraft((d) => ({ ...d, text: '', savedAt: null }));
      setResult(detail);
      onSubmitted?.(detail);
    } catch (err) {
      setFormError(
        err.response?.status === 500
          ? 'The handover couldn’t be processed. Your text is still here and saved as a draft, so try again. If it keeps failing, the analysis service may be down.'
          : errorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`composer composer--${variant}`}>
      <form className="composer__form" onSubmit={handleSubmit} noValidate>
        {variant === 'hero' && (
          <h2 id={titleId} className="composer__title">
            New handover
          </h2>
        )}

        <div className="composer__input">
          <div className="field">
            <label className="field-label" htmlFor={`${titleId}-text`}>
              What does the next crew need to know?
            </label>
            <textarea
              ref={textRef}
              id={`${titleId}-text`}
              name="narrative_text"
              className="textarea composer__textarea"
              autoComplete="off"
              placeholder="e.g. 5Y-KZD left main gear tyre worn past limits at stand 7. Replacement ordered, engineer to fit before 06:00…"
              value={draft.text}
              onChange={(e) => update({ text: e.target.value })}
              aria-invalid={fieldError ? 'true' : undefined}
              aria-describedby={fieldError ? `${titleId}-error` : undefined}
            />
            {fieldError && (
              <p className="field-error" id={`${titleId}-error`}>
                {fieldError}
              </p>
            )}
          </div>
          {/* Reserved for voice input (not built yet). */}
          <div className="composer__mic">
            <button type="button" className="mic-slot" disabled aria-describedby={`${titleId}-mic-note`}>
              <Microphone size={22} aria-hidden="true" />
              <span className="visually-hidden">Voice input</span>
            </button>
            <span id={`${titleId}-mic-note`} className="mic-slot__note">
              Voice input coming soon
            </span>
          </div>
        </div>

        <CompletenessHints text={draft.text} />

        <div className="composer__controls">
          <div className="field composer__select">
            <label className="field-label" htmlFor={`${titleId}-shift`}>
              Shift
            </label>
            <select
              id={`${titleId}-shift`}
              className="select"
              value={draft.shift}
              onChange={(e) => update({ shift: e.target.value })}
              autoComplete="off"
            >
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </div>
          <div className="field composer__select">
            <label className="field-label" htmlFor={`${titleId}-language`}>
              Language
            </label>
            <select
              id={`${titleId}-language`}
              className="select"
              value={draft.language}
              onChange={(e) => update({ language: e.target.value })}
              autoComplete="off"
            >
              {LANGUAGE_VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <span className="composer__saved num" aria-live="polite">
            {draft.savedAt && draft.text.trim() ? `Draft saved ${formatTime(draft.savedAt)}` : ''}
          </span>
          <button type="submit" className="btn btn-primary composer__submit" disabled={submitting}>
            <PaperPlaneTilt size={18} aria-hidden="true" />
            {submitting ? 'Submitting…' : 'Submit handover'}
          </button>
        </div>

        <div aria-live="polite">
          {submitting && (
            <p className="field-hint" role="status">
              Analysing the narrative. This can take a few seconds…
            </p>
          )}
          {formError && (
            <p className="notice notice--critical" role="alert">
              <WarningOctagon size={18} weight="fill" aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}
          {resultWarning && <p className="notice">{resultWarning}</p>}
        </div>
      </form>

      {result && <SubmitResult report={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}
