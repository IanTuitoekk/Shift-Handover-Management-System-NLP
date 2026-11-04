import { LOW_CONFIDENCE_THRESHOLD } from '../config';
import { findShift, operationalDays, shiftWindows } from './shiftClock';

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

/* Shifts ----------------------------------------------------------------
 * Shift windows come from the server (utils/shiftClock.js); nothing here works shift times out.
 * A window is { shift_id, name, start, end, key }. Null means no shift covers that moment.
 */

const withKey = (w) => w && { ...w, key: `${w.shift_id}:${w.start.getTime()}` };

/** The shift window covering `at`, or null ("No shift"). */
export function shiftAt(at = new Date()) {
  const t = new Date(at).getTime();
  return withKey(shiftWindows().find((w) => w.start.getTime() <= t && t < w.end.getTime()) ?? null);
}

/** The shift window before the one covering `at` (or before `at` itself, between shifts), or null. */
export function previousShift(at = new Date()) {
  const before = (shiftAt(at)?.start ?? new Date(at)).getTime();
  const ended = shiftWindows().filter((w) => w.end.getTime() <= before);
  return withKey(ended[ended.length - 1] ?? null);
}

export function inShift(value, shift) {
  if (!shift) return false;
  const t = new Date(value).getTime();
  return t >= shift.start.getTime() && t < shift.end.getTime();
}

/** "Night shift" for "Night"; a name that already ends in "shift" is left alone. */
export function shiftTitle(name) {
  return /shift$/i.test(String(name).trim()) ? name : `${name} shift`;
}

/** "Night shift, Sat 10 Oct" style label for grouping. */
export function shiftLabel(shift) {
  return `${shiftTitle(shift.name)}, ${formatWeekdayDay(shift.start)}`;
}

/** The 24h operational day containing `at` (from the server; local midnight to midnight as a fallback). */
export function operationalDay(at = new Date()) {
  const t = new Date(at).getTime();
  const day = operationalDays().find((d) => d.start.getTime() <= t && t < d.end.getTime());
  if (day) return { start: day.start, end: day.end };
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
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

/** A report needs a person to check it: not reviewed yet, and unclassified or low confidence. */
export function needsReview(report) {
  if (report?.reviewed_at) return false;
  const confidence = parseConfidence(report);
  return !report.category_name || confidence === null || confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** A pending task is overdue once its due time has passed. No due time means never overdue. */
/** Past its due time. A task marked done isn't overdue: only the supervisor's sign-off is left. */
export function isOverdue(task, now = Date.now()) {
  return task.status === 'pending' && !task.done_at && Boolean(task.due_at) && new Date(now) > new Date(task.due_at);
}

/** The assignee marked it done; it waits for a supervisor to sign it off or send it back. */
export const awaitingSignOff = (task) => task.status === 'pending' && Boolean(task.done_at);

/** Due-time state for display: { state: 'overdue' | 'soon' | 'due' | 'none', text }. */
export function dueInfo(task, now = Date.now()) {
  if (task.status !== 'pending' || task.done_at || !task.due_at) return { state: 'none', text: 'No due time' };
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

// Older task descriptions read "New <category> incident reported: <summary>".
const TASK_PREFIX = /^New (.+?) incident reported:\s*/i;

/** The report summary behind a task (GET /api/tasks `report`), else parsed from the description. */
export function taskSummary(task) {
  return task?.report?.summary || (task?.description ?? '').replace(TASK_PREFIX, '').trim() || task?.description || '';
}

/** The report category behind a task, else parsed from the description. */
export function taskCategory(task) {
  return task?.report?.category_name ?? (task?.description ?? '').match(TASK_PREFIX)?.[1] ?? null;
}

/** Category names come from the model in Title Case; labels in this UI are sentence case. */
export function sentenceCase(text = '') {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function firstName(fullName = '') {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * A person's name as shown anywhere in the app: "Former employee" once deleted, "Name (deactivated)"
 * while deactivated. Accepts directory rows and the `assignee` / `resolver` / `submitted_by` objects.
 */
export function personName(person) {
  if (!person) return null;
  if (person.anonymised || person.anonymised_at) return 'Former employee';
  return person.is_active === false ? `${person.full_name} (deactivated)` : person.full_name;
}

/** Open and without a (current) owner: never assigned, or the assignee was deactivated or deleted. */
export const needsOwner = (task) => task.status === 'pending' && (!task.assigned_to || Boolean(task.needs_reassignment));

/** The assignee or resolver of a task, from the task itself or (after a live update) the user list. */
export function taskPerson(task, which, usersById) {
  const id = which === 'resolver' ? task.resolved_by : task.assigned_to;
  if (!id) return null;
  const embedded = task[which];
  return embedded?.user_id === id ? embedded : usersById?.get(id) ?? null;
}

/**
 * The shift someone is rostered on, e.g. "Night shift", or null when not rostered. `fallbackName` is
 * used for a shift that is no longer active (the API sends `shift_name` with each person).
 */
export function rosterLabel(shiftId, fallbackName = null) {
  if (!shiftId) return null;
  const name = findShift(shiftId)?.name ?? fallbackName;
  return name ? shiftTitle(name) : 'An inactive shift';
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
