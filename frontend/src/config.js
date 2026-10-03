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

// How many recent reports the status tiles look at.
export const STATS_WINDOW = 100;

export const REPORTS_PAGE_SIZE = 20;

export const ROLES = [
  { value: 'ground_crew', label: 'Ground Crew' },
  { value: 'supervisor', label: 'Supervisor' },
];

export const LANGUAGE_VARIANTS = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Swahili' },
  { value: 'mixed', label: 'English & Swahili' },
];
