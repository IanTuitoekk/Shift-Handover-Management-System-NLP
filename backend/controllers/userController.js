const userService = require('../services/userService');
const realtime = require('../realtime');
const { workload } = require('../services/statsService');

// All handlers here are supervisor-only (see routes/users.js).

const sendError = (res, next, err) => (err.status ? res.status(err.status).json({ error: err.message }) : next(err));

async function getUsers(req, res, next) {
  try {
    res.json(await userService.listAssignableUsers());
  } catch (err) {
    next(err);
  }
}

async function getDirectory(req, res, next) {
  try {
    res.json(await userService.listDirectory());
  } catch (err) {
    next(err);
  }
}

async function getWorkload(req, res, next) {
  const since = req.query.since ? new Date(req.query.since) : undefined;
  if (since && Number.isNaN(since.getTime())) return res.status(400).json({ error: 'since must be an ISO date-time' });
  try {
    res.json(await workload(since ? { since } : {}));
  } catch (err) {
    next(err);
  }
}

const notSelf = (req, res, what) => {
  if (req.params.userId === req.user.userId) {
    res.status(400).json({ error: `You cannot ${what} your own account` });
    return false;
  }
  return true;
};

function announceChange(userId) {
  realtime.toRole('supervisor', 'users:changed', { user_id: userId });
}

// Tasks flagged or unassigned because their assignee left; everyone's lists refresh.
function announceTasks(taskIds, by) {
  if (taskIds?.length) realtime.toAll('tasks:reassignment-needed', { task_ids: taskIds, by });
}

async function setRole(req, res, next) {
  if (!notSelf(req, res, 'change the role of')) return;
  try {
    const user = await userService.changeRole(req.params.userId, req.body.role);
    if (!user) return res.status(404).json({ error: 'User not found or inactive' });
    res.json(user);
    realtime.toUser(user.user_id, 'user:role-changed', { role: user.role, by: req.user.userId });
    announceChange(user.user_id);
  } catch (err) {
    sendError(res, next, err);
  }
}

async function updateUser(req, res, next) {
  const { full_name, email, staff_number, station } = req.body;
  const blankToNull = (v) => (v === undefined ? undefined : v === null || String(v).trim() === '' ? null : String(v).trim());
  try {
    const user = await userService.updateDetails(req.params.userId, {
      fullName: full_name,
      email,
      staffNumber: blankToNull(staff_number),
      station: blankToNull(station),
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
    announceChange(user.user_id);
  } catch (err) {
    sendError(res, next, err);
  }
}

async function setActive(req, res, next) {
  const { active, reason } = req.body;
  if (!active && !notSelf(req, res, 'deactivate')) return;
  try {
    const result = active
      ? await userService.reactivate(req.params.userId)
      : await userService.deactivate(req.params.userId, { by: req.user.userId, reason: reason?.trim() });
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ ...result.user, tasks_needing_reassignment: result.taskIds.length });
    if (!active) realtime.signOutUser(result.user.user_id, 'Your account has been deactivated by a supervisor.');
    announceChange(result.user.user_id);
    announceTasks(result.taskIds, req.user.userId);
  } catch (err) {
    sendError(res, next, err);
  }
}

async function deleteUser(req, res, next) {
  if (!notSelf(req, res, 'delete')) return;
  try {
    const result = await userService.deletePermanently(req.params.userId);
    if (!result) return res.status(404).json({ error: 'User not found' });
    // One line per deletion. Ids only: the point is that the person's details are gone.
    console.info(
      `[users] permanent delete by=${req.user.userId} user=${req.params.userId} case=${result.outcome === 'deleted' ? 'a (no records, row deleted)' : 'b (has records, anonymised)'} at=${new Date().toISOString()}`
    );
    res.json({ outcome: result.outcome, tasks_unassigned: result.taskIds.length });
    realtime.signOutUser(req.params.userId, 'Your account has been removed.');
    announceChange(req.params.userId);
    announceTasks(result.taskIds, req.user.userId);
  } catch (err) {
    sendError(res, next, err);
  }
}

module.exports = { getUsers, getDirectory, getWorkload, setRole, updateUser, setActive, deleteUser };
