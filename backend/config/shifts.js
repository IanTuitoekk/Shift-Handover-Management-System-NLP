// Shift definitions used to label, filter and count handovers and tasks.
// Day runs from DAY_SHIFT_START to NIGHT_SHIFT_START (local hours in SHIFT_TIMEZONE); night is the rest.
const DAY_SHIFT_START = Number(process.env.DAY_SHIFT_START ?? 6);
const NIGHT_SHIFT_START = Number(process.env.NIGHT_SHIFT_START ?? 18);
const SHIFT_TIMEZONE = process.env.SHIFT_TIMEZONE || 'Africa/Nairobi';
const SHIFTS = ['day', 'night'];
const DAY_HOURS = NIGHT_SHIFT_START - DAY_SHIFT_START;
const HOUR = 3600 * 1000;

/**
 * SQL expression giving 'day' or 'night' for a handover submission (alias `s`): the shift the crew
 * member chose on the form, or, when that is missing, the shift its submission time falls in.
 * Values are numbers/constants from config, never user input.
 */
function shiftExpression(alias = 's') {
  const hour = `EXTRACT(HOUR FROM ${alias}.submitted_at AT TIME ZONE '${SHIFT_TIMEZONE.replace(/'/g, '')}')`;
  return `COALESCE(
    NULLIF(lower(${alias}.shift), ''),
    CASE WHEN ${hour} >= ${DAY_SHIFT_START} AND ${hour} < ${NIGHT_SHIFT_START} THEN 'day' ELSE 'night' END
  )`;
}

const pad = (h) => `${String(h).padStart(2, '0')}:00`;

/** What GET /api/config/shifts returns. */
function shiftConfig() {
  return {
    timezone: SHIFT_TIMEZONE,
    day_start_hour: DAY_SHIFT_START,
    night_start_hour: NIGHT_SHIFT_START,
    shifts: [
      { key: 'day', name: 'Day', start: pad(DAY_SHIFT_START), end: pad(NIGHT_SHIFT_START) },
      { key: 'night', name: 'Night', start: pad(NIGHT_SHIFT_START), end: pad(DAY_SHIFT_START) },
    ],
  };
}

// --- Shift windows in SHIFT_TIMEZONE ---------------------------------------------

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

/** The instant at wall-clock `hour`:00 on the zoned calendar day of `date`, shifted by `dayOffset` days. */
function zonedHour(date, hour, dayOffset = 0) {
  const { year, month, day } = zonedParts(date);
  const guess = Date.UTC(year, month - 1, day + dayOffset, hour);
  const local = zonedParts(new Date(guess));
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return new Date(guess - (asUtc - guess)); // subtract the zone's offset
}

/** The shift containing `at`: { key: 'day' | 'night', name, start, end }. */
function shiftAt(at = new Date()) {
  const { hour } = zonedParts(at);
  if (hour >= DAY_SHIFT_START && hour < NIGHT_SHIFT_START) {
    const start = zonedHour(at, DAY_SHIFT_START);
    return { key: 'day', name: 'Day', start, end: new Date(start.getTime() + DAY_HOURS * HOUR) };
  }
  const start = zonedHour(at, NIGHT_SHIFT_START, hour < DAY_SHIFT_START ? -1 : 0);
  return { key: 'night', name: 'Night', start, end: new Date(start.getTime() + (24 - DAY_HOURS) * HOUR) };
}

/** The last `count` shifts, oldest first, ending with the one containing `at`. */
function recentShifts(count, at = new Date()) {
  const shifts = [shiftAt(at)];
  while (shifts.length < count) shifts.unshift(shiftAt(new Date(shifts[0].start.getTime() - 1)));
  return shifts;
}

/** The 24h operational day (day-shift start to day-shift start) containing `at`. */
function operationalDay(at = new Date()) {
  const { hour } = zonedParts(at);
  const start = zonedHour(at, DAY_SHIFT_START, hour < DAY_SHIFT_START ? -1 : 0);
  return { start, end: new Date(start.getTime() + 24 * HOUR) };
}

module.exports = {
  SHIFTS,
  DAY_SHIFT_START,
  NIGHT_SHIFT_START,
  SHIFT_TIMEZONE,
  shiftExpression,
  shiftConfig,
  shiftAt,
  recentShifts,
  operationalDay,
};
