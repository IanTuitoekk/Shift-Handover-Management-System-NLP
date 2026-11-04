import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, NotePencil, PaperPlaneTilt, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../../api/client';
import { draftStore } from '../../utils/deviceStore';
import { errorMessage, formatTime, shiftAt } from '../../utils/format';
import { activeShifts } from '../../utils/shiftClock';
import { CompletenessHints } from './CompletenessHints';
import { SubmitResult } from './SubmitResult';
import { VoiceInput } from './VoiceInput';

const LANGUAGE_NAMES = { en: 'English', sw: 'Swahili', mixed: 'a mix of English and Swahili' };

const SAVE_DELAY_MS = 600;

function initialDraft(userId) {
  const saved = userId ? draftStore.load(userId) : null;
  return {
    text: saved?.text ?? '',
    // True once any of the text came from voice input; the handover is then saved as input_type 'voice'.
    voice: saved?.voice ?? false,
    // A shift id (older drafts saved the name, e.g. "Day"; validShift sorts that out).
    shift: saved?.shift ?? '',
    savedAt: saved?.savedAt ?? null,
  };
}

/** `value` if it is an active shift id (or an active shift's name), else the shift running now, else ''. */
function validShift(value) {
  const shifts = activeShifts();
  const match = shifts.find((s) => s.shift_id === value) ?? shifts.find((s) => s.name.toLowerCase() === String(value).toLowerCase());
  return match?.shift_id ?? shiftAt()?.shift_id ?? '';
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
  const [voiceError, setVoiceError] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [voiceState, setVoiceState] = useState('idle');
  // The text the last recording added, so "Record again" can swap just that part.
  const [lastVoice, setLastVoice] = useState(null);
  const voiceRef = useRef(null);
  const textRef = useRef(null);
  const latestText = useRef(draft.text);
  useEffect(() => {
    latestText.current = draft.text;
  }, [draft.text]);
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

  // Adds the transcript after any typed text (or, for "Record again", in place of the last
  // recording's text), then puts the cursor at the end for corrections.
  function addTranscript({ text, language }, context) {
    const current = latestText.current;
    const at = context?.replace ? current.lastIndexOf(context.replace) : -1;
    const next =
      at >= 0
        ? current.slice(0, at) + text + current.slice(at + context.replace.length)
        : current.trim()
          ? `${current.trimEnd()}\n${text}`
          : text;
    dirty.current = true;
    setVoiceError('');
    setFieldError('');
    setLastVoice(text);
    setDraft((d) => ({ ...d, voice: true, text: next }));
    setVoiceNote(
      `${at >= 0 ? 'Replaced your last recording with' : 'Added'} what you said${LANGUAGE_NAMES[language] ? ` (heard as ${LANGUAGE_NAMES[language]})` : ''}. Check it, especially the aircraft registration, and correct anything before submitting.`,
    );
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  // Offered while the last recording's words are still in the text, unedited.
  const canRecordAgain = Boolean(lastVoice) && draft.text.includes(lastVoice) && voiceState === 'idle' && !submitting;

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
        input_type: draft.voice ? 'voice' : 'text',
        // Without a shift (none set up) the server uses the shift covering now, if any.
        shift_id: validShift(draft.shift) || undefined,
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
        draftStore.clear(userId);
      }
      dirty.current = false;
      setDraft((d) => ({ ...d, text: '', voice: false, savedAt: null }));
      setVoiceNote('');
      setLastVoice(null);
      setResult({ ...detail, assignment: created.assignment ?? null });
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
          <div className="composer__lead">
            <span className="composer__lead-icon" aria-hidden="true">
              <NotePencil size={24} weight="duotone" />
            </span>
            <div>
              <h2 id={titleId} className="composer__title">
                New handover
              </h2>
              <p className="composer__lead-text">Handing over? Start here. It takes about a minute.</p>
            </div>
          </div>
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
              onChange={(e) => update(e.target.value.trim() ? { text: e.target.value } : { text: e.target.value, voice: false })}
              aria-invalid={fieldError ? 'true' : undefined}
              aria-describedby={fieldError ? `${titleId}-lang ${titleId}-error` : `${titleId}-lang`}
            />
            <p className="field-hint" id={`${titleId}-lang`}>
              Write or speak in English, Swahili or a mix. The language is detected automatically.
            </p>
            {voiceNote && !voiceError && <p className="field-hint composer__voice-note">{voiceNote}</p>}
            {canRecordAgain && (
              <button
                type="button"
                className="btn btn-secondary composer__redo"
                onClick={() => voiceRef.current?.start({ replace: lastVoice })}
                aria-describedby={`${titleId}-redo-hint`}
              >
                <ArrowCounterClockwise size={16} aria-hidden="true" />
                Record again
                <span id={`${titleId}-redo-hint`} className="visually-hidden">
                  Replaces only the text from your last recording
                </span>
              </button>
            )}
            {voiceError && (
              <p className="field-error" role="alert">
                {voiceError}
              </p>
            )}
            {fieldError && (
              <p className="field-error" id={`${titleId}-error`}>
                {fieldError}
              </p>
            )}
          </div>
          <VoiceInput
            ref={voiceRef}
            id={`${titleId}-mic`}
            onTranscript={addTranscript}
            onError={setVoiceError}
            onStateChange={setVoiceState}
            disabled={submitting}
          />
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
              value={validShift(draft.shift)}
              onChange={(e) => update({ shift: e.target.value })}
              autoComplete="off"
            >
              {activeShifts().length === 0 && <option value="">No shifts set up</option>}
              {activeShifts().map((s) => (
                <option key={s.shift_id} value={s.shift_id}>
                  {s.name}
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
