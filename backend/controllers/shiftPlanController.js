const { getPlans, savePlan, listPlannedShifts, listPlannableCrew } = require('../models/shiftPlanModel');
const { previousShift, shiftDate, shiftOn, upcomingShifts } = require('../config/shifts');
const realtime = require('../realtime');

const MAX_MEMBERS = 200;
// Shifts can be planned up to this many days ahead.
const MAX_DAYS_AHEAD = 60;
const DAY = 24 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One run of a shift, as the API returns it. A run is named by its start date and shift id. */
const shiftInfo = (occ, now = new Date()) => ({
  date: shiftDate(occ),
  shift_id: occ.shift_id,
  name: occ.name,
  start_time: occ.start_time,
  end_time: occ.end_time,
  start: occ.start,
  end: occ.end,
  current: occ.start <= now && now < occ.end,
});
const runKey = (s) => `${s.date}:${s.shift_id}`;

/**
 * Each run with its plan (or null) and `previous`: the run before it (or null), with the user ids on
 * its plan, so the planner can list who hands over to this shift first.
 */
async function withPlans(runs) {
  const befores = runs.map((s) => {
    const prev = previousShift(new Date(s.start));
    return prev ? shiftInfo(prev) : null;
  });
  const plans = await getPlans([...befores.filter(Boolean), ...runs]);
  const planOf = (s) => plans.get(runKey(s)) ?? null;
  return runs.map((s, i) => {
    const prev = befores[i];
    const prevPlan = prev && planOf(prev);
    return {
      ...s,
      plan: planOf(s),
      previous: prev && { date: prev.date, shift_id: prev.shift_id, name: prev.name, planned: Boolean(prevPlan), members: (prevPlan?.members ?? []).map((m) => m.user_id) },
    };
  });
}

// Supervisor-only. The current shift and the next ones (`count`, default 4, at most 14), then every
// later run a supervisor has planned, each with its plan and the run before it, plus the crew who
// can be planned.
const listPlans = async (req, res) => {
  const count = Math.min(Math.max(Number.parseInt(req.query.count, 10) || 4, 1), 14);
  try {
    const upcoming = upcomingShifts(count).map((s) => shiftInfo(s));
    const listed = new Set(upcoming.map(runKey));
    const lastEnd = upcoming.length ? new Date(upcoming[upcoming.length - 1].end) : new Date();
    const later = (await listPlannedShifts(upcoming[0]?.date ?? shiftDate({ start: new Date() })))
      .filter((p) => !listed.has(runKey(p)))
      .map((p) => shiftOn(p.date, p.shift_id)) // null for a deactivated shift
      .filter((s) => s && s.start >= lastEnd)
      .sort((a, b) => a.start - b.start)
      .map((s) => ({ ...shiftInfo(s), created: true }));
    const [shifts, crew] = await Promise.all([withPlans([...upcoming, ...later]), listPlannableCrew()]);
    res.json({ crew, shifts, max_days_ahead: MAX_DAYS_AHEAD });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shift plans' });
  }
};

/** Why a run can't be planned (unknown, ended, or too far ahead), or null if it can. */
function runProblem(date, shiftId, now = new Date()) {
  const run = UUID.test(String(shiftId)) ? shiftOn(date, shiftId) : null;
  if (!run) return 'Unknown shift: use a date (YYYY-MM-DD) and an active shift';
  if (run.end <= now) return 'This shift has ended, so its plan can no longer be changed';
  if (run.start - now > MAX_DAYS_AHEAD * DAY) return `Shifts can be planned up to ${MAX_DAYS_AHEAD} days ahead`;
  return null;
}

// Supervisor-only. One run by date and shift id, planned or not, so a supervisor can plan it.
const getShift = async (req, res) => {
  const { date, shiftId } = req.params;
  const problem = runProblem(date, shiftId);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const [run] = await withPlans([shiftInfo(shiftOn(date, shiftId))]);
    res.json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load the shift' });
  }
};

// Anyone signed in: the planned runs coming up (current and next two) that involve them, and who
// they take over from or hand over to.
const myPlans = async (req, res) => {
  const me = req.user.userId;
  try {
    const runs = upcomingShifts(3).map((s) => shiftInfo(s));
    const plans = await getPlans(runs);
    const out = [];
    for (const s of runs) {
      const plan = plans.get(runKey(s));
      if (!plan) continue;
      const mine = plan.members.find((m) => m.user_id === me);
      const takenOverBy = plan.members.filter((m) => m.takes_over_from === me).map((m) => ({ user_id: m.user_id, full_name: m.full_name }));
      if (!mine && !takenOverBy.length) continue;
      out.push({
        ...s,
        on_shift: Boolean(mine),
        takes_over_from: mine?.takes_over_from ? { user_id: mine.takes_over_from, full_name: mine.takes_over_from_name } : null,
        taken_over_by: takenOverBy,
      });
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load your shifts' });
  }
};

// Supervisor-only. Body: { members: [{ user_id, takes_over_from (user id or null) }] }. An empty list
// clears the plan, so the run goes back to the roster.
const savePlanFor = async (req, res) => {
  const { date, shiftId } = req.params;
  const problem = runProblem(date, shiftId);
  if (problem) return res.status(400).json({ error: problem });
  const run = shiftOn(date, shiftId);

  const members = req.body?.members;
  if (!Array.isArray(members) || members.length > MAX_MEMBERS) {
    return res.status(400).json({ error: `members must be a list of at most ${MAX_MEMBERS} people` });
  }
  const ids = members.map((m) => m?.user_id);
  if (ids.some((id) => !UUID.test(String(id)))) return res.status(400).json({ error: 'Each member needs a valid user_id' });
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'A person can only be on a shift once' });

  try {
    const crew = new Set((await listPlannableCrew()).map((c) => c.user_id));
    const onShift = new Set(ids);
    for (const m of members) {
      if (!crew.has(m.user_id)) return res.status(400).json({ error: 'Only active ground crew can be planned on a shift' });
      const from = m.takes_over_from ?? null;
      if (from === null) continue;
      if (!crew.has(from)) return res.status(400).json({ error: 'People can only take over from active ground crew' });
      if (onShift.has(from)) return res.status(400).json({ error: 'Nobody can take over from someone on the same shift' });
    }
    await savePlan({ date, shiftId, members: members.map((m) => ({ user_id: m.user_id, takes_over_from: m.takes_over_from ?? null })), by: req.user.userId });
    const [saved] = await withPlans([shiftInfo(run)]);
    res.json(saved);
    realtime.toAll('shift-plans:changed', { date, shift_id: shiftId, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save the shift plan' });
  }
};

module.exports = { listPlans, getShift, myPlans, savePlanFor };
