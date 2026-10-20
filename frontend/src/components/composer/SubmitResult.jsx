import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, WarningOctagon, X } from '@phosphor-icons/react';
import { CategoryBadge } from '../ui/Badges';
import { ConfidenceMeter } from '../ui/ConfidenceMeter';
import { EntityGroups } from '../report/EntityGroups';
import { formatPercent, formatTime, needsReview, parseConfidence } from '../../utils/format';

/** What the model made of the handover just submitted. `report` is the full report detail. */
export function SubmitResult({ report, onDismiss }) {
  const ref = useRef(null);
  const low = needsReview(report);
  const confidence = parseConfidence(report);

  // Move focus to the result so screen reader and keyboard users land on it.
  useEffect(() => {
    ref.current?.focus();
  }, [report.report_id]);

  return (
    <section className="result" aria-labelledby="result-title" tabIndex={-1} ref={ref}>
      <div className="result__head">
        <h2 id="result-title" className="result__title">
          <CheckCircle size={20} weight="fill" aria-hidden="true" />
          Handover submitted
          <span className="result__time num">{formatTime(report.generated_at)}</span>
        </h2>
        {onDismiss && (
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Dismiss result">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="result__row">
        <CategoryBadge name={report.category_name} />
        <ConfidenceMeter report={report} />
      </div>

      {low && (
        <p className="notice notice--critical">
          <WarningOctagon size={18} weight="fill" aria-hidden="true" />
          <span>
            The system is not sure about this one
            {confidence !== null ? ` (${formatPercent(confidence)} confident)` : ''}. Please double-check the
            category and the details below, and tell your supervisor if they are wrong.
          </span>
        </p>
      )}

      <p className="result__summary">{report.summary || 'No summary was generated.'}</p>

      <EntityGroups entities={report.entities} />

      <div className="result__foot">
        <span className="field-hint">A task and an alert were raised for the next crew.</span>
        <Link to={`/reports/${report.report_id}`} className="btn btn-ghost">
          Open full report
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
