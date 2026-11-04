// Shifts are named daily windows that supervisors manage (the `shifts` table). This module is the one
// place that decides which shift a moment belongs to; every endpoint uses it, and the frontend gets
// its shift windows from GET /api/config/shifts rather than working them out itself.
//
// A shift is { shift_id, name, start_time 'HH:MM', end_time 'HH:MM' } in SHIFT_TIMEZONE. An end
// before the start crosses midnight (22:00-06:00). Active shifts never overlap (the API refuses),
// but they may leave gaps: a moment no shift covers has no shift (null), never an error.
// An occurrence is one run of a shift: { shift_id, name, start_time, end_time, start: Date, end: Date }.
const SHIFT_TIMEZONE = process.env.SHIFT_TIMEZONE || 'Africa/Nairobi';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const DAY_MINUTES = 24 * 60;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// --- The active shifts, cached from the database --------------------------------------

let active = [];
let loading = null;

/** 'HH:MM' (or 'HH:MM:SS' from Postgres) as minutes after midnight, or null if invalid. */
function toMinutes(time) {
  const m = TIME.exec(String(time ?? '').slice(0, 5));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (time) => String(time).slice(0, 5);

/** Replaces the cache with these shifts (inactive ones are ignored). */
function setShifts(rows) {
  active = rows
    .filter((r) => r.is_active !== false)
    .map((r) => ({
      shift_id: r.shift_id,
      name: r.name,
      start_time: hhmm(r.start_time),
      end_time: hhmm(r.end_time),
      startMin: toMinutes(r.start_time),
      endMin: toMinutes(r.end_time),
    }))
    .sort((a, b) => a.startMin - b.startMin);
}

/** Reloads the active shifts from the database. */
async function loadShifts() {
  const pool = require('./db');
  const result = await pool.query(
    `SELECT shift_id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM shifts WHERE is_active ORDER BY start_time`
  );
  setShifts(result.rows);
  loading = Promise.resolve();
}

/** Resolves once the shifts have been loaded at least once (the API waits on this). */
function shiftsReady() {
  loading ??= loadShifts().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** The active shifts, earliest start first: [{ shift_id, name, start_time, end_time }]. */
const activeShifts = () => active.map(({ shift_id, name, start_time, end_time }) => ({ shift_id, name, start_time, end_time }));
const findShift = (shiftId) => active.find((s) => s.shift_id === shiftId) ?? null;

// --- Wall-clock arithmetic in SHIFT_TIMEZONE -------------------------------------------

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SHIFT_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock parts of `date` in SHIFT_TIMEZONE. */
function zonedParts(date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** The instant at `minutes` past midnight on the zoned calendar day of `date`, moved by `dayOffset` days. */
function zonedTime(date, minutes, dayOffset = 0) {
  const { year, month, day } = zonedParts(date);
  const guess = Date.UTC(year, month - 1, day + dayOffset, 0, minutes);
  const local = zonedParts(new Date(guess));
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return new Date(guess - (asUtc - guess)); // subtract the zone's offset
}

const minuteOfDay = (date) => {
  const { hour, minute } = zonedParts(date);
  return hour * 60 + minute;
};

// --- Shift geometry ---------------------------------------------------------------------

const crossesMidnight = (s) => s.endMin < s.startMin;
const lengthMs = (s) => (((s.endMin - s.startMin + DAY_MINUTES) % DAY_MINUTES) || DAY_MINUTES) * MINUTE;

/** Whether shift `s` covers `minute` (0-1439). The start is inside the shift, the end is not. */
function covers(s, minute) {
  return crossesMidnight(s) ? minute >= s.startMin || minute < s.endMin : minute >= s.startMin && minute < s.endMin;
}

/** A shift's minutes as one or two [from, to) ranges within a day. */
const ranges = (s) => (crossesMidnight(s) ? [[s.startMin, DAY_MINUTES], [0, s.endMin]] : [[s.startMin, s.endMin]]);

/**
 * The first of `others` that overlaps `candidate` ({ start_time, end_time }), or null. Shifts that
 * only touch (one ends at 18:00, the next starts at 18:00) don't overlap.
 */
function findOverlap(candidate, others) {
  const c = { startMin: toMinutes(candidate.start_time), endMin: toMinutes(candidate.end_time) };
  for (const o of others) {
    const other = { startMin: toMinutes(o.start_time), endMin: toMinutes(o.end_time) };
    for (const [a0, a1] of ranges(c)) for (const [b0, b1] of ranges(other)) if (a0 < b1 && b0 < a1) return o;
  }
  return null;
}

const occurrence = (s, start) => ({
  shift_id: s.shift_id,
  name: s.name,
  start_time: s.start_time,
  end_time: s.end_time,
  start,
  end: new Date(start.getTime() + lengthMs(s)),
});

/** Occurrences of any active shift starting in [from, to), earliest first. */
function occurrencesStarting(from, to, shifts = active) {
  const out = [];
  const days = Math.ceil((to - from) / DAY) + 1;
  for (const s of shifts) {
    for (let d = -1; d <= days; d++) {
      const start = zonedTime(from, s.startMin, d);
      if (start >= from && start < to) out.push(occurrence(s, start));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// --- Which shift, when ------------------------------------------------------------------

/** The occurrence covering `at`, or null if no active shift covers it. */
function shiftAt(at = new Date(), shifts = active) {
  const minute = minuteOfDay(at);
  const s = shifts.find((x) => covers(x, minute));
  if (!s) return null;
  // After midnight in a shift that started the evening before: it began yesterday.
  const dayOffset = crossesMidnight(s) && minute < s.endMin ? -1 : 0;
  return occurrence(s, zonedTime(at, s.startMin, dayOffset));
}

/** The first occurrence starting at or after `from`, or null if there are no active shifts. */
function nextShiftFrom(from, shifts = active) {
  return occurrencesStarting(from, new Date(from.getTime() + 2 * DAY), shifts)[0] ?? null;
}

/** The last occurrence that ended at or before `before`, or null. */
function lastShiftBefore(before, shifts = active) {
  const ended = occurrencesStarting(new Date(before.getTime() - 3 * DAY), before, shifts).filter((o) => o.end <= before);
  return ended[ended.length - 1] ?? null;
}

/** The shift before the one covering `at` (or before `at` itself, in a gap). */
function previousShift(at = new Date(), shifts = active) {
  return lastShiftBefore(shiftAt(at, shifts)?.start ?? at, shifts);
}

/** The current occurrence (if any) and the ones after it: `count` in all. */
function upcomingShifts(count, at = new Date(), shifts = active) {
  const current = shiftAt(at, shifts);
  const list = current ? [current] : [];
  let from = current ? current.end : at;
  while (list.length < count) {
    const next = nextShiftFrom(from, shifts);
    if (!next) break;
    list.push(next);
    from = next.end;
  }
  return list;
}

/** The last `count` occurrences, oldest first, ending with the current one (if any). */
function recentShifts(count, at = new Date(), shifts = active) {
  const current = shiftAt(at, shifts);
  const list = current ? [current] : [];
  let before = current ? current.start : at;
  while (list.length < count) {
    const prev = lastShiftBefore(before, shifts);
    if (!prev) break;
    list.unshift(prev);
    before = prev.start;
  }
  return list;
}

/** The latest occurrence of shift `shiftId` that started at or before `at`, or null. */
function lastOccurrenceOf(shiftId, at = new Date(), shifts = active) {
  const s = shifts.find((x) => x.shift_id === shiftId);
  if (!s) return null;
  const today = zonedTime(at, s.startMin, 0);
  return occurrence(s, today <= at ? today : zonedTime(at, s.startMin, -1));
}

/**
 * The shift that receives a handover written at `at` for shift `handingOverId` (or, without one, for
 * the shift covering `at`): the first occurrence starting when or after that shift's latest run
 * ended that hasn't itself ended yet. So a handover at the end of the day shift goes to the night
 * shift, and one written late, after the night shift began, still goes to it. Null with no shifts.
 */
function incomingShift(handingOverId, at = new Date(), shifts = active) {
  const handingOver = (handingOverId && lastOccurrenceOf(handingOverId, at, shifts)) || shiftAt(at, shifts);
  const from = handingOver ? handingOver.end : at;
  return occurrencesStarting(from, new Date(Math.max(from, at) + 2 * DAY), shifts).find((o) => o.end > at) ?? null;
}

/** 'YYYY-MM-DD': the calendar day (in SHIFT_TIMEZONE) an occurrence starts on. With the shift id it names the run. */
function shiftDate(occ) {
  const { year, month, day } = zonedParts(occ.start);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The occurrence of shift `shiftId` starting on `date` ('YYYY-MM-DD'), or null if either is invalid. */
function shiftOn(date, shiftId, shifts = active) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  const s = shifts.find((x) => x.shift_id === shiftId);
  if (!m || !s) return null;
  const midday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (shiftDate({ start: midday }) !== date) return null; // e.g. 2026-02-30
  return occurrence(s, zonedTime(midday, s.startMin));
}

/**
 * The 24h operational day containing `at`: from the earliest shift start time (06:00 with the
 * default shifts) to the same time the next day; from midnight when there are no shifts.
 */
function operationalDay(at = new Date(), shifts = active) {
  const startMin = shifts.length ? Math.min(...shifts.map((s) => s.startMin)) : 0;
  const start = zonedTime(at, startMin, minuteOfDay(at) < startMin ? -1 : 0);
  return { start, end: new Date(start.getTime() + DAY) };
}

/**
 * What GET /api/config/shifts returns: the active shifts, and the shift windows (occurrences) and
 * operational days from two days ago to two days ahead, worked out here so the app never has to.
 */
function shiftConfig(now = new Date()) {
  const from = new Date(now.getTime() - 2 * DAY);
  // The run already under way two days ago, then every run starting after it.
  const first = shiftAt(from);
  const windows = [...(first ? [first] : []), ...occurrencesStarting(from, new Date(now.getTime() + 2 * DAY))].filter(
    (o, i, all) => all.findIndex((x) => x.shift_id === o.shift_id && +x.start === +o.start) === i
  );
  const days = [-1, 0, 1].map((d) => operationalDay(new Date(now.getTime() + d * DAY)));
  return { timezone: SHIFT_TIMEZONE, shifts: activeShifts(), windows, days, generated_at: now };
}

module.exports = {
  SHIFT_TIMEZONE,
  TIME,
  toMinutes,
  setShifts,
  loadShifts,
  shiftsReady,
  activeShifts,
  findShift,
  findOverlap,
  shiftAt,
  nextShiftFrom,
  previousShift,
  upcomingShifts,
  recentShifts,
  lastOccurrenceOf,
  incomingShift,
  shiftDate,
  shiftOn,
  operationalDay,
  shiftConfig,
};
