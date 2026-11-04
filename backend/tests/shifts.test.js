const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const shifts = require('../config/shifts');

// Runs against the test database (tests/setupEnv.js). Test files run one at a time (--runInBand),
// so changing the shifts here can't disturb other files; afterAll puts Day and Night back.
describe('Shifts: named daily windows that supervisors manage', () => {
  const stamp = Date.now();
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const HOUR = 3600 * 1000;
  // Wall-clock time in Africa/Nairobi (UTC+3, no daylight saving) on 3 Nov 2026, as a Date.
  const nairobi = (hhmm, day = 3) => new Date(`2026-11-0${day}T${hhmm}:00+03:00`);
  let sup;
  let crew;
  const seeded = {};

  async function account(name, role = 'ground_crew') {
    const email = `shifts-${name}${stamp}@kenya-airways.com`;
    const res = await request(app).post('/api/auth/register').send({ full_name: `Shifts ${name}`, email, password: 'testpass123' });
    if (role !== 'ground_crew') await pool.query(`UPDATE users SET role = $1 WHERE user_id = $2`, [role, res.body.user_id]);
    const token = (await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).body.token;
    return { id: res.body.user_id, token };
  }

  const add = (token, body) => request(app).post('/api/shifts').set(auth(token)).send(body);
  const edit = (token, id, body) => request(app).patch(`/api/shifts/${id}`).set(auth(token)).send(body);

  beforeAll(async () => {
    sup = await account('sup', 'supervisor');
    crew = await account('crew');
    await shifts.shiftsReady();
    for (const s of shifts.activeShifts()) seeded[s.name] = s.shift_id;
  });

  afterAll(async () => {
    // Back to the seeded Day and Night only.
    await pool.query(`UPDATE shifts SET is_active = (shift_id = ANY($1::uuid[]))`, [[seeded.Day, seeded.Night]]);
    await pool.query(`UPDATE shifts SET name = 'Day', start_time = '06:00', end_time = '18:00' WHERE shift_id = $1`, [seeded.Day]);
    await shifts.loadShifts();
  });

  describe('which shift a moment belongs to (the shared helper)', () => {
    afterEach(() => shifts.loadShifts());

    test('a shift crossing midnight, and the exact boundary times', () => {
      shifts.setShifts([
        { shift_id: 'early', name: 'Early', start_time: '06:00', end_time: '14:00' },
        { shift_id: 'late', name: 'Late', start_time: '14:00', end_time: '22:00' },
        { shift_id: 'over', name: 'Overnight', start_time: '22:00', end_time: '06:00' },
      ]);
      const at = (t, day) => shifts.shiftAt(nairobi(t, day));
      // 02:30 is in the overnight shift that began at 22:00 the evening before.
      expect(at('02:30', 4)).toMatchObject({ shift_id: 'over', start: nairobi('22:00', 3), end: nairobi('06:00', 4) });
      // A boundary belongs to the shift starting then, never the one ending.
      expect(at('22:00').shift_id).toBe('over');
      expect(shifts.shiftAt(new Date(nairobi('22:00') - 1000)).shift_id).toBe('late');
      expect(at('06:00', 4)).toMatchObject({ shift_id: 'early', start: nairobi('06:00', 4) });
      expect(at('14:00').shift_id).toBe('late');
      // The shift before 02:30 is the late one; a late handover for Early goes to the shift on duty now.
      expect(shifts.previousShift(nairobi('02:30', 4))).toMatchObject({ shift_id: 'late', end: nairobi('22:00', 3) });
      expect(shifts.incomingShift('early', nairobi('23:00'))).toMatchObject({ shift_id: 'over', start: nairobi('22:00') });
      expect(shifts.incomingShift('over', nairobi('05:30', 4))).toMatchObject({ shift_id: 'early', start: nairobi('06:00', 4) });
      expect(shifts.upcomingShifts(3, nairobi('02:30', 4)).map((s) => s.shift_id)).toEqual(['over', 'early', 'late']);
      expect(shifts.operationalDay(nairobi('02:30', 4))).toEqual({ start: nairobi('06:00', 3), end: nairobi('06:00', 4) });
    });

    test('a time no shift covers has no shift, and nothing breaks', () => {
      shifts.setShifts([{ shift_id: 'day', name: 'Day', start_time: '06:00', end_time: '18:00' }]);
      expect(shifts.shiftAt(nairobi('20:00'))).toBeNull();
      expect(shifts.previousShift(nairobi('20:00'))).toMatchObject({ shift_id: 'day', end: nairobi('18:00') });
      expect(shifts.incomingShift(null, nairobi('20:00'))).toMatchObject({ start: nairobi('06:00', 4) });
      expect(shifts.upcomingShifts(2, nairobi('20:00')).map((s) => +s.start)).toEqual([+nairobi('06:00', 4), +nairobi('06:00', 5)]);
      expect(shifts.recentShifts(2, nairobi('20:00'))).toHaveLength(2);

      shifts.setShifts([]);
      expect(shifts.shiftAt(nairobi('10:00'))).toBeNull();
      expect(shifts.incomingShift(null, nairobi('10:00'))).toBeNull();
      expect(shifts.upcomingShifts(3)).toEqual([]);
      expect(shifts.shiftConfig().windows).toEqual([]);
    });

    test('overlap: touching shifts are fine, crossing midnight is taken into account', () => {
      const night = { name: 'Night', start_time: '18:00', end_time: '06:00' };
      expect(shifts.findOverlap({ start_time: '06:00', end_time: '18:00' }, [night])).toBeNull();
      expect(shifts.findOverlap({ start_time: '05:00', end_time: '07:00' }, [night])).toBe(night);
      expect(shifts.findOverlap({ start_time: '23:00', end_time: '01:00' }, [night])).toBe(night);
      expect(shifts.findOverlap({ start_time: '12:00', end_time: '13:00' }, [night])).toBeNull();
    });
  });

  test('ground crew can read the active shifts but not change them', async () => {
    const list = await request(app).get('/api/shifts').set(auth(crew.token));
    expect(list.statusCode).toBe(200);
    expect(list.body.map((s) => s.name)).toEqual(['Day', 'Night']);
    expect((await add(crew.token, { name: 'Sneaky', start_time: '01:00', end_time: '02:00' })).statusCode).toBe(403);
    expect((await edit(crew.token, seeded.Day, { name: 'Mine' })).statusCode).toBe(403);
    expect((await request(app).get('/api/shifts')).statusCode).toBe(401);
  });

  test('validation: a name, valid HH:MM times that differ, a unique name and no overlaps', async () => {
    const bad = async (body, field, status = 400) => {
      const res = await add(sup.token, body);
      expect(res.statusCode).toBe(status);
      expect(res.body.field).toBe(field);
      return res.body.error;
    };
    await bad({ name: '  ', start_time: '01:00', end_time: '02:00' }, 'name');
    await bad({ name: 'Odd', start_time: '25:00', end_time: '02:00' }, 'start_time');
    await bad({ name: 'Odd', start_time: '1:00', end_time: '02:00' }, 'start_time');
    await bad({ name: 'Odd', start_time: '01:00', end_time: '01:00' }, 'end_time');
    expect(await bad({ name: 'day', start_time: '01:00', end_time: '02:00' }, 'name', 409)).toMatch(/already an active shift called Day/);
    expect(await bad({ name: 'Dawn', start_time: '05:00', end_time: '07:00' }, 'start_time', 409)).toMatch(/overlap (Night|Day)/);
    expect((await edit(sup.token, seeded.Day, { end_time: '19:00' })).statusCode).toBe(409); // would overlap Night
  });

  test('supervisors add, edit and deactivate shifts; reactivating is checked again', async () => {
    // Make room in the evening: Night becomes inactive, then two shorter shifts replace it.
    const off = await edit(sup.token, seeded.Night, { is_active: false });
    expect(off.body).toMatchObject({ is_active: false, name: 'Night' });
    const evening = await add(sup.token, { name: `Evening ${stamp}`, start_time: '18:00', end_time: '23:00' });
    expect(evening.statusCode).toBe(201);
    const late = await add(sup.token, { name: `Late ${stamp}`, start_time: '23:00', end_time: '06:00' });
    expect(late.statusCode).toBe(201);
    expect(late.body).toMatchObject({ start_time: '23:00', end_time: '06:00', is_active: true, handovers: 0 });

    // Everyone's app gets the new windows; the old Night is still listed for supervisors.
    const config = (await request(app).get('/api/config/shifts')).body;
    expect(config.shifts.map((s) => s.name)).toEqual(['Day', `Evening ${stamp}`, `Late ${stamp}`]);
    const all = (await request(app).get('/api/shifts?all=true').set(auth(sup.token))).body;
    expect(all.find((s) => s.shift_id === seeded.Night)).toMatchObject({ is_active: false });

    // Night can't come back while it overlaps the new ones.
    expect((await edit(sup.token, seeded.Night, { is_active: true })).body.error).toMatch(/overlap Evening/);
    await edit(sup.token, evening.body.shift_id, { is_active: false });
    await edit(sup.token, late.body.shift_id, { is_active: false });
    expect((await edit(sup.token, seeded.Night, { is_active: true })).statusCode).toBe(200);
  });

  test('only a shift no handover has used can be deleted, with its plans; its crew become not rostered', async () => {
    const del = (token, id) => request(app).delete(`/api/shifts/${id}`).set(auth(token));
    // Make room for a short shift: Night off, then "Spare" in the evening.
    await edit(sup.token, seeded.Night, { is_active: false });
    const spare = (await add(sup.token, { name: `Spare ${stamp}`, start_time: '19:00', end_time: '21:00' })).body;
    await pool.query(`UPDATE users SET shift_id = $2 WHERE user_id = $1`, [crew.id, spare.shift_id]);
    await pool.query(`INSERT INTO shift_plans (shift_date, shift_id) VALUES ('2030-01-15', $1)`, [spare.shift_id]);
    const listed = (await request(app).get('/api/shifts?all=true').set(auth(sup.token))).body.find((s) => s.shift_id === spare.shift_id);
    expect(listed).toMatchObject({ handovers: 0, plans: 1, rostered: 1 });

    expect((await del(crew.token, spare.shift_id)).statusCode).toBe(403);
    const res = await del(sup.token, spare.shift_id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true, plans_removed: 1, unrostered: 1 });
    expect((await pool.query(`SELECT 1 FROM shifts WHERE shift_id = $1`, [spare.shift_id])).rowCount).toBe(0);
    expect((await pool.query(`SELECT shift_id FROM users WHERE user_id = $1`, [crew.id])).rows[0].shift_id).toBeNull();
    expect((await request(app).get('/api/config/shifts')).body.shifts.map((s) => s.name)).toEqual(['Day']);
    expect((await del(sup.token, spare.shift_id)).statusCode).toBe(404);

    // A shift with handovers is refused, active or not.
    await pool.query(
      `INSERT INTO handover_submissions (user_id, input_type, content, processing_status, shift_id, shift_name)
       VALUES ($1, 'text', 'Shifts delete test', 'completed', $2, 'Night')`,
      [crew.id, seeded.Night]
    );
    const refused = await del(sup.token, seeded.Night);
    expect(refused.statusCode).toBe(409);
    expect(refused.body.error).toMatch(/Deactivate it instead/);
    expect((await edit(sup.token, seeded.Night, { is_active: true })).statusCode).toBe(200);
  });

  test('old reports keep the shift name they were written under after the shift is renamed', async () => {
    const submit = (shift) =>
      request(app).post('/api/handovers').set(auth(crew.token)).send({ narrative_text: `Brake wear on 5Y-KQF at stand 2. Shifts ${stamp} ${shift}`, shift });
    const before = await submit('Day');
    expect(before.statusCode).toBe(201);
    const reportId = before.body.report.report_id;
    expect((await request(app).get(`/api/handovers/${reportId}`).set(auth(crew.token))).body).toMatchObject({ shift_id: seeded.Day, shift_name: 'Day' });

    expect((await edit(sup.token, seeded.Day, { name: 'Morning' })).body.name).toBe('Morning');
    const old = (await request(app).get(`/api/handovers/${reportId}`).set(auth(crew.token))).body;
    expect(old).toMatchObject({ shift_id: seeded.Day, shift_name: 'Day' });
    expect(old.submission.shift_name).toBe('Day');
    expect((await submit('Day')).statusCode).toBe(400); // no shift is called Day any more
    const after = await submit('Morning');
    expect((await request(app).get(`/api/handovers/${after.body.report.report_id}`).set(auth(crew.token))).body.shift_name).toBe('Morning');

    // The list can still be filtered by the shift, under either name.
    const listed = await request(app).get('/api/handovers').query({ shift: seeded.Day, submitted_by: 'me' }).set(auth(crew.token));
    expect(listed.body.reports.map((r) => r.shift_name).sort()).toEqual(['Day', 'Morning']);
    expect(listed.body.reports[0].shift_window === null || typeof listed.body.reports[0].shift_window.name === 'string').toBe(true);
    await edit(sup.token, seeded.Day, { name: 'Day' });
  }, 20000);

  test('with no active shift, handovers, stats and plans still work and say "no shift"', async () => {
    await pool.query(`UPDATE shifts SET is_active = false`);
    await shifts.loadShifts();
    try {
      const res = await request(app).post('/api/handovers').set(auth(crew.token)).send({ narrative_text: `Tow bar pin missing at stand 9. Shifts ${stamp} none` });
      expect(res.statusCode).toBe(201);
      expect(res.body.submission).toMatchObject({ shift_id: null, shift_name: null });
      expect(res.body.assignment).toEqual({ rule: null, shift: null });
      expect(res.body.task.assigned_to).toBeNull();

      const stats = await request(app).get('/api/stats/overview').set(auth(sup.token));
      expect(stats.statusCode).toBe(200);
      expect(stats.body).toMatchObject({ current_shift: null, recent_shifts: [] });
      expect((await request(app).get('/api/users/workload').set(auth(sup.token))).statusCode).toBe(200);
      expect((await request(app).get('/api/shift-plans').set(auth(sup.token))).body.shifts).toEqual([]);
      expect((await request(app).get('/api/handovers').query({ shift: 'none', submitted_by: 'me' }).set(auth(crew.token))).body.total).toBeGreaterThanOrEqual(1);
      expect((await request(app).get('/api/config/shifts')).body).toMatchObject({ shifts: [], windows: [] });
    } finally {
      await pool.query(`UPDATE shifts SET is_active = (shift_id = ANY($1::uuid[]))`, [[seeded.Day, seeded.Night]]);
      await shifts.loadShifts();
    }
  }, 20000);
});
