const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const { listReviewed } = require('../models/reportReviewModel');
const { toRecord } = require('../scripts/export-reviews');

// Runs against the test database (tests/setupEnv.js).
describe('Supervisor review of a report', () => {
  const stamp = Date.now();
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const text = `Pampu ya majimaji kwenye ndege 5Y-KZD inavuja, iko stand namba saba. Engineer to fit seal before 0600. ${stamp}`;
  let sup;
  let crew;
  let crewId;
  let reportId;
  let taskId;

  async function account(name, role = 'ground_crew') {
    const email = `review-${name}${stamp}@kenya-airways.com`;
    const res = await request(app).post('/api/auth/register').send({ full_name: `Review ${name}`, email, password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    const token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
    return { id: res.body.user_id, token };
  }

  const review = (token, body) => request(app).put(`/api/handovers/${reportId}/review`).set(auth(token)).send(body);

  beforeAll(async () => {
    ({ token: sup } = await account('sup', 'supervisor'));
    ({ id: crewId, token: crew } = await account('crew'));
    // A report the model got wrong: procedural at 41%, component too long, stand 7 as TIME.
    const sub = await pool.query(
      `INSERT INTO handover_submissions (user_id, input_type, content, language_variant, processing_status)
       VALUES ($1, 'text', $2, 'sw', 'completed') RETURNING submission_id`,
      [crewId, text]
    );
    const rep = await pool.query(
      `INSERT INTO handover_reports (submission_id, summary, category_id, category_confidence)
       VALUES ($1, 'Pampu inavuja', (SELECT category_id FROM incident_categories WHERE category_name = 'Deviation/Discrepancy - Procedural'), 0.41)
       RETURNING report_id`,
      [sub.rows[0].submission_id]
    );
    reportId = rep.rows[0].report_id;
    for (const [type, value] of [['COMPONENT', 'Pampu ya majimaji kwenye'], ['AIRCRAFT', '5Y-KZD'], ['TIME', 'stand namba saba']]) {
      await pool.query(`INSERT INTO report_entities (report_id, entity_type, entity_text, confidence) VALUES ($1, $2, $3, 0.7)`, [reportId, type, value]);
    }
    const task = await pool.query(
      `INSERT INTO task_register (report_id, description) VALUES ($1, 'New Deviation/Discrepancy - Procedural incident reported: Pampu inavuja') RETURNING task_id`,
      [reportId]
    );
    taskId = task.rows[0].task_id;
  });

  const corrected = {
    category_name: 'Aircraft Equipment Problem',
    entities: [
      { type: 'COMPONENT', text: 'Pampu ya majimaji' },
      { type: 'AIRCRAFT', text: '5Y-KZD' },
      { type: 'LOCATION', text: 'stand namba saba' },
      { type: 'ROLE', text: 'engineer' }, // case differs from the text: still accepted
      { type: 'ROLE', text: 'Engineer' }, // duplicate: dropped
    ],
  };

  test('ground crew cannot review', async () => {
    expect((await review(crew, corrected)).statusCode).toBe(403);
  });

  test('bad input is refused and changes nothing', async () => {
    expect((await review(sup, { ...corrected, category_name: 'Spaceship Problem' })).statusCode).toBe(400);
    expect((await review(sup, { ...corrected, entities: [{ type: 'PLANET', text: '5Y-KZD' }] })).statusCode).toBe(400);
    const notInText = await review(sup, { ...corrected, entities: [{ type: 'COMPONENT', text: 'left main gear' }] });
    expect(notInText.statusCode).toBe(400);
    expect(notInText.body.error).toMatch(/doesn't appear in the handover text/);
    expect((await review(sup, { category_name: 'Aircraft Equipment Problem' })).statusCode).toBe(400);
    const missing = await request(app).put('/api/handovers/00000000-0000-0000-0000-000000000000/review').set(auth(sup)).send(corrected);
    expect(missing.statusCode).toBe(404);
    const [row] = (await pool.query(`SELECT reviewed_at FROM handover_reports WHERE report_id = $1`, [reportId])).rows;
    expect(row.reviewed_at).toBeNull();
  });

  test('a correction replaces category and entities, keeps the model’s answer and updates the task', async () => {
    const res = await review(sup, corrected);
    expect(res.statusCode).toBe(200);
    expect(res.body.category_name).toBe('Aircraft Equipment Problem');
    expect(res.body.reviewed_at).toBeTruthy();
    expect(res.body.entities.map((e) => [e.entity_type, e.entity_text]).sort()).toEqual(
      [['AIRCRAFT', '5Y-KZD'], ['COMPONENT', 'Pampu ya majimaji'], ['LOCATION', 'stand namba saba'], ['ROLE', 'engineer']].sort()
    );
    expect(res.body.review).toMatchObject({
      review_count: 1,
      reviewed_by: { full_name: 'Review sup' },
      model: { category_name: 'Deviation/Discrepancy - Procedural', category_confidence: '0.4100' },
    });
    expect(res.body.review.model.entities.map((e) => e.entity_text)).toEqual(['Pampu ya majimaji kwenye', '5Y-KZD', 'stand namba saba']);
    expect(res.body.task.description).toBe('New Aircraft Equipment Problem incident reported: Pampu inavuja');

    // No longer "needs review", even though the model's confidence was low.
    const list = await request(app).get('/api/handovers').query({ submitted_by: crewId, review: 'true' }).set(auth(sup));
    expect(list.body.total).toBe(0);
  });

  test('a second review keeps the original model answer and leaves the task alone if the category stays', async () => {
    const res = await review(sup, { ...corrected, entities: corrected.entities.slice(0, 2) });
    expect(res.statusCode).toBe(200);
    expect(res.body.entities).toHaveLength(2);
    expect(res.body.review.review_count).toBe(2);
    expect(res.body.review.model.category_name).toBe('Deviation/Discrepancy - Procedural');
    expect(res.body.review.model.entities).toHaveLength(3);
    const [task] = (await pool.query(`SELECT description FROM task_register WHERE task_id = $1`, [taskId])).rows;
    expect(task.description).toBe('New Aircraft Equipment Problem incident reported: Pampu inavuja');
  });

  test('reviewed reports export as training records with the model’s original answer', async () => {
    const row = (await listReviewed()).find((r) => r.report_id === reportId);
    const record = toRecord(row);
    expect(record).toMatchObject({
      narrative_text: text,
      incident_category: 'Aircraft Equipment Problem',
      incident_category_grouped: 'Aircraft Equipment Problem',
      language_variant: 'Swahili',
      source: 'supervisor-review',
      entities: [
        { type: 'COMPONENT', text: 'Pampu ya majimaji' },
        { type: 'AIRCRAFT', text: '5Y-KZD' },
      ],
      model_output: { incident_category: 'Deviation/Discrepancy - Procedural', category_confidence: 0.41 },
    });
    expect(record.model_output.entities).toHaveLength(3);
  });
});
