const { pickAssignee } = require('../models/taskRegisterModel');
const { pickPlannedAssignee } = require('../models/shiftPlanModel');
const { incomingShift, shiftDate, shiftsReady } = require('../config/shifts');

/**
 * Who a new handover's task goes to. The incoming shift is the one after the shift handing over
 * (`shiftId`, else the shift covering `at`; see incomingShift in config/shifts.js). Then, in order:
 *   1. 'takes_over'  the supervisor's plan for that shift says who takes over from the writer
 *   2. 'shift_plan'  the least busy person on that plan
 *   3. 'roster'      no plan: the least busy person rostered on that shift (users.shift_id)
 * Never the writer. Returns { userId (or null), rule (or null), shift: { shift_id, name, date, start,
 * end } or null when no shifts are set up }.
 */
async function chooseAssignee({ writerId, shiftId = null, at = new Date() }) {
  await shiftsReady();
  const incoming = incomingShift(shiftId, at);
  if (!incoming) return { userId: null, rule: null, shift: null };
  const date = shiftDate(incoming);
  const where = { shift_id: incoming.shift_id, name: incoming.name, date, start: incoming.start, end: incoming.end };

  const planned = await pickPlannedAssignee({ date, shiftId: incoming.shift_id, writerId });
  if (planned.planned) {
    // The supervisor has said who works this shift: never fall back to someone not on it.
    return { userId: planned.userId, rule: planned.userId ? (planned.takesOver ? 'takes_over' : 'shift_plan') : null, shift: where };
  }
  const userId = await pickAssignee({ shiftId: incoming.shift_id, excludeUserId: writerId });
  return { userId, rule: userId ? 'roster' : null, shift: where };
}

module.exports = { chooseAssignee };
