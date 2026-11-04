const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { chooseAssignee } = require('../services/assignmentService');
const { savePlan } = require('../models/shiftPlanModel');
const { activeShifts, incomingShift, shiftAt, shiftDate, shiftOn, shiftsReady, upcomingShifts } = require('../config/shifts');

// Runs against the test database (tests/setupEnv.js). Handovers only ever go to the current or next
// shift, so plans here are for 2030 (set up in the database, past the API's limit) or for the shift
// after next, and never affect handovers other test files submit meanwhile.
describe('Shift plans and who takes over', () => {
  const stamp = Date.now();
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const DATE = '2030-01-15';
  const people = {};

  async function account(name, role = 'ground_crew') {
    const email = `plan-${name}${stamp}@kenya-airways.com`;
    const res = await request(app).post('/api/auth/register').send({ full_name: `Plan ${name}`, email, password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    const token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
    return { id: res.body.user_id, token };
  }

  const ids = {}; // the seeded Day and Night shifts
  let LATER; // the shift after next
  const save = (token, members, date = shiftDate(LATER), shiftId = LATER.shift_id) =>
    request(app).put(`/api/shift-plans/${date}/${shiftId}`).set(auth(token)).send({ members });
  const plan = (members) => savePlan({ date: DATE, shiftId: ids.night, members: members.map((m) => ({ takes_over_from: null, ...m })), by: people.sup.id });
  // A day-shift handover written at 10:00 on DATE goes to that evening's night shift.
  const dayHandoverAt = () => new Date(shiftOn(DATE, ids.day).start.getTime() + 4 * 3600 * 1000);

  beforeAll(async () => {
    await shiftsReady();
    for (const s of activeShifts()) ids[s.name.toLowerCase()] = s.shift_id;
    LATER = upcomingShifts(3)[2];
    for (const name of ['sup', 'writer', 'relief', 'spare', 'other']) people[name] = await account(name, name === 'sup' ? 'supervisor' : 'ground_crew');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM shift_plans WHERE shift_date >= '2030-01-01'`);
  });

  test('shift helpers: a shift is named by its start date and key, and handovers go to the next one', () => {
    const now = shiftAt();
    expect(shiftOn(shiftDate(now), now.shift_id).start).toEqual(now.start);
    expect(shiftOn('2030-02-30', ids.day)).toBeNull();
    expect(shiftOn(DATE, 'not-a-shift')).toBeNull();
    const [a, b, c] = upcomingShifts(3);
    expect(a.end).toEqual(b.start);
    expect(b.end).toEqual(c.start);
    const at = dayHandoverAt();
    expect(incomingShift(ids.day, at)).toMatchObject({ shift_id: ids.night, start: shiftOn(DATE, ids.night).start });
    expect(shiftDate(incomingShift(ids.night, at))).toBe(DATE); // already on the day shift: it is the incoming one
  });

  test('only supervisors plan, only active ground crew, up to 60 days ahead, and nobody takes over from their own shift', async () => {
    const { sup, writer, relief, spare } = people;
    expect((await save(writer.token, [{ user_id: relief.id }])).statusCode).toBe(403);
    expect((await save(sup.token, [{ user_id: relief.id }], DATE, '00000000-0000-0000-0000-000000000000')).statusCode).toBe(400);
    expect((await save(sup.token, [{ user_id: relief.id }], '2020-01-01', ids.day)).body.error).toMatch(/ended/);
    expect((await save(sup.token, [{ user_id: relief.id }], DATE, ids.night)).body.error).toMatch(/60 days ahead/);
    expect((await save(sup.token, [{ user_id: sup.id }])).statusCode).toBe(400); // a supervisor
    expect((await save(sup.token, [{ user_id: relief.id }, { user_id: relief.id }])).statusCode).toBe(400);
    expect((await save(sup.token, [{ user_id: relief.id, takes_over_from: spare.id }, { user_id: spare.id }])).body.error).toMatch(/same shift/);
    expect((await save(sup.token, [{ user_id: relief.id, takes_over_from: sup.id }])).statusCode).toBe(400);
    await pool.query(`UPDATE users SET is_active = false WHERE user_id = $1`, [people.other.id]);
    expect((await save(sup.token, [{ user_id: people.other.id }])).statusCode).toBe(400);

    const res = await save(sup.token, [{ user_id: relief.id, takes_over_from: writer.id }, { user_id: spare.id }]);
    try {
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ date: shiftDate(LATER), shift_id: LATER.shift_id });
      expect(res.body.plan.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user_id: relief.id, takes_over_from: writer.id, takes_over_from_name: 'Plan writer' }),
          expect.objectContaining({ user_id: spare.id, takes_over_from: null }),
        ])
      );
    } finally {
      await save(sup.token, []);
    }
  });

  test('a handover goes to whoever takes over from the writer, else the least busy on the plan', async () => {
    const { writer, relief, spare } = people;
    await plan([{ user_id: relief.id, takes_over_from: writer.id }, { user_id: spare.id }]);
    const toRelief = await chooseAssignee({ writerId: writer.id, shiftId: ids.day, at: dayHandoverAt() });
    expect(toRelief).toMatchObject({ userId: relief.id, rule: 'takes_over', shift: { shift_id: ids.night, date: DATE } });

    // Someone nobody takes over from: the least busy on the plan (spare has no tasks, relief may).
    await pool.query(
      `INSERT INTO task_register (report_id, description, assigned_to)
       SELECT report_id, 'Plan busy', $1 FROM handover_reports LIMIT 1`,
      [relief.id]
    );
    expect(await chooseAssignee({ writerId: people.other.id, shiftId: ids.day, at: dayHandoverAt() })).toMatchObject({ userId: spare.id, rule: 'shift_plan' });

    // The writer is never given their own task, even if planned on the incoming shift.
    await plan([{ user_id: writer.id }]);
    expect(await chooseAssignee({ writerId: writer.id, shiftId: ids.day, at: dayHandoverAt() })).toMatchObject({ userId: null, rule: null });
  });

  test('clearing a plan goes back to the roster, and the API lists plans and each person’s part', async () => {
    const { sup, writer, relief } = people;
    await plan([]);
    expect([null, 'roster']).toContain((await chooseAssignee({ writerId: writer.id, shiftId: ids.day, at: dayHandoverAt() })).rule);

    // Plan a real upcoming shift (the one after next), read it back, then clear it.
    const next = LATER;
    const date = shiftDate(next);
    expect((await save(sup.token, [{ user_id: relief.id, takes_over_from: writer.id }], date, next.shift_id)).statusCode).toBe(200);
    try {
      const list = await request(app).get('/api/shift-plans').set(auth(sup.token));
      expect(list.statusCode).toBe(200);
      expect(list.body.shifts).toHaveLength(4);
      expect(list.body.shifts[0].current).toBe(true);
      expect(list.body.shifts[2]).toMatchObject({ date, shift_id: next.shift_id, previous: { shift_id: list.body.shifts[1].shift_id } });
      expect(list.body.shifts[2].plan.members[0]).toMatchObject({ user_id: relief.id, takes_over_from: writer.id });
      expect(list.body.crew.some((c) => c.user_id === sup.id)).toBe(false);
      expect((await request(app).get('/api/shift-plans').set(auth(writer.token))).statusCode).toBe(403);

      const mine = (await request(app).get('/api/shift-plans/me').set(auth(writer.token))).body;
      expect(mine).toEqual([expect.objectContaining({ date, shift_id: next.shift_id, on_shift: false, taken_over_by: [{ user_id: relief.id, full_name: 'Plan relief' }] })]);
      const theirs = (await request(app).get('/api/shift-plans/me').set(auth(relief.token))).body;
      expect(theirs[0]).toMatchObject({ on_shift: true, takes_over_from: { user_id: writer.id, full_name: 'Plan writer' } });
    } finally {
      await save(sup.token, [], date, next.shift_id);
    }
  });

  test('a supervisor creates a shift further ahead: it is listed after the coming shifts until cleared', async () => {
    const { sup, relief } = people;
    const far = shiftAt(new Date(Date.now() + 10 * 24 * 3600 * 1000));
    const date = shiftDate(far);
    const one = await request(app).get(`/api/shift-plans/${date}/${far.shift_id}`).set(auth(sup.token));
    expect(one.statusCode).toBe(200);
    expect(one.body).toMatchObject({ date, shift_id: far.shift_id, plan: null, current: false });
    expect(one.body.previous.shift_id).not.toBe(far.shift_id);
    expect((await request(app).get(`/api/shift-plans/${DATE}/${ids.night}`).set(auth(sup.token))).statusCode).toBe(400);

    expect((await save(sup.token, [{ user_id: relief.id }], date, far.shift_id)).statusCode).toBe(200);
    try {
      const { shifts, max_days_ahead } = (await request(app).get('/api/shift-plans').set(auth(sup.token))).body;
      expect(max_days_ahead).toBe(60);
      const created = shifts.find((s) => s.date === date && s.shift_id === far.shift_id);
      expect(created).toMatchObject({ created: true, plan: { members: [expect.objectContaining({ user_id: relief.id })] } });
      expect(shifts.indexOf(created)).toBeGreaterThanOrEqual(4);
    } finally {
      await save(sup.token, [], date, far.shift_id);
    }
    const after = (await request(app).get('/api/shift-plans').set(auth(sup.token))).body.shifts;
    expect(after.some((s) => s.date === date && s.shift_id === far.shift_id)).toBe(false);
  });
});
