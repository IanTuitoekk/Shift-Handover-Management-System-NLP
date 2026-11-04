const { listShifts, getShiftById, createShift, updateShift, deleteShift } = require('../models/shiftModel');
const { TIME, findOverlap, loadShifts } = require('../config/shifts');
const realtime = require('../realtime');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 50;
const clean = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/**
 * Why `shift` ({ shift_id?, name, start_time, end_time }) can't be active alongside the other active
 * shifts, as { field, error }, or null. Names are unique (ignoring case); times never overlap.
 */
async function conflict(shift) {
  const others = (await listShifts()).filter((s) => s.shift_id !== shift.shift_id);
  const sameName = others.find((s) => s.name.toLowerCase() === shift.name.toLowerCase());
  if (sameName) return { field: 'name', error: `There is already an active shift called ${sameName.name}` };
  const overlap = findOverlap(shift, others);
  if (overlap) {
    return { field: 'start_time', error: `These times overlap ${overlap.name} (${overlap.start_time} to ${overlap.end_time}). Change one so every moment belongs to at most one shift.` };
  }
  return null;
}

/** The checked fields from a request body, or { field, error } for the first invalid one. */
function readFields(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = clean(body.name);
    if (!out.name) return { field: 'name', error: 'Give the shift a name' };
    if (out.name.length > MAX_NAME) return { field: 'name', error: `The name can be at most ${MAX_NAME} characters` };
  }
  for (const field of ['start_time', 'end_time']) {
    if (partial && body[field] === undefined) continue;
    if (!TIME.test(String(body[field] ?? ''))) return { field, error: 'Use a 24-hour time like 06:00 or 22:30' };
    out[field] = body[field];
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { field: 'is_active', error: 'is_active must be true or false' };
    out.is_active = body.is_active;
  }
  return out;
}

const changed = async (req) => {
  await loadShifts();
  realtime.toAll('shifts:changed', { by: req.user.userId });
};

// Anyone signed in reads the active shifts; supervisors can add ?all=true for deactivated ones too.
const getShifts = async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true' && req.user.role === 'supervisor';
    res.json(await listShifts({ includeInactive }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shifts' });
  }
};

// Supervisor-only. Body: { name, start_time 'HH:MM', end_time 'HH:MM' }. End before start crosses midnight.
const addShift = async (req, res) => {
  const fields = readFields(req.body ?? {}, { partial: false });
  if (fields.error) return res.status(400).json(fields);
  if (fields.start_time === fields.end_time) return res.status(400).json({ field: 'end_time', error: 'The end time must differ from the start time' });
  try {
    const problem = await conflict(fields);
    if (problem) return res.status(409).json(problem);
    const shift = await createShift({ name: fields.name, startTime: fields.start_time, endTime: fields.end_time, by: req.user.userId });
    res.status(201).json(shift);
    await changed(req);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ field: 'name', error: 'There is already an active shift with that name' });
    console.error(err);
    res.status(500).json({ error: 'Failed to add the shift' });
  }
};

// Supervisor-only. Any of { name, start_time, end_time, is_active }. A shift with handovers is never
// deleted (see removeShift), only deactivated. Old reports keep the name they had.
const editShift = async (req, res) => {
  const { shiftId } = req.params;
  if (!UUID.test(shiftId)) return res.status(400).json({ error: 'shiftId must be a valid id' });
  const fields = readFields(req.body ?? {}, { partial: true });
  if (fields.error) return res.status(400).json(fields);
  try {
    const existing = await getShiftById(shiftId);
    if (!existing) return res.status(404).json({ error: 'Shift not found' });
    const next = { ...existing, ...fields };
    if (next.start_time === next.end_time) return res.status(400).json({ field: 'end_time', error: 'The end time must differ from the start time' });
    if (next.is_active) {
      const problem = await conflict(next);
      if (problem) return res.status(409).json(problem);
    }
    const shift = await updateShift(shiftId, {
      name: fields.name,
      startTime: fields.start_time,
      endTime: fields.end_time,
      isActive: fields.is_active,
      by: req.user.userId,
    });
    res.json(shift);
    await changed(req);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ field: 'name', error: 'There is already an active shift with that name' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update the shift' });
  }
};

// Supervisor-only. Only a shift no handover has used can be deleted (old reports point at their
// shift); otherwise 409, and the supervisor deactivates it instead. Its plans go with it, and anyone
// rostered on it becomes not rostered.
const removeShift = async (req, res) => {
  const { shiftId } = req.params;
  if (!UUID.test(shiftId)) return res.status(400).json({ error: 'shiftId must be a valid id' });
  try {
    const existing = await getShiftById(shiftId);
    if (!existing) return res.status(404).json({ error: 'Shift not found' });
    const refused = () =>
      res.status(409).json({
        error: `${existing.name} has handovers written under it, so it can't be deleted. Deactivate it instead; old reports keep pointing at it.`,
      });
    if (existing.handovers > 0) return refused();
    const result = await deleteShift(shiftId);
    if (!result.deleted) return refused();
    res.json(result);
    await changed(req);
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'This shift is in use, so it can\'t be deleted. Deactivate it instead.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to delete the shift' });
  }
};

module.exports = { getShifts, addShift, editShift, removeShift };
