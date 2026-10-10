import { WarningOctagon } from '@phosphor-icons/react';
import { LOW_CONFIDENCE_THRESHOLD } from '../../config';
import { formatPercent, parseConfidence } from '../../utils/format';

const SEGMENTS = 5;

/**
 * Segmented confidence meter: 5 segments + mono percentage. Below 60% the filled segments
 * turn critical red, a warning icon appears and the word "Check" is added, so the state
 * never relies on colour alone.
 */
export function ConfidenceMeter({ report, value, size = 'md', showLabel = true }) {
  const confidence = value !== undefined ? value : parseConfidence(report);
  const missingCategory = report && !report.category_name;
  const low = confidence === null || confidence < LOW_CONFIDENCE_THRESHOLD || missingCategory;
  const filled = confidence === null ? 0 : Math.max(1, Math.round(confidence * SEGMENTS));
  const percent = confidence === null ? 'No score' : formatPercent(confidence);

  return (
    <span
      className={`meter meter--${size} ${low ? 'meter--low' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={confidence === null ? undefined : Math.round(confidence * 100)}
      aria-label={`Classification confidence ${percent}${low ? ', check this classification' : ''}`}
      title={low ? 'Low confidence. Check this classification.' : 'Classification confidence'}
    >
      <span className="meter__bars" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={`meter__seg ${i < filled ? 'meter__seg--on' : ''}`} />
        ))}
      </span>
      {showLabel && (
        <span className="meter__label num" aria-hidden="true">
          {percent}
        </span>
      )}
      {low && (
        <span className="meter__flag" aria-hidden="true">
          <WarningOctagon size={14} weight="fill" />
          Check
        </span>
      )}
    </span>
  );
}
