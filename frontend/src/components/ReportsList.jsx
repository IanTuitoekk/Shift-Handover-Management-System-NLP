import { Link } from 'react-router-dom';
import { ArrowClockwise, CaretLeft, CaretRight, ClipboardText } from '@phosphor-icons/react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { formatDateTime, formatDay, formatTime, isToday, needsReview } from '../utils/format';

export function ReportsList({ data, loading, error, page, pageSize, onPageChange, onRefresh }) {
  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);
  const initialLoad = loading && data === undefined;

  return (
    <section className="panel reports" aria-labelledby="reports-title">
      <div className="panel-header">
        <h2 id="reports-title" className="panel-title">
          Handover Reports
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <ArrowClockwise size={16} aria-hidden="true" className={loading ? 'spin' : undefined} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="panel-body" aria-live="polite">
          <p className="alert alert-critical" role="alert">
            Couldn’t load reports. Check your connection, then select Refresh.
          </p>
        </div>
      )}

      {initialLoad && (
        <ul className="report-list" aria-label="Loading reports…" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="report-row report-row-skeleton">
              <span className="skeleton" style={{ height: '2.5rem', width: '3.5rem' }} />
              <span className="skeleton" style={{ height: '2.5rem' }} />
              <span className="skeleton" style={{ height: '1.25rem', width: '4rem' }} />
            </li>
          ))}
        </ul>
      )}

      {!initialLoad && !error && reports.length === 0 && (
        <div className="empty">
          <ClipboardText size={32} aria-hidden="true" />
          <strong>No handover reports yet</strong>
          <p>Submit the first handover of the shift using the form on this page.</p>
        </div>
      )}

      {reports.length > 0 && (
        <ol className="report-list" aria-busy={loading || undefined}>
          {reports.map((report) => {
            const flagged = needsReview(report);
            return (
              <li key={report.report_id}>
                <Link to={`/reports/${report.report_id}`} className={`report-row ${flagged ? 'report-row-flagged' : ''}`}>
                  <time className="report-time" dateTime={report.generated_at} title={formatDateTime(report.generated_at)}>
                    <span className="mono num">{formatTime(report.generated_at)}</span>
                    <span className="report-day">{isToday(report.generated_at) ? 'Today' : formatDay(report.generated_at)}</span>
                  </time>
                  <div className="report-main">
                    <span className="report-category">{report.category_name ?? 'Unclassified'}</span>
                    <p className="report-summary">{report.summary || 'No summary was generated for this report.'}</p>
                  </div>
                  <div className="report-badge">
                    <ConfidenceBadge report={report} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {total > pageSize && (
        <nav className="pagination" aria-label="Report pages">
          <p className="pagination-status num">
            {firstShown}-{lastShown} of {total}
          </p>
          <div className="pagination-buttons">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
            >
              <CaretLeft size={14} aria-hidden="true" />
              Newer
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount || loading}
            >
              Older
              <CaretRight size={14} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
