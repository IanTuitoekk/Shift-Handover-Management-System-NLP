const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');

describe('GET /api/users', () => {
  const stamp = Date.now();
  const supervisorEmail = `userstest-sup${stamp}@kenya-airways.com`;
  const crewEmail = `userstest-crew${stamp}@kenya-airways.com`;
  let supervisorToken;
  let crewToken;

  async function registerAndLogin(fullName, email, role) {
    await request(app).post('/api/auth/register').send({
      full_name: fullName,
      email,
      password: 'testpass123',
      role,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'testpass123' });
    return res.body.token;
  }

  beforeAll(async () => {
    supervisorToken = await registerAndLogin('Users Test Supervisor', supervisorEmail, 'supervisor');
    crewToken = await registerAndLogin('Users Test Crew', crewEmail, 'ground_crew');
  });

  // These accounts own no submissions, so they can be deleted safely
  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [[supervisorEmail, crewEmail]]);
  });

  test('returns users for a supervisor without sensitive fields', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((u) => {
      expect(Object.keys(u).sort()).toEqual(['full_name', 'role', 'user_id']);
    });
  });

  test('forbids ground crew', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${crewToken}`);
    expect(res.statusCode).toBe(403);
  });

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(401);
  });

  test('deactivated users cannot log in', async () => {
    await pool.query('UPDATE users SET is_active = false WHERE email = $1', [crewEmail]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: crewEmail, password: 'testpass123' });
    expect(res.statusCode).toBe(401);
  });
});