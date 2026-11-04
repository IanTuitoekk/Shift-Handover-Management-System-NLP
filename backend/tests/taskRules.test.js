const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { pickAssignee } = require('../models/taskRegisterModel');
const { activeShifts, shiftsReady } = require('../config/shifts');

// Runs against the test database (tests/setupEnv.js). Only this file rosters people on a shift,
// so automatic assignment can be checked person by person.
describe('Task assignment and resolving rules', () => {
  const stamp = Date.now();
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  let sup;
  let crew; // the assignee
  let other; // another crew member

  async function account(name, role = 'ground_crew') {
    const email = `rules-${name}${stamp}@kenya-airways.com`;
    const res = await request(app).post('/api/auth/register').send({ full_name: `Rules ${name}`, email, password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    const token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
    return { id: res.body.user_id, token };
  }

  async function task({ assignedTo = null, status = 'pending' } = {}) {
    const sub = await pool.query(
      `INSERT INTO handover_submissions (user_id, input_type, content, processing_status)
       VALUES ($1, 'text', 'Rules test', 'completed') RETURNING submission_id`,
      [other.id]
    );
    const rep = await pool.query(`INSERT INTO handover_reports (submission_id, summary) VALUES ($1, 'Rules') RETURNING report_id`, [
      sub.rows[0].submission_id,
    ]);
    const t = await pool.query(
      `INSERT INTO task_register (report_id, description, assigned_to, status, resolved_by, resolved_at)
       VALUES ($1, 'Rules test task', $2, $3, $4, $5) RETURNING task_id`,
      [rep.rows[0].report_id, assignedTo, status, status === 'resolved' ? assignedTo : null, status === 'resolved' ? new Date() : null]
    );
    return t.rows[0].task_id;
  }

  const resolve = (token, taskId) => request(app).patch(`/api/tasks/${taskId}/resolve`).set(auth(token));

  beforeAll(async () => {
    sup = await account('sup', 'supervisor');
    crew = await account('crew');
    other = await account('other');
  });

  test('ground crew cannot resolve any task, not even their own', async () => {
    const own = await task({ assignedTo: crew.id });
    for (const [who, id] of [[crew, own], [other, own], [crew, await task()]]) {
      const res = await resolve(who.token, id);
      expect(res.statusCode).toBe(403);
      const [row] = (await pool.query(`SELECT status FROM task_register WHERE task_id = $1`, [id])).rows;
      expect(row.status).toBe('pending');
    }
  });

  test('supervisors resolve any open task, and a resolved task cannot be resolved again', async () => {
    for (const id of [await task({ assignedTo: crew.id }), await task()]) {
      const res = await resolve(sup.token, id);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ status: 'resolved', resolved_by: sup.id });
      expect((await resolve(sup.token, id)).statusCode).toBe(409);
    }
  });

  test('a missing task is 404', async () => {
    expect((await resolve(sup.token, '00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
  });

  describe('marking done and sign-off', () => {
    const done = (token, taskId) => request(app).patch(`/api/tasks/${taskId}/done`).set(auth(token));
    const sendBack = (token, taskId) => request(app).patch(`/api/tasks/${taskId}/send-back`).set(auth(token));

    test('only the assignee marks a task done, once; it stays pending and is not overdue', async () => {
      const id = await task({ assignedTo: crew.id });
      await pool.query(`UPDATE task_register SET due_at = now() - interval '1 hour' WHERE task_id = $1`, [id]);
      for (const who of [other, sup]) expect((await done(who.token, id)).statusCode).toBe(403);
      const res = await done(crew.token, id);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ status: 'pending', done_by: crew.id });
      expect(res.body.done_at).toBeTruthy();
      expect((await done(crew.token, id)).statusCode).toBe(409); // already waiting
      const [counts] = (await pool.query(
        `SELECT COUNT(*) FILTER (WHERE due_at < now() AND done_at IS NULL)::int AS overdue FROM task_register WHERE task_id = $1`, [id]
      )).rows;
      expect(counts.overdue).toBe(0);
      expect((await done(crew.token, await task())).statusCode).toBe(403); // unassigned
    });

    test('a supervisor sends a done task back, or signs it off; crew cannot do either', async () => {
      const id = await task({ assignedTo: crew.id });
      expect((await sendBack(sup.token, id)).statusCode).toBe(409); // not done yet
      await done(crew.token, id);
      expect((await sendBack(crew.token, id)).statusCode).toBe(403);
      const back = await sendBack(sup.token, id);
      expect(back.statusCode).toBe(200);
      expect(back.body).toMatchObject({ status: 'pending', done_at: null, done_by: null });
      // Marked done again, then signed off.
      expect((await done(crew.token, id)).statusCode).toBe(200);
      expect((await resolve(crew.token, id)).statusCode).toBe(403);
      expect((await resolve(sup.token, id)).body).toMatchObject({ status: 'resolved', resolved_by: sup.id });
      expect((await done(crew.token, id)).statusCode).toBe(409);
      expect((await sendBack(sup.token, id)).statusCode).toBe(409);
    });

    test('reassigning a done task clears "done" for the new owner', async () => {
      const id = await task({ assignedTo: crew.id });
      await done(crew.token, id);
      const res = await request(app).patch(`/api/tasks/${id}/assign`).set(auth(sup.token)).send({ assigned_to: other.id });
      expect(res.body).toMatchObject({ assigned_to: other.id, done_at: null, done_by: null });
    });
  });

  describe('automatic assignment to the incoming shift', () => {
    const people = {};
    const ids = {}; // the seeded Day and Night shifts
    const roster = (id, shift) => pool.query(`UPDATE users SET shift_id = $2 WHERE user_id = $1`, [id, ids[shift]]);

    beforeAll(async () => {
      await shiftsReady();
      for (const s of activeShifts()) ids[s.name.toLowerCase()] = s.shift_id;
      for (const [name, shift] of [['dayWriter', 'day'], ['dayCrew', 'day'], ['nightFree', 'night'], ['nightBusy', 'night'], ['nightOff', 'night'], ['nightSup', 'night']]) {
        people[name] = await account(name, name === 'nightSup' ? 'supervisor' : 'ground_crew');
        await roster(people[name].id, shift);
      }
      await pool.query(`UPDATE users SET is_active = false WHERE user_id = $1`, [people.nightOff.id]);
      // Other test files may submit handovers meanwhile and give nightFree a task, so nightBusy has many.
      for (let i = 0; i < 5; i++) await task({ assignedTo: people.nightBusy.id });
    });

    test('the least busy active crew member on that shift; never supervisors, deactivated people or the writer', async () => {
      expect(await pickAssignee({ shiftId: ids.night })).toBe(people.nightFree.id);
      expect(await pickAssignee({ shiftId: ids.night, excludeUserId: people.nightFree.id })).toBe(people.nightBusy.id);
      expect(await pickAssignee({ shiftId: ids.day, excludeUserId: people.dayWriter.id })).toBe(people.dayCrew.id);
    });

    test('a day handover goes to the night crew, a night handover to the day crew', async () => {
      const submit = (shift) =>
        request(app)
          .post('/api/handovers')
          .set(auth(people.dayWriter.token))
          .send({ narrative_text: `Hydraulic pump leak on 5Y-KZD at stand 7. Rules ${shift} ${stamp}`, shift });
      const day = await submit('Day');
      expect(day.statusCode).toBe(201);
      expect(day.body.task.assigned_to).toBe(people.nightFree.id);
      expect(day.body.task.assignee).toMatchObject({ user_id: people.nightFree.id, full_name: 'Rules nightFree' });
      const night = await submit('Night');
      expect(night.body.task.assigned_to).toBe(people.dayCrew.id); // the writer is on days too, but never gets their own
    }, 15000);

    test('supervisors roster crew on a shift; with nobody on the incoming shift the task stays unassigned', async () => {
      const edit = (body) => request(app).patch(`/api/users/${people.dayCrew.id}`).set(auth(sup.token)).send(body);
      expect((await edit({ shift_id: 'evening' })).statusCode).toBe(400);
      expect((await edit({ shift_id: '00000000-0000-0000-0000-000000000000' })).statusCode).toBe(400); // not a shift
      expect((await edit({ shift_id: ids.night })).body).toMatchObject({ shift_id: ids.night, shift_name: 'Night' });
      expect((await edit({ shift_id: '' })).body.shift_id).toBeNull();
      expect((await request(app).patch(`/api/users/${people.dayCrew.id}`).set(auth(crew.token)).send({ shift_id: ids.day })).statusCode).toBe(403);
      // Only the writer is left on days now.
      expect(await pickAssignee({ shiftId: ids.day, excludeUserId: people.dayWriter.id })).toBeNull();
    });
  });
});
