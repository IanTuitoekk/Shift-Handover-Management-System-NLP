import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardText, FunnelSimple } from '@phosphor-icons/react';
import { useShell } from '../components/shell/ShellContext';
import { PageHeader, Section, EmptyState, ErrorState } from '../components/ui/Layout';
import { StripList, StripSkeleton } from '../components/ui/Strip';
import { ReportStrip } from '../components/report/ReportStrip';
import { useAllReports } from '../hooks/useData';
import { ShiftFilter } from '../components/ui/ShiftFilter';
import { matchesShift, shiftCounts, useShiftParam } from '../hooks/useShiftParam';
import { KNOWN_CATEGORIES, categoryMeta } from '../utils/categories';
import { needsReview, parseConfidence, shiftAt, shiftLabel } from '../utils/format';
import { LOW_CONFIDENCE_THRESHOLD } from '../config';

const PAGE = 40;

const CONFIDENCE_RANGES = {
  all: { label: 'Any confidence', test: () => true },
  low: { label: 'Below 60% (check)', test: (r) => needsReview(r) },
  mid: { label: '60% to 79%', test: (r) => !needsReview(r) && parseConfidence(r) < 0.8 },
  high: { label: '80% and above', test: (r) => !needsReview(r) && parseConfidence(r) >= 0.8 },
};

const DATE_RANGES = {
  all: 'Any time',
  shift: 'This shift',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  custom: 'Custom dates',
};

function dateTest(range, from, to, now) {
  const t = now.getTime();
  if (range === 'shift') {
    const s = shiftAt(now);
    return (r) => new Date(r.generated_at) >= s.start;
  }
  if (range === '24h') return (r) => t - new Date(r.generated_at) <= 86_400_000;
  if (range === '7d') return (r) => t - new Date(r.generated_at) <= 7 * 86_400_000;
  if (range === 'custom') {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;
    return (r) => {
      const d = new Date(r.generated_at);
      return (!start || d >= start) && (!end || d <= end);
    };
  }
  return () => true;
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
  const reportsRes = useAllReports();
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
  const all = useMemo(() => reportsRes.data?.reports ?? [], [reportsRes.data]);
  const filtered = useMemo(() => {
    const inShift = all.filter((r) => matchesShift(r, shift));
    if (!supervisor) return inShift;
    const byDate = dateTest(date, from, to, now);
    return inShift.filter(
      (r) =>
        (category === 'all' || (category === 'unclassified' ? !r.category_name : r.category_name === category)) &&
        CONFIDENCE_RANGES[confidence].test(r) &&
        (submitter === 'all' || r.submitted_by?.user_id === submitter) &&
        byDate(r),
    );
  }, [all, shift, supervisor, category, confidence, submitter, date, from, to, now]);

  const shown = filtered.slice(0, limit);
  const groups = groupByShift(shown);
  const activeFilters =
    shift !== 'all' || (supervisor && (category !== 'all' || confidence !== 'all' || submitter !== 'all' || date !== 'all'));
  const lowCount = all.filter(needsReview).length;

  return (
    <>
      <PageHeader
        title="Reports"
        sub={
          reportsRes.data ? (
            <>
              {activeFilters ? (
                <>
                  <span className="num">{filtered.length}</span> of <span className="num">{all.length}</span> reports match
                </>
              ) : (
                <>
                  <span className="num">{all.length}</span> reports, <span className="num">{lowCount}</span> below{' '}
                  {Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% confidence
                </>
              )}
              {reportsRes.data.capped && <>. Showing the latest {all.length} of {reportsRes.data.total}</>}
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

      <ShiftFilter shift={shift} onChange={setShift} counts={reportsRes.data ? shiftCounts(all) : undefined} />

      <div className="narrow narrow--wide">
        {reportsRes.data === undefined && !reportsRes.error && <StripSkeleton rows={6} />}
        {reportsRes.error && !reportsRes.data && <ErrorState message="Couldn’t load reports." onRetry={reportsRes.reload} />}
        {reportsRes.data && filtered.length === 0 && (
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
        {filtered.length > shown.length && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown.length)} more
          </button>
        )}
      </div>
    </>
  );
}
