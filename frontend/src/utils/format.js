import { DAY_SHIFT_START, NIGHT_SHIFT_START, LOW_CONFIDENCE_THRESHOLD, OVERDUE_HOURS } from '../config';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const longDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

export const formatTime = (value) => timeFormat.format(new Date(value));
export const formatDay = (value) => dayFormat.format(new Date(value));
export const formatDateTime = (value) => fullFormat.format(new Date(value));
export const formatLongDate = (value) => longDateFormat.format(new Date(value));
export const formatPercent = (value) => percentFormat.format(value);

export function formatRelative(value, now = Date.now()) {
  const diffMinutes = Math.round((new Date(value).getTime() - now) / 60000);
  if (Math.abs(diffMinutes) < 60) return relativeFormat.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeFormat.format(diffHours, 'hour');
  return relativeFormat.format(Math.round(diffHours / 24), 'day');
}

export function isToday(value, now = new Date()) {
  return new Date(value).toDateString() === now.toDateString();
}

/** Returns { name, start } for the shift containing `now`. */
export function currentShift(now = new Date()) {
  const hour = now.getHours();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);

  if (hour >= DAY_SHIFT_START && hour < NIGHT_SHIFT_START) {
    start.setHours(DAY_SHIFT_START);
    return { name: 'Day', start };
  }

  start.setHours(NIGHT_SHIFT_START);
  if (hour < DAY_SHIFT_START) start.setDate(start.getDate() - 1);
  return { name: 'Night', start };
}

/** Confidence comes back from Postgres NUMERIC as a string. */
export function parseConfidence(report) {
  const value = parseFloat(report.category_confidence);
  return Number.isFinite(value) ? value : null;
}

export function needsReview(report) {
  const confidence = parseConfidence(report);
  return !report.category_name || confidence === null || confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function isOverdue(task, now = Date.now()) {
  return task.status === 'pending' && now - new Date(task.created_at).getTime() > OVERDUE_HOURS * 3600000;
}

export function firstName(fullName = '') {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function roleLabel(role) {
  return role ? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

/** Turns an axios error into a message that tells the user what to do next. */
export function errorMessage(err, fallback = 'Something went wrong. Try again.') {
  if (!err?.response) {
    return 'Can’t reach the handover server. Check your connection, or ask a supervisor whether the system is down.';
  }
  const { status, data } = err.response;
  if (data?.errors?.length) return data.errors.map((e) => e.msg).join('. ');
  if (data?.error) {
    if (status === 500) return `${data.error}. Try again in a moment.`;
    return data.error;
  }
  return fallback;
}
