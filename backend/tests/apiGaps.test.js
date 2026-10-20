const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

// Runs against the test database (tests/setupEnv.js). Other test files run at the same time, so
// these tests isolate their own rows (by submitter or unique text) or check "at least".
describe('Filters, stats and smaller API additions', () => {
  const stamp = Date.now();
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const HOUR = 3600 * 1000;
  let sup;
  let crew;
  let crewId;
  let otherId;

  async function account(name, role = 'ground_crew') {
    const email = `gaps-${name}${stamp}@kenya-airways.com`;
    const res = await request(app).post('/api/auth/register').send({ full_name: `Gaps ${name}`, email, password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    const token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
    return { id: res.body.user_id, token };
  }

  /** A report by `userId`, `hoursAgo` old, with optional category, confidence, entities and task. */
  async function report(userId, { hoursAgo = 0, category = null, confidence = null, entities = [], task = null } = {}) {
    const at = new Date(Date.now() - hoursAgo * HOUR);
    const sub = await pool.query(
      `INSERT INTO handover_submissions (user_id, input_type, content, processing_status, submitted_at)
       VALUES ($1, 'text', 'Gaps test handover', 'completed', $2) RETURNING submission_id`,
      [userId, at]
    );
    const r = await pool.query(
      `INSERT INTO handover_reports (submission_id, summary, category_id, category_confidence, generated_at)
       VALUES ($1, $2, (SELECT category_id FROM incident_categories WHERE category_name = $3), $4, $5) RETURNING report_id`,
      [sub.rows[0].submission_id, `Summary ${hoursAgo}h`, category, confidence, at]
    );
    const reportId = r.rows[0].report_id;
    for (const [type, text] of entities) {
      await pool.query(`INSERT INTO report_entities (report_id, entity_type, entity_text) VALUES ($1, $2, $3)`, [reportId, type, text]);
    }
    let taskId = null;
    if (task) {
      const t = await pool.query(
        `INSERT INTO task_register (report_id, description, assigned_to, status, due_at, resolved_by, resolved_at)
         VALUES ($1, 'New incident reported: x', $2, $3, $4, $5, $6) RETURNING task_id`,
        [reportId, task.assignedTo ?? null, task.status ?? 'pending', task.dueAt ?? null, task.resolvedBy ?? null, task.resolvedBy ? new Date() : null]
      );
      taskId = t.rows[0].task_id;
    }
    return { reportId, taskId };
  }

  beforeAll(async () => {
    ({ token: sup } = await account('sup', 'supervisor'));
    ({ id: crewId, token: crew } = await account('crew'));
    ({ id: otherId } = await account('other'));
  });

  test('GET /api/config/shifts describes the shifts without sign-in', async () => {
    const res = await request(app).get('/api/config/shifts');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ timezone: 'Africa/Nairobi', day_start_hour: 6, night_start_hour: 18 });
    expect(res.body.shifts).toEqual([
      { key: 'day', name: 'Day', start: '06:00', end: '18:00' },
      { key: 'night', name: 'Night', start: '18:00', end: '06:00' },
    ]);
  });

  test('report list filters by category, confidence, review and dates, and sorts by confidence', async () => {
    await report(otherId, { hoursAgo: 1, category: 'Aircraft Equipment Problem', confidence: 0.95 });
    await report(otherId, { hoursAgo: 2, category: 'Aircraft Equipment Problem', confidence: 0.7 });
    await report(otherId, { hoursAgo: 3, category: 'Other/Rare Ground Event', confidence: 0.4 });
    await report(otherId, { hoursAgo: 50 }); // unclassified, two days ago
    const list = (query) => request(app).get('/api/handovers').query({ submitted_by: otherId, ...query }).set(auth(crew));

    const all = await list({});
    expect(all.body).toMatchObject({ total: 4, needs_review: 2 });
    expect(all.body.shift_counts.day + all.body.shift_counts.night).toBe(4);

    expect((await list({ category: 'Aircraft Equipment Problem' })).body.total).toBe(2);
    expect((await list({ category: 'unclassified' })).body.total).toBe(1);
    expect((await list({ review: 'true' })).body.total).toBe(2);
    expect((await list({ review: 'false' })).body.total).toBe(2);
    expect((await list({ min_confidence: 0.6, max_confidence: 0.8 })).body.total).toBe(1);
    expect((await list({ min_confidence: 0.8 })).body.total).toBe(1);
    expect((await list({ from: new Date(Date.now() - 24 * HOUR).toISOString() })).body.total).toBe(3);
    expect((await list({ to: new Date(Date.now() - 24 * HOUR).toISOString() })).body.total).toBe(1);

    const byConfidence = (await list({ sort: 'confidence' })).body.reports.map((r) => r.category_confidence);
    expect(byConfidence).toEqual([null, '0.4000', '0.7000', '0.9500']);

    expect((await list({ review: 'maybe' })).statusCode).toBe(400);
    expect((await list({ min_confidence: 2 })).statusCode).toBe(400);
    expect((await list({ from: 'yesterday' })).statusCode).toBe(400);
    expect((await list({ sort: 'random' })).statusCode).toBe(400);
  });

  test('GET /api/stats/overview counts shifts, hours, categories and tasks', async () => {
    const before = (await request(app).get('/api/stats/overview').set(auth(sup))).body;
    await report(crewId, { category: 'Aircraft Equipment Problem', confidence: 0.9 });
    await report(crewId, { confidence: null });
    const res = await request(app).get('/api/stats/overview').query({ shifts: 4 }).set(auth(sup));
    expect(res.statusCode).toBe(200);
    const s = res.body;
    expect(s.recent_shifts).toHaveLength(4);
    expect(s.current_shift).toEqual(s.recent_shifts[3]);
    expect(new Date(s.current_shift.start).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(s.current_shift.end).getTime()).toBeGreaterThan(Date.now());
    expect(s.current_shift.reports).toBeGreaterThanOrEqual(before.current_shift.reports + 2);
    expect(s.current_shift.low_confidence).toBeGreaterThanOrEqual(before.current_shift.low_confidence + 1);
    expect(s.today.reports_per_hour).toHaveLength(24);
    expect(s.today.reports_per_hour.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
    expect(s.reports.total).toBeGreaterThanOrEqual(before.reports.total + 2);
    expect(s.categories.find((c) => c.category_name === 'Aircraft Equipment Problem').reports).toBeGreaterThanOrEqual(1);
    expect(s.tasks).toEqual({ open: expect.any(Number), overdue: expect.any(Number), unassigned: expect.any(Number) });
    expect((await request(app).get('/api/stats/overview').query({ shifts: 0 }).set(auth(sup))).statusCode).toBe(400);
  });

  test('GET /api/insights/entities finds aircraft mentioned in more than one report', async () => {
    const reg = `5Y-G${String(stamp).slice(-5)}`;
    await report(otherId, { entities: [['AIRCRAFT', reg], ['COMPONENT', 'left main gear']] });
    await report(otherId, { entities: [['AIRCRAFT', reg.toLowerCase()], ['AIRCRAFT', reg]] }); // counted once
    await report(otherId, { hoursAgo: 24 * 30, entities: [['AIRCRAFT', reg]] }); // a month ago

    const res = await request(app).get('/api/insights/entities').query({ types: 'AIRCRAFT', limit: 50 }).set(auth(crew));
    expect(res.statusCode).toBe(200);
    expect(res.body.find((e) => e.entity_text.toUpperCase() === reg)).toMatchObject({ entity_type: 'AIRCRAFT', entity_text: reg, report_count: 3 });

    const recent = await request(app)
      .get('/api/insights/entities')
      .query({ types: 'AIRCRAFT', since: new Date(Date.now() - 7 * 24 * HOUR).toISOString(), limit: 50 })
      .set(auth(crew));
    expect(recent.body.find((e) => e.entity_text === reg).report_count).toBe(2);
    expect((await request(app).get('/api/insights/entities').query({ types: 'PLANES' }).set(auth(crew))).statusCode).toBe(400);
  });

  test('GET /api/users/workload counts open, overdue, resolved and handovers per person', async () => {
    const { id } = await account('busy');
    await report(id, { task: { assignedTo: id, dueAt: new Date(Date.now() - HOUR) } }); // open, overdue, handover
    await report(otherId, { task: { assignedTo: id } }); // open
    await report(otherId, { task: { status: 'resolved', resolvedBy: id } }); // resolved

    const res = await request(app).get('/api/users/workload').set(auth(sup));
    expect(res.statusCode).toBe(200);
    expect(res.body.people.find((p) => p.user_id === id)).toMatchObject({ open: 2, overdue: 1, resolved_since: 1, handovers_since: 1 });
    expect((await request(app).get('/api/users/workload').set(auth(crew))).statusCode).toBe(403);
  });

  test('tasks carry their report context, and supervisors can unassign', async () => {
    const { taskId } = await report(otherId, { category: 'Aircraft Equipment Problem', confidence: 0.88, task: { assignedTo: crewId } });
    const task = (await request(app).get('/api/tasks').set(auth(crew))).body.find((t) => t.task_id === taskId);
    expect(task.report).toEqual({ category_name: 'Aircraft Equipment Problem', summary: 'Summary 0h', category_confidence: '0.8800' });

    expect((await request(app).patch(`/api/tasks/${taskId}/assign`).set(auth(sup)).send({})).statusCode).toBe(400);
    const res = await request(app).patch(`/api/tasks/${taskId}/assign`).set(auth(sup)).send({ assigned_to: null });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ assigned_to: null, needs_reassignment: false });

    const { taskId: done } = await report(otherId, { task: { status: 'resolved', resolvedBy: crewId } });
    expect((await request(app).patch(`/api/tasks/${done}/assign`).set(auth(sup)).send({ assigned_to: crewId })).statusCode).toBe(400);
  });

  test('PATCH /api/notifications/read marks many at once, only for notifications the user can see', async () => {
    const { reportId } = await report(otherId);
    const notify = async (recipient, sentAt = new Date()) =>
      (
        await pool.query(`INSERT INTO notifications (report_id, recipient_id, message, sent_at) VALUES ($1, $2, 'Gaps', $3) RETURNING notif_id`, [
          reportId,
          recipient,
          sentAt,
        ])
      ).rows[0].notif_id;
    const mine1 = await notify(crewId);
    const mine2 = await notify(crewId);
    const old = await notify(crewId, new Date('2020-01-01T00:00:00Z'));
    const theirs = await notify(otherId);

    const mark = (body) => request(app).patch('/api/notifications/read').set(auth(crew)).send(body);
    expect((await mark({ notif_ids: [mine1, mine2, theirs] })).body.marked).toBe(2);
    expect((await mark({ notif_ids: [mine1] })).body.marked).toBe(0); // already read
    expect((await mark({ before: '2021-01-01T00:00:00Z' })).body.marked).toBeGreaterThanOrEqual(1);
    const reads = await pool.query(`SELECT notif_id FROM notification_reads WHERE user_id = $1`, [crewId]);
    expect(reads.rows.map((r) => r.notif_id)).toEqual(expect.arrayContaining([mine1, mine2, old]));
    expect(reads.rows.map((r) => r.notif_id)).not.toContain(theirs);

    expect((await mark({})).statusCode).toBe(400);
    expect((await mark({ notif_ids: [mine1], before: '2021-01-01T00:00:00Z' })).statusCode).toBe(400);
    expect((await mark({ notif_ids: ['nope'] })).statusCode).toBe(400);
  });
});
