/*
 * The shifts and their windows, exactly as the server worked them out (GET /api/config/shifts).
 * The server is the one place that decides which shift a moment belongs to; the app only looks
 * windows up here. AppShell refreshes this regularly, and when a supervisor changes a shift.
 *   shifts   the active shifts: [{ shift_id, name, start_time, end_time }], earliest start first
 *   windows  runs of those shifts from two days ago to two days ahead: [{ shift_id, name, start, end }]
 *   days     operational days around now: [{ start, end }]
 */
let source = null;
let clock = { shifts: [], windows: [], days: [] };

const dated = (w) => ({ ...w, start: new Date(w.start), end: new Date(w.end) });

export function setShiftClock(config) {
  if (!config || config === source) return;
  source = config;
  clock = {
    shifts: config.shifts ?? [],
    windows: (config.windows ?? []).map(dated).sort((a, b) => a.start - b.start),
    days: (config.days ?? []).map(dated),
  };
}

export const activeShifts = () => clock.shifts;
export const shiftWindows = () => clock.windows;
export const operationalDays = () => clock.days;
export const findShift = (shiftId) => clock.shifts.find((s) => s.shift_id === shiftId) ?? null;
