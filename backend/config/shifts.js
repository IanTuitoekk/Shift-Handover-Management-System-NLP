// Shift definitions used to label and filter handovers and tasks.
// Day runs from DAY_SHIFT_START to NIGHT_SHIFT_START (local hours in SHIFT_TIMEZONE); night is the rest.
const DAY_SHIFT_START = Number(process.env.DAY_SHIFT_START ?? 6);
const NIGHT_SHIFT_START = Number(process.env.NIGHT_SHIFT_START ?? 18);
const SHIFT_TIMEZONE = process.env.SHIFT_TIMEZONE || 'Africa/Nairobi';
const SHIFTS = ['day', 'night'];

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

module.exports = { SHIFTS, DAY_SHIFT_START, NIGHT_SHIFT_START, SHIFT_TIMEZONE, shiftExpression };
