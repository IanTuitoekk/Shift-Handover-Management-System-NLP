const { getAllTasks, getTaskById, resolveTask, assignTask } = require('../models/taskRegisterModel');

const listTasks = async (req, res) => {
  const { status } = req.query;
  try {
    const tasks = await getAllTasks(status);
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign task' });
  }
};

module.exports = { listTasks, resolve, assign };