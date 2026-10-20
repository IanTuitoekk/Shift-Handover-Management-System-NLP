import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardText, FunnelSimple } from '@phosphor-icons/react';
import { useShell } from '../components/shell/ShellContext';
import { PageHeader, Section, EmptyState, ErrorState } from '../components/ui/Layout';
import { StripList, StripSkeleton } from '../components/ui/Strip';
import { ReportStrip } from '../components/report/ReportStrip';
import { useReportList } from '../hooks/useData';
import { ShiftFilter } from '../components/ui/ShiftFilter';
import { useShiftParam } from '../hooks/useShiftParam';
import { KNOWN_CATEGORIES, categoryMeta } from '../utils/categories';
import { shiftAt, shiftLabel } from '../utils/format';
import { LOW_CONFIDENCE_THRESHOLD } from '../config';

const PAGE = 40;

// Each range maps to GET /api/handovers parameters (the server does the filtering).
const CONFIDENCE_RANGES = {
  all: { label: 'Any confidence', params: {} },
  low: { label: 'Below 60% (check)', params: { review: true } },
  mid: { label: '60% to 79%', params: { review: false, max_confidence: 0.8 } },
  high: { label: '80% and above', params: { review: false, min_confidence: 0.8 } },
};

const DATE_RANGES = {
  all: 'Any time',
  shift: 'This shift',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  custom: 'Custom dates',
};

/** { from, to } (ISO) for a date range. Rolling ranges round to the minute so the query is stable. */
function dateParams(range, from, to, now) {
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  if (range === 'shift') return { from: shiftAt(now).start.toISOString() };
  if (range === '24h') return { from: new Date(minute - 86_400_000).toISOString() };
  if (range === '7d') return { from: new Date(minute - 7 * 86_400_000).toISOString() };
  if (range === 'custom') {
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1); // "to" includes the whole day
    return {
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
      ...(end ? { to: end.toISOString() } : {}),
    };
  }
  return {};
}

/** Groups reports (already newest first) by the shift they were processed in. */
function groupByShift(reports) {
  const groups = [];
  for (const r of reports) {
    const s = shiftAt(new Date(r.generated_at));
    const last = groups[groups.length - 1];
    if (last && last.shift.key === s.key) last.reports.push(r);
    else groups.push({ shift: s, reports: [r] });
  }
  return groups;
}

export function ReportsPage() {
  const { supervisor, now, me, users } = useShell();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);

  const category = params.get('category') ?? 'all';
  const confidence = CONFIDENCE_RANGES[params.get('confidence')] ? params.get('confidence') : 'all';
  const date = DATE_RANGES[params.get('date')] ? params.get('date') : 'all';
  const submitter = params.get('submitter') ?? 'all';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  function setParam(key, value, fallback = 'all') {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    if (key === 'date' && value !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  }

  const [shift, setShift] = useShiftParam();
  const filters = useMemo(
    () => ({
      ...(shift !== 'all' ? { shift } : {}),
      ...(supervisor
        ? {
            ...(category !== 'all' ? { category } : {}),
            ...CONFIDENCE_RANGES[confidence].params,
            ...(submitter !== 'all' ? { submitted_by: submitter } : {}),
            ...dateParams(date, from, to, now),
          }
        : {}),
    }),
    [shift, supervisor, category, confidence, submitter, date, from, to, now],
  );
  const reportsRes = useReportList(filters, limit);
  const list = reportsRes.data;
  const shown = list?.reports ?? [];
  const groups = groupByShift(shown);
  const activeFilters =
    shift !== 'all' || (supervisor && (category !== 'all' || confidence !== 'all' || submitter !== 'all' || date !== 'all'));
  const counts = list && { all: list.shift_counts.day + list.shift_counts.night, ...list.shift_counts };

  return (
    <>
      <PageHeader
        title="Reports"
        sub={
          list ? (
            <>
              <span className="num">{list.total}</span> {activeFilters ? 'matching reports' : 'reports'},{' '}
              <span className="num">{list.needs_review}</span> below {Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% confidence
            </>
          ) : (
            'Loading reports…'
          )
        }
      />

      {supervisor && (
        <form className="filters" aria-label="Filter reports" onSubmit={(e) => e.preventDefault()}>
          <FunnelSimple size={18} aria-hidden="true" className="filters__icon" />
          <label className="inline-field">
            <span>Category</span>
            <select className="select" value={category} onChange={(e) => setParam('category', e.target.value)} autoComplete="off">
              <option value="all">All categories</option>
              {KNOWN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta(c).label}
                </option>
              ))}
              <option value="unclassified">Unclassified</option>
            </select>
          </label>
          <label className="inline-field">
            <span>Confidence</span>
            <select className="select" value={confidence} onChange={(e) => setParam('confidence', e.target.value)} autoComplete="off">
              {Object.entries(CONFIDENCE_RANGES).map(([value, r]) => (
                <option key={value} value={value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>Submitted by</span>
            <select className="select" value={submitter} onChange={(e) => setParam('submitter', e.target.value)} autoComplete="off">
              <option value="all">Anyone</option>
              {(users?.data ?? []).map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.user_id === me.user_id ? `${u.full_name} (you)` : u.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>Date</span>
            <select className="select" value={date} onChange={(e) => setParam('date', e.target.value)} autoComplete="off">
              {Object.entries(DATE_RANGES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {date === 'custom' && (
            <>
              <label className="inline-field">
                <span>From</span>
                <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setParam('from', e.target.value, '')} />
              </label>
              <label className="inline-field">
                <span>To</span>
                <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setParam('to', e.target.value, '')} />
              </label>
            </>
          )}
          {activeFilters && (
            <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </button>
          )}
        </form>
      )}

      <ShiftFilter shift={shift} onChange={setShift} counts={counts} />

      <div className="narrow narrow--wide" aria-busy={reportsRes.loading || undefined}>
        {reportsRes.data === undefined && !reportsRes.error && <StripSkeleton rows={6} />}
        {reportsRes.error && !reportsRes.data && <ErrorState message="Couldn’t load reports." onRetry={reportsRes.reload} />}
        {list && list.total === 0 && (
          <EmptyState
            icon={ClipboardText}
            title={activeFilters ? 'No reports match these filters' : 'No reports yet'}
            action={
              activeFilters && (
                <button type="button" className="btn btn-secondary" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </button>
              )
            }
          >
            {activeFilters ? 'Try a wider date range or another category.' : 'Reports appear here as crews submit handovers.'}
          </EmptyState>
        )}
        {groups.map((g) => (
          <Section key={g.shift.key} id={`shift-${g.shift.start.getTime()}`} title={shiftLabel(g.shift)} count={g.reports.length}>
            <StripList>
              {g.reports.map((r) => (
                <ReportStrip key={r.report_id} report={r} now={now} showDay={false} currentUserId={me.user_id} />
              ))}
            </StripList>
          </Section>
        ))}
        {list && list.total > shown.length && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimit((l) => l + PAGE)} disabled={reportsRes.loading}>
            {reportsRes.loading ? 'Loading…' : `Show ${Math.min(PAGE, list.total - shown.length)} more`}
          </button>
        )}
      </div>
    </>
  );
}
