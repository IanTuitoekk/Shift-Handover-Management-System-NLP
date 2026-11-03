import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, WarningOctagon, X } from '@phosphor-icons/react';
import { CategoryBadge } from '../ui/Badges';
import { ConfidenceMeter } from '../ui/ConfidenceMeter';
import { EntityGroups } from '../report/EntityGroups';
import { formatPercent, formatTime, needsReview, parseConfidence, personName } from '../../utils/format';

/** What the model made of the handover just submitted. `report` is the full report detail. */
export function SubmitResult({ report, onDismiss }) {
  const ref = useRef(null);
  const low = needsReview(report);
  const confidence = parseConfidence(report);
  const incoming = report.shift === 'night' ? 'day' : 'night'; // the shift after the one handing over

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
        <span className="field-hint">
          {report.task?.assignee
            ? `A task was raised and assigned to ${personName(report.task.assignee)} on the incoming ${incoming} shift, and the crew was alerted.`
            : `A task and an alert were raised. Nobody is rostered on the incoming ${incoming} shift yet, so a supervisor will assign it.`}
        </span>
        <Link to={`/reports/${report.report_id}`} className="btn btn-ghost">
          Open full report
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
