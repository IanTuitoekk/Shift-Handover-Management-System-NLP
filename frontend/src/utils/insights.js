/* Client-side aggregations for the supervisor views. All inputs come from existing endpoints. */

import { KNOWN_CATEGORIES } from './categories';
import { inShift, isOverdue, needsReview, parseConfidence, recentShifts } from './format';

export function categoryMix(reports) {
  const counts = new Map(KNOWN_CATEGORIES.map((name) => [name, 0]));
  let unclassified = 0;
  for (const r of reports) {
    if (!r.category_name) unclassified += 1;
    else counts.set(r.category_name, (counts.get(r.category_name) ?? 0) + 1);
  }
  const rows = [...counts].map(([name, value]) => ({ key: name, name, value }));
  if (unclassified) rows.push({ key: 'unclassified', name: null, value: unclassified });
  return rows.sort((a, b) => b.value - a.value);
}

/** Report counts for the last `count` shifts, oldest first. */
export function reportsPerShift(reports, count, now = new Date()) {
  return recentShifts(count, now).map((shift) => ({
    shift,
    value: reports.filter((r) => inShift(r.generated_at, shift)).length,
    lowConfidence: reports.filter((r) => inShift(r.generated_at, shift) && needsReview(r)).length,
  }));
}

/** Reports per hour across a window, for the shift rail. */
export function reportsPerHour(reports, start, end) {
  const hours = Math.round((end - start) / 3600000);
  const buckets = new Array(hours).fill(0);
  for (const r of reports) {
    const idx = Math.floor((new Date(r.generated_at) - start) / 3600000);
    if (idx >= 0 && idx < hours) buckets[idx] += 1;
  }
  return buckets;
}

/** Most frequent entity texts of the given types across report details. */
export function recurringEntities(details, types = ['AIRCRAFT', 'COMPONENT'], limit = 6) {
  const counts = new Map();
  for (const d of details) {
    const seen = new Set();
    for (const e of d.entities ?? []) {
      if (!types.includes(e.entity_type)) continue;
      const text = e.entity_text.trim();
      const key = `${e.entity_type}:${text.toLowerCase()}`;
      if (seen.has(key)) continue; // count reports, not mentions
      seen.add(key);
      const entry = counts.get(key) ?? { key, type: e.entity_type, text, reports: 0 };
      entry.reports += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].filter((e) => e.reports > 1).sort((a, b) => b.reports - a.reports).slice(0, limit);
}

/** Open (pending) tasks per person, including people with none. */
export function workload(users, tasks, now = Date.now()) {
  const pending = tasks.filter((t) => t.status === 'pending');
  return users
    .map((u) => {
      const mine = pending.filter((t) => t.assigned_to === u.user_id);
      return {
        user: u,
        open: mine.length,
        overdue: mine.filter((t) => isOverdue(t, now)).length,
      };
    })
    .sort((a, b) => b.open - a.open || a.user.full_name.localeCompare(b.user.full_name));
}

/** The least-loaded person (ground crew preferred), for assignment suggestions. */
export function leastLoaded(users, tasks) {
  const rows = workload(users, tasks);
  const pool = rows.filter((r) => r.user.role === 'ground_crew');
  const candidates = pool.length ? pool : rows;
  return candidates.reduce((best, r) => (!best || r.open < best.open ? r : best), null);
}

/** Lowest confidence first; unscored reports first of all. */
export function reviewOrder(reports) {
  return [...reports].sort((a, b) => (parseConfidence(a) ?? -1) - (parseConfidence(b) ?? -1));
}
