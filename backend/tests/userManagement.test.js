const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

// Runs against the test database (tests/setupEnv.js).
describe('Supervisor user management', () => {
  const stamp = Date.now();
  const email = (name) => `um-${name}${stamp}@kenya-airways.com`;
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const login = (address, password = 'testpass123') => request(app).post('/api/auth/login').send({ email: address, password });

  async function register(name, role = 'ground_crew') {
    const res = await request(app).post('/api/auth/register').send({ full_name: `UM ${name}`, email: email(name), password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    return res.body.user_id;
  }

  /** A handover submitted by `userId`, with its report, a task and a notification addressed to them. */
  async function giveRecords(userId, { assigned = false, resolved = false } = {}) {
    const sub = await pool.query(
      `INSERT INTO handover_submissions (user_id, input_type, content, processing_status) VALUES ($1, 'text', 'Tyre worn at stand 7', 'completed') RETURNING submission_id`,
      [userId]
    );
    const report = await pool.query(`INSERT INTO handover_reports (submission_id, summary) VALUES ($1, 'Tyre worn') RETURNING report_id`, [
      sub.rows[0].submission_id,
    ]);
    const reportId = report.rows[0].report_id;
    const task = await pool.query(
      `INSERT INTO task_register (report_id, description, assigned_to, status, resolved_by, resolved_at)
       VALUES ($1, 'Replace tyre', $2, $3, $4, $5) RETURNING task_id`,
      [reportId, assigned ? userId : null, resolved ? 'resolved' : 'pending', resolved ? userId : null, resolved ? new Date() : null]
    );
    const notif = await pool.query(`INSERT INTO notifications (report_id, recipient_id, message) VALUES ($1, $2, 'For you') RETURNING notif_id`, [
      reportId,
      userId,
    ]);
    await pool.query(`INSERT INTO notification_reads (notif_id, user_id) VALUES ($1, $2)`, [notif.rows[0].notif_id, userId]);
    return { reportId, taskId: task.rows[0].task_id };
  }

  let sup;
  let supId;
  beforeAll(async () => {
    supId = await register('sup', 'supervisor');
    sup = (await login(email('sup'))).body.token;
  });

  test('ground crew get 403 on every management endpoint', async () => {
    const crewId = await register('nosy');
    const crew = (await login(email('nosy'))).body.token;
    expect((await request(app).get('/api/users/directory').set(auth(crew))).statusCode).toBe(403);
    expect((await request(app).patch(`/api/users/${crewId}`).set(auth(crew)).send({ full_name: 'X' })).statusCode).toBe(403);
    expect((await request(app).patch(`/api/users/${supId}/active`).set(auth(crew)).send({ active: false })).statusCode).toBe(403);
    expect((await request(app).delete(`/api/users/${crewId}`).set(auth(crew))).statusCode).toBe(403);
  });

  test('supervisor edits ground crew details; staff numbers are unique; supervisors are not editable', async () => {
    const aId = await register('edit-a');
    const bId = await register('edit-b');
    const res = await request(app)
      .patch(`/api/users/${aId}`)
      .set(auth(sup))
      .send({ full_name: 'Amina Wekesa', email: email('amina'), staff_number: `KQ-${stamp}`, station: 'JKIA' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ full_name: 'Amina Wekesa', email: email('amina'), staff_number: `KQ-${stamp}`, station: 'JKIA' });
    expect(res.body).not.toHaveProperty('password_hash');

    const clash = await request(app).patch(`/api/users/${bId}`).set(auth(sup)).send({ staff_number: `KQ-${stamp}` });
    expect(clash.statusCode).toBe(409);
    expect((await request(app).patch(`/api/users/${bId}`).set(auth(sup)).send({ email: email('amina') })).statusCode).toBe(409);

    const cleared = await request(app).patch(`/api/users/${aId}`).set(auth(sup)).send({ station: '' });
    expect(cleared.body.station).toBeNull();

    const supB = await register('edit-sup', 'supervisor');
    expect((await request(app).patch(`/api/users/${supB}`).set(auth(sup)).send({ full_name: 'Nope' })).statusCode).toBe(403);
  });

  test('deactivate records who/when/why, flags open tasks, ends sessions; reactivate restores', async () => {
    const id = await register('leaver');
    const token = (await login(email('leaver'))).body.token;
    const { taskId } = await giveRecords(id, { assigned: true });

    expect((await request(app).patch(`/api/users/${supId}/active`).set(auth(sup)).send({ active: false })).statusCode).toBe(400);

    const res = await request(app).patch(`/api/users/${id}/active`).set(auth(sup)).send({ active: false, reason: 'Left the company' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ is_active: false, deactivated_by: supId, deactivation_reason: 'Left the company', tasks_needing_reassignment: 1 });
    expect(res.body.deactivated_at).toBeTruthy();

    expect((await request(app).get('/api/auth/me').set(auth(token))).statusCode).toBe(401);
    expect((await login(email('leaver'))).statusCode).toBe(401);

    const tasks = (await request(app).get('/api/tasks').set(auth(sup))).body;
    const task = tasks.find((t) => t.task_id === taskId);
    expect(task.needs_reassignment).toBe(true);
    expect(task.assignee).toMatchObject({ user_id: id, is_active: false, anonymised: false });

    const dir = (await request(app).get('/api/users/directory').set(auth(sup))).body.find((u) => u.user_id === id);
    expect(dir.deactivated_by).toMatchObject({ user_id: supId, full_name: 'UM sup' });

    // Assigning to a deactivated person is refused.
    const assign = await request(app).patch(`/api/tasks/${taskId}/assign`).set(auth(sup)).send({ assigned_to: id });
    expect(assign.statusCode).toBe(400);

    const back = await request(app).patch(`/api/users/${id}/active`).set(auth(sup)).send({ active: true });
    expect(back.statusCode).toBe(200);
    expect(back.body).toMatchObject({ is_active: true, deactivated_at: null, deactivation_reason: null });
    expect((await request(app).get('/api/tasks').set(auth(sup))).body.find((t) => t.task_id === taskId).needs_reassignment).toBe(false);
    expect((await login(email('leaver'))).statusCode).toBe(200);
  });

  test('deleting an active account or a supervisor is refused', async () => {
    const crewId = await register('still-here');
    expect((await request(app).delete(`/api/users/${crewId}`).set(auth(sup))).statusCode).toBe(409);

    const supB = await register('sup-b', 'supervisor');
    await request(app).patch(`/api/users/${supB}/active`).set(auth(sup)).send({ active: false });
    expect((await request(app).delete(`/api/users/${supB}`).set(auth(sup))).statusCode).toBe(403);
    expect((await pool.query(`SELECT 1 FROM users WHERE user_id = $1`, [supB])).rowCount).toBe(1);
  });

  test('a deactivated account with no records is deleted outright', async () => {
    const id = await register('no-records');
    await request(app).patch(`/api/users/${id}/active`).set(auth(sup)).send({ active: false });
    const res = await request(app).delete(`/api/users/${id}`).set(auth(sup));
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('deleted');
    expect((await pool.query(`SELECT 1 FROM users WHERE user_id = $1`, [id])).rowCount).toBe(0);
  });

  test('a deactivated account with records is anonymised and history stays linked', async () => {
    const id = await register('with-records');
    const name = 'UM with-records';
    const address = email('with-records');
    await request(app).patch(`/api/users/${id}`).set(auth(sup)).send({ staff_number: `KQR-${stamp}`, station: 'Mombasa' });
    const submitted = await giveRecords(id, { assigned: true });
    const resolved = await giveRecords(id, { resolved: true });

    await request(app).patch(`/api/users/${id}/active`).set(auth(sup)).send({ active: false, reason: `Personal note about ${name}` });
    const res = await request(app).delete(`/api/users/${id}`).set(auth(sup));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'anonymised', tasks_unassigned: 1 });

    // Handovers and tasks are still there, linked to the same id, shown as "Former employee".
    const report = (await request(app).get(`/api/handovers/${submitted.reportId}`).set(auth(sup))).body;
    expect(report.submitted_by).toMatchObject({ user_id: id, full_name: 'Former employee', anonymised: true });
    const tasks = (await request(app).get('/api/tasks').set(auth(sup))).body;
    const open = tasks.find((t) => t.task_id === submitted.taskId);
    expect(open).toMatchObject({ assigned_to: null, needs_reassignment: true });
    const done = tasks.find((t) => t.task_id === resolved.taskId);
    expect(done.resolver).toMatchObject({ user_id: id, full_name: 'Former employee', anonymised: true });

    // Their personal notifications and read receipts are gone.
    expect((await pool.query(`SELECT 1 FROM notifications WHERE recipient_id = $1`, [id])).rowCount).toBe(0);
    expect((await pool.query(`SELECT 1 FROM notification_reads WHERE user_id = $1`, [id])).rowCount).toBe(0);

    // The old name, email and staff number appear in no text column anywhere in the database.
    const columns = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')`
    );
    for (const { table_name, column_name } of columns.rows) {
      const hit = await pool.query(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE "${column_name}" ILIKE ANY ($1)`,
        [[`%${name}%`, `%${address}%`, `%KQR-${stamp}%`]]
      );
      expect({ table_name, column_name, n: hit.rows[0].n }).toEqual({ table_name, column_name, n: 0 });
    }

    // Can't log in with the old password, can't be reactivated, and the email is free again.
    expect((await login(address)).statusCode).toBe(401);
    expect((await request(app).patch(`/api/users/${id}/active`).set(auth(sup)).send({ active: true })).statusCode).toBe(409);
    const again = await request(app).post('/api/auth/register').send({ full_name: 'New Hire', email: address, password: 'testpass123' });
    expect(again.statusCode).toBe(201);
  });
});
