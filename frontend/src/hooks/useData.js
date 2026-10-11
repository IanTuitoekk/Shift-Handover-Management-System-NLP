import { useEffect, useState } from 'react';
import { REPORTS_CHANGED } from './useRealtime';
import { api } from '../api/client';
import { INSIGHT_DETAIL_WINDOW, REFRESH_MS, REPORTS_FETCH_CAP } from '../config';
import { useInterval, useResource } from './useResource';

/** Pages through GET /api/handovers (100 per page) up to REPORTS_FETCH_CAP, newest first. */
async function fetchAllReports() {
  const all = [];
  let total = Infinity;
  while (all.length < Math.min(total, REPORTS_FETCH_CAP)) {
    const page = await api.listReports({ limit: 100, offset: all.length });
    total = page.total;
    all.push(...page.reports);
    if (page.reports.length === 0) break;
  }
  return { reports: all, total, capped: total > all.length };
}

export function useAllReports({ poll = true } = {}) {
  const resource = useResource('reports:all', fetchAllReports);
  const { reload } = resource;
  useInterval(reload, poll ? REFRESH_MS : 3_600_000);
  // Refetch as soon as the real-time push says a new report exists.
  useEffect(() => {
    window.addEventListener(REPORTS_CHANGED, reload);
    return () => window.removeEventListener(REPORTS_CHANGED, reload);
  }, [reload]);
  return resource;
}

/** The signed-in user's own handovers (GET /api/handovers?submitted_by=me), newest first. */
export function useMyReports() {
  const resource = useResource('reports:mine', () => api.listReports({ limit: 100, offset: 0, submittedBy: 'me' }));
  const { reload } = resource;
  useEffect(() => {
    window.addEventListener(REPORTS_CHANGED, reload);
    return () => window.removeEventListener(REPORTS_CHANGED, reload);
  }, [reload]);
  return resource;
}

/**
 * Entities are only on the detail endpoint, so recurring-entity insights fetch detail for the
 * most recent reports. Pass the report list; refetches when the newest report changes.
 */
export function useRecentReportDetails(reports) {
  const recent = (reports ?? []).slice(0, INSIGHT_DETAIL_WINDOW);
  const key = reports ? `details:${recent.length}:${recent[0]?.report_id ?? 'none'}` : null;
  return useResource(key, () =>
    Promise.allSettled(recent.map((r) => api.getReport(r.report_id))).then((results) =>
      results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    ),
  );
}

/** A clock that ticks every minute, for shift windows and ages. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), intervalMs);
  return now;
}
