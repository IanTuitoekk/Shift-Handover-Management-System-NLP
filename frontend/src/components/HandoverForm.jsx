import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, PaperPlaneTilt, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../api/client';
import { LANGUAGE_VARIANTS } from '../config';
import { errorMessage } from '../utils/format';

export function HandoverForm({ defaultShift, onSubmitted }) {
  const [narrative, setNarrative] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const narrativeRef = useRef(null);

  // Warn before leaving the page with an unsent handover.
  useEffect(() => {
    if (!narrative.trim()) return;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [narrative]);

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = narrative.trim();

    setResult(null);
    setFormError('');
    if (!text) {
      setFieldError('Describe the handover before submitting.');
      narrativeRef.current?.focus();
      return;
    }
    setFieldError('');

    setSubmitting(true);
    try {
      const created = await api.submitHandover({
        narrative_text: text,
        input_type: 'text',
        shift: data.get('shift'),
        language_variant: data.get('language_variant'),
      });
      setNarrative('');
      setResult({ reportId: created.report.report_id, summary: created.report.summary });
      onSubmitted?.();
    } catch (err) {
      setFormError(
        err.response?.status === 500
          ? 'The handover couldn’t be processed. Your text is still here, so try again. If it keeps failing, the analysis service may be down.'
          : errorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="handover-form-title">
      <div className="panel-header">
        <h2 id="handover-form-title" className="panel-title">
          New Handover
        </h2>
      </div>

      <form className="panel-body handover-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="narrative">
            What does the next crew need to know?
          </label>
          <textarea
            ref={narrativeRef}
            id="narrative"
            name="narrative_text"
            className="textarea"
            rows={6}
            autoComplete="off"
            placeholder="e.g. 5Y-KZD left main gear tyre worn past limits, replacement ordered, aircraft on stand 7…"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            aria-invalid={fieldError ? 'true' : undefined}
            aria-describedby={fieldError ? 'narrative-hint narrative-error' : 'narrative-hint'}
          />
          <p className="field-hint" id="narrative-hint">
            Write in English, Swahili or a mix. Include aircraft registrations, components and locations.
          </p>
          {fieldError && (
            <p className="field-error" id="narrative-error">
              {fieldError}
            </p>
          )}
        </div>

        <div className="handover-form-row">
          <div className="field">
            <label className="field-label" htmlFor="shift">
              Shift
            </label>
            <select id="shift" name="shift" className="select" defaultValue={defaultShift} autoComplete="off">
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="language">
              Language
            </label>
            <select id="language" name="language_variant" className="select" defaultValue="mixed" autoComplete="off">
              {LANGUAGE_VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div aria-live="polite">
          {submitting && (
            <p className="field-hint" role="status">
              Analysing the narrative. This can take a few seconds…
            </p>
          )}
          {formError && (
            <p className="alert alert-critical" role="alert">
              <WarningOctagon size={18} weight="fill" aria-hidden="true" />
              {formError}
            </p>
          )}
          {result && (
            <div className="alert alert-success">
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              <p>
                Handover submitted. A task and alert have been raised.{' '}
                <Link to={`/reports/${result.reportId}`}>View the Report</Link>
              </p>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          <PaperPlaneTilt size={16} aria-hidden="true" />
          {submitting ? 'Submitting…' : 'Submit Handover'}
        </button>
      </form>
    </section>
  );
}
