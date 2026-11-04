import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, WarningOctagon, X } from '@phosphor-icons/react';
import { CategoryBadge } from '../ui/Badges';
import { ConfidenceMeter } from '../ui/ConfidenceMeter';
import { EntityGroups } from '../report/EntityGroups';
import { formatPercent, formatTime, needsReview, parseConfidence, personName, shiftTitle } from '../../utils/format';

/** Who the handover's task went to, and why (task.assigned_by_rule, see the backend's assignmentService). */
function assignedMessage(task, incoming) {
  const on = incoming ? `the ${shiftTitle(incoming)}` : 'the incoming shift';
  if (!task?.assignee) {
    return incoming
      ? `A task and an alert were raised. Nobody is planned or rostered on ${on} yet, so a supervisor will assign it.`
      : 'A task and an alert were raised. No shifts are set up, so a supervisor will assign it.';
  }
  const name = personName(task.assignee);
  if (task.assigned_by_rule === 'takes_over') return `A task was raised and assigned to ${name}, who takes over from you on ${on}. The crew was alerted.`;
  if (task.assigned_by_rule === 'shift_plan') return `A task was raised and assigned to ${name}, planned on ${on}. The crew was alerted.`;
  return `A task was raised and assigned to ${name} on ${on}, and the crew was alerted.`;
}

/** What the model made of the handover just submitted. `report` is the full report detail. */
export function SubmitResult({ report, onDismiss }) {
  const ref = useRef(null);
  const low = needsReview(report);
  const confidence = parseConfidence(report);
  // The shift after the one handing over, as the server decided (`assignment` from the submit response).
  const incoming = report.assignment?.shift?.name ?? null;

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
          {assignedMessage(report.task, incoming)}
        </span>
        <Link to={`/reports/${report.report_id}`} className="btn btn-ghost">
          Open full report
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
