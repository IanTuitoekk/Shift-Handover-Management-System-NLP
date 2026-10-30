import { Strip } from '../ui/Strip';
import { CategoryBadge, ReviewedBadge, SubmitterBadge } from '../ui/Badges';
import { ConfidenceMeter } from '../ui/ConfidenceMeter';
import { categoryMeta } from '../../utils/categories';
import { formatDay, isToday, needsReview } from '../../utils/format';

/** A handover report as a strip: category icon, time, summary, category badge, confidence meter. */
export function ReportStrip({ report, now, showDay = true, currentUserId }) {
  const low = needsReview(report);
  const meta = categoryMeta(report.category_name);
  return (
    <Strip
      tone={low ? 'critical' : 'neutral'}
      icon={meta.icon}
      iconLabel={low ? `${meta.label}, needs review` : meta.label}
      time={report.generated_at}
      timeSub={showDay ? <span className="age">{isToday(report.generated_at, now) ? 'Today' : formatDay(report.generated_at)}</span> : null}
      to={`/reports/${report.report_id}`}
      title={report.summary || 'No summary was generated for this report.'}
      meta={
        <>
          <CategoryBadge name={report.category_name} />
          <SubmitterBadge submittedBy={report.submitted_by} currentUserId={currentUserId} />
        </>
      }
      aside={report.reviewed_at ? <ReviewedBadge report={report} /> : <ConfidenceMeter report={report} />}
    />
  );
}
