const { getAllTasks, getTaskById, resolveTask, assignTask, setTaskDue } = require('../models/taskRegisterModel');
const realtime = require('../realtime');
const { SHIFTS } = require('../config/shifts');

const listTasks = async (req, res) => {
  const { status } = req.query;
  const shift = req.query.shift ? String(req.query.shift).toLowerCase() : null;
  if (shift && !SHIFTS.includes(shift)) {
    return res.status(400).json({ error: `shift must be one of: ${SHIFTS.join(', ')}` });
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
    const task = await resolveTask(taskId, req.user.userId);
    res.json(task);
    // Everyone can list tasks, so everyone's open lists update.
    realtime.toAll('task:resolved', { task, by: req.user.userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve task' });
  }
};

const assign = async (req, res) => {
  const { taskId } = req.params;
  const { assigned_to } = req.body;
  if (!assigned_to) {
    return res.status(400).json({ error: 'assigned_to is required' });
  }
  try {
    const existing = await getTaskById(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
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

module.exports = { listTasks, resolve, assign, setDue };