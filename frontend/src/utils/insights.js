/* Task workload from the live task list (updated instantly by the real-time push). Report counts
   come from the server (GET /api/stats/overview, /api/users/workload). */

import { isOverdue } from './format';

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
