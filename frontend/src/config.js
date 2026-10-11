// Operational settings for the frontend. Adjust these to match station policy.

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// Classifications below this confidence (0-1) are flagged for human review.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

// A pending task older than this many hours is shown as overdue.
export const OVERDUE_HOURS = 12;

// Shift boundaries in local time (24h clock). Day shift runs from
// DAY_SHIFT_START until NIGHT_SHIFT_START; night shift covers the rest.
export const DAY_SHIFT_START = 6;
export const NIGHT_SHIFT_START = 18;

// The backend caps one page of reports at 100; lists that need "everything"
// page through up to this many.
export const REPORTS_FETCH_CAP = 500;

// Recurring aircraft/components need entity data, which only the report detail
// endpoint returns, so insights fetch detail for this many recent reports.
export const INSIGHT_DETAIL_WINDOW = 30;

// How many past shifts the supervisor trend chart shows (including the current one).
export const TREND_SHIFTS = 6;

export const REFRESH_MS = 60_000;

// Tasks and alerts change while people work, so they refresh more often (and on tab focus).
// A WebSocket push from the backend would make this instant; see DESIGN.md "Real-time updates".
export const LIVE_REFRESH_MS = 15_000;

export const ROLES = [
  { value: 'ground_crew', label: 'Ground crew' },
  { value: 'supervisor', label: 'Supervisor' },
];

