// Operational settings for the frontend. Adjust these to match station policy.

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

// Classifications below this confidence (0-1) are flagged for human review.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;


// Shift boundaries in local time (24h clock): day shift runs from `day` until `night`; night
// shift covers the rest. These are defaults; the app replaces them with the server's
// GET /api/config/shifts at start-up (setShiftHours), so frontend and backend always agree.
export const SHIFT_HOURS = { day: 6, night: 18 };
export function setShiftHours({ day_start_hour: day, night_start_hour: night }) {
  if (Number.isInteger(day) && Number.isInteger(night) && day < night) Object.assign(SHIFT_HOURS, { day, night });
}

// Recurring aircraft and components on the overview look back this many days.
export const INSIGHT_DAYS = 30;

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

