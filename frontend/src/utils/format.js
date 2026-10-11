import { DAY_SHIFT_START, NIGHT_SHIFT_START, LOW_CONFIDENCE_THRESHOLD } from '../config';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayDayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat();

export const formatTime = (value) => timeFormat.format(new Date(value));
export const formatDay = (value) => dayFormat.format(new Date(value));
export const formatWeekdayDay = (value) => weekdayDayFormat.format(new Date(value));
export const formatDateTime = (value) => fullFormat.format(new Date(value));
export const formatPercent = (value) => percentFormat.format(value);
export const formatNumber = (value) => numberFormat.format(value);

export function formatRelative(value, now = Date.now()) {
  const diffMinutes = Math.round((new Date(value).getTime() - now) / 60000);
  if (Math.abs(diffMinutes) < 60) return relativeFormat.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeFormat.format(diffHours, 'hour');
  return relativeFormat.format(Math.round(diffHours / 24), 'day');
}

/** Compact age for mono cells: "35m", "4h 10m", "2d 4h". */
export function formatAge(value, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function isToday(value, now = new Date()) {
  return new Date(value).toDateString() === now.toDateString();
}

/* Shifts ---------------------------------------------------------------- */

/** The shift containing `at`: { name: 'Day' | 'Night', start, end, key }. */
export function shiftAt(at = new Date()) {
  const now = new Date(at);
  const hour = now.getHours();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  let name;
  if (hour >= DAY_SHIFT_START && hour < NIGHT_SHIFT_START) {
    name = 'Day';
    start.setHours(DAY_SHIFT_START);
  } else {
    name = 'Night';
    start.setHours(NIGHT_SHIFT_START);
    if (hour < DAY_SHIFT_START) start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setHours(end.getHours() + (name === 'Day' ? NIGHT_SHIFT_START - DAY_SHIFT_START : 24 - (NIGHT_SHIFT_START - DAY_SHIFT_START)));
  return { name, start, end, key: `${name}-${start.toISOString()}` };
}

/** The shift before the one containing `at`. */
export function previousShift(at = new Date()) {
  return shiftAt(new Date(shiftAt(at).start.getTime() - 1));
}

/** The last `count` shifts, oldest first, ending with the current one. */
export function recentShifts(count, at = new Date()) {
  const shifts = [shiftAt(at)];
  while (shifts.length < count) shifts.unshift(previousShift(shifts[0].start));
  return shifts;
}

export function inShift(value, shift) {
  const t = new Date(value).getTime();
  return t >= shift.start.getTime() && t < shift.end.getTime();
}

/** "Night shift, Sat 10 Oct" style label for grouping. */
export function shiftLabel(shift) {
  return `${shift.name} shift, ${formatWeekdayDay(shift.start)}`;
}

/** The 24h operational day (DAY_SHIFT_START to DAY_SHIFT_START) containing `at`. */
export function operationalDay(at = new Date()) {
  const now = new Date(at);
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(DAY_SHIFT_START);
  if (now.getHours() < DAY_SHIFT_START) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/* Reports and tasks --------------------------------------------------------- */

/** Confidence comes back from Postgres NUMERIC as a string. */
export function parseConfidence(report) {
  const value = parseFloat(report?.category_confidence);
  return Number.isFinite(value) ? value : null;
}

export function needsReview(report) {
  const confidence = parseConfidence(report);
  return !report.category_name || confidence === null || confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** A pending task is overdue once its due time has passed. No due time means never overdue. */
export function isOverdue(task, now = Date.now()) {
  return task.status === 'pending' && Boolean(task.due_at) && new Date(now) > new Date(task.due_at);
}

/** Due-time state for display: { state: 'overdue' | 'soon' | 'due' | 'none', text }. */
export function dueInfo(task, now = Date.now()) {
  if (task.status !== 'pending' || !task.due_at) return { state: 'none', text: 'No due time' };
  const ms = new Date(task.due_at) - new Date(now);
  if (ms < 0) return { state: 'overdue', text: `Overdue by ${formatAge(task.due_at, now)}` };
  const due = new Date(task.due_at);
  const when = isToday(due, new Date(now)) ? formatTime(due) : formatDateTime(due);
  if (ms <= 2 * 3600000) return { state: 'soon', text: `Due ${when}` };
  return { state: 'due', text: `Due ${when}` };
}

/** Sort: overdue first, then soonest due, then tasks with no due time (oldest first). */
export function byDue(a, b, now = Date.now()) {
  const ao = isOverdue(a, now);
  const bo = isOverdue(b, now);
  if (ao !== bo) return ao ? -1 : 1;
  const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
  const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
  if (ad !== bd) return ad - bd;
  return new Date(a.created_at) - new Date(b.created_at);
}

const TASK_PREFIX = /^New (.+?) incident reported:\s*/i;

/** Task descriptions are generated as "New <category> incident reported: <summary>". */
export function taskSummary(task) {
  return (task?.description ?? '').replace(TASK_PREFIX, '').trim() || task?.description || '';
}

/** The category embedded in a generated task description, if any. */
export function taskCategory(task) {
  return (task?.description ?? '').match(TASK_PREFIX)?.[1] ?? null;
}

/** Category names come from the model in Title Case; labels in this UI are sentence case. */
export function sentenceCase(text = '') {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function firstName(fullName = '') {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function roleLabel(role) {
  if (!role) return '';
  const text = role.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
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
