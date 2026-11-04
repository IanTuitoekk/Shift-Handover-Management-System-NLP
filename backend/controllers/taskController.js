const { getAllTasks, getTaskById, resolveTask, markTaskDone, sendBackTask, assignTask, setTaskDue } = require('../models/taskRegisterModel');
const { getUserById } = require('../models/userModel');
const realtime = require('../realtime');

const listTasks = async (req, res) => {
  const { status } = req.query;
  const shift = req.query.shift ? String(req.query.shift) : null;
  if (shift && shift !== 'none' && !/^[0-9a-f-]{36}$/i.test(shift)) {
    return res.status(400).json({ error: 'shift must be a shift id, or none' });
  }
  try {
    const tasks = await getAllTasks(status, shift);
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

const resolve = async (req, res) => {
  const { taskId } = req.params;
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'resolved') {
      return res.status(409).json({ error: 'This task has already been resolved' });
    }
    const task = await resolveTask(taskId, req.user.userId);
    if (!task) {
      return res.status(409).json({ error: 'This task has already been resolved' });
    }
    res.json(task);
    // Everyone can list tasks, so everyone's open lists update.
    realtime.toAll('task:resolved', { task, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve task' });
  }
};

// The assignee marks their task done; it waits for a supervisor's sign-off.
const markDone = async (req, res) => {
  const { taskId } = req.params;
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'resolved') {
      return res.status(409).json({ error: 'This task has already been resolved' });
    }
    if (existing.assigned_to !== req.user.userId) {
      return res.status(403).json({ error: 'Only the person this task is assigned to can mark it done' });
    }
    if (existing.done_at) {
      return res.status(409).json({ error: 'This task is already waiting for sign-off' });
    }
    const task = await markTaskDone(taskId, req.user.userId);
    if (!task) {
      return res.status(409).json({ error: 'This task changed meanwhile. Reload and try again.' });
    }
    res.json(task);
    realtime.toAll('task:done', { task, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark task done' });
  }
};

// Supervisor-only. A task marked done that isn't finished goes back to its assignee.
const sendBack = async (req, res) => {
  const { taskId } = req.params;
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'resolved') {
      return res.status(409).json({ error: 'This task has already been resolved' });
    }
    const task = await sendBackTask(taskId);
    if (!task) {
      return res.status(409).json({ error: 'This task is not waiting for sign-off' });
    }
    res.json(task);
    realtime.toAll('task:sent-back', { task, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send task back' });
  }
};

const assign = async (req, res) => {
  const { taskId } = req.params;
  const { assigned_to } = req.body; // a user id, or null to unassign (validated in routes/tasks.js)
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'resolved') {
      return res.status(400).json({ error: 'Resolved tasks cannot be reassigned' });
    }
    if (assigned_to !== null) {
      const assignee = await getUserById(assigned_to);
      if (!assignee || !assignee.is_active) {
        return res.status(400).json({ error: 'Tasks can only be assigned to active people' });
      }
    }
    const task = await assignTask(taskId, assigned_to);
    res.json(task);
    realtime.toAll('task:assigned', { task, by: req.user.userId, previousAssignee: existing.assigned_to });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign task' });
  }
};

// Supervisor-only. Body: { due_at: ISO timestamp | null }. Null clears the due time.
const setDue = async (req, res) => {
  const { taskId } = req.params;
  const dueAt = req.body.due_at ?? null;
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing.status === 'resolved') {
      return res.status(400).json({ error: 'Resolved tasks have no due time to change' });
    }
    const task = await setTaskDue(taskId, dueAt);
    res.json(task);
    realtime.toAll('task:updated', { task, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set due time' });
  }
};

module.exports = { listTasks, resolve, markDone, sendBack, assign, setDue };