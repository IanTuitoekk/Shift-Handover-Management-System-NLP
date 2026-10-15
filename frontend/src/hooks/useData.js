import { useEffect, useState } from 'react';
import { REPORTS_CHANGED } from './useRealtime';
import { api } from '../api/client';
import { REFRESH_MS } from '../config';
import { useInterval, useResource } from './useResource';

/** Reloads a resource whenever the real-time push says a new report exists. */
function useReloadOnNewReport(reload) {
  useEffect(() => {
    window.addEventListener(REPORTS_CHANGED, reload);
    return () => window.removeEventListener(REPORTS_CHANGED, reload);
  }, [reload]);
}

/**
 * The first `count` reports matching `filters` (GET /api/handovers parameters), fetched in pages
 * of 100. Returns the last page's totals: { reports, total, needs_review, shift_counts }.
 */
async function fetchReports(filters, count) {
  const reports = [];
  let page;
  do {
    page = await api.listReports({ ...filters, limit: Math.min(100, count - reports.length), offset: reports.length });
    reports.push(...page.reports);
  } while (page.reports.length > 0 && reports.length < Math.min(count, page.total));
  return { ...page, reports };
}

/** A filtered report list, kept fresh. Pass `null` filters to skip. */
export function useReportList(filters, count) {
  const key = filters ? `reports:${JSON.stringify(filters)}:${count}` : null;
  const resource = useResource(key, () => fetchReports(filters, count));
  useReloadOnNewReport(resource.reload);
  useInterval(resource.reload, REFRESH_MS);
  return resource;
}

/** The signed-in user's own handovers (GET /api/handovers?submitted_by=me), newest first. */
export function useMyReports() {
  const resource = useResource('reports:mine', () => api.listReports({ limit: 100, offset: 0, submittedBy: 'me' }));
  useReloadOnNewReport(resource.reload);
  return resource;
}

/** Counts for the supervisor overview (GET /api/stats/overview). */
export function useOverviewStats(shifts) {
  const resource = useResource(`stats:overview:${shifts}`, () => api.overviewStats(shifts));
  useReloadOnNewReport(resource.reload);
  useInterval(resource.reload, REFRESH_MS);
  return resource;
}

/** Aircraft and components mentioned in more than one report since `since` (ISO). */
export function useRecurringEntities(since) {
  const resource = useResource(`insights:entities:${since}`, () =>
    api.recurringEntities({ types: 'AIRCRAFT,COMPONENT', since, min_reports: 2, limit: 6 }),
  );
  useReloadOnNewReport(resource.reload);
  return resource;
}

/** Per-person counts since `since` (ISO), supervisors only (GET /api/users/workload). */
export function useWorkload(since) {
  const resource = useResource(since ? `users:workload:${since}` : null, () => api.workload(since));
  useReloadOnNewReport(resource.reload);
  return resource;
}

/** A clock that ticks every minute, for shift windows and ages. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), intervalMs);
  return now;
}
