import { WarningOctagon } from '@phosphor-icons/react';
import { formatPercent, needsReview, parseConfidence } from '../utils/format';

export function ConfidenceBadge({ report }) {
  const confidence = parseConfidence(report);
  const label = confidence === null ? 'No score' : formatPercent(confidence);

  if (needsReview(report)) {
    return (
      <span className="badge badge-critical num" title="Low classification confidence. Check this report.">
        <WarningOctagon size={14} weight="fill" aria-hidden="true" />
        Needs Review, {label}
      </span>
    );
  }

  return (
    <span className="badge num" title="Classification confidence">
      <span className="visually-hidden">Confidence </span>
      {label}
    </span>
  );
}
