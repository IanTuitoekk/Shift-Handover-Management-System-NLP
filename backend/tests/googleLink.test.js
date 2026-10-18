const request = require('supertest');
const { mockGoogle } = require('./googleHelpers');
const app = require('../app');
const pool = require('../config/db');

describe('Linking Google to an existing account', () => {
  const stamp = Date.now();
  const google = mockGoogle();
  const email = `g-link${stamp}@kenya-airways.com`;
  let userId;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({ full_name: 'Link Me', email, password: 'testpass123' });
    userId = res.body.user_id;
  });

  test('an existing email must confirm its password before Google is linked', async () => {
    // Google gives the address in lower case; it still matches the account.
    const credential = google({ sub: `g-link-${stamp}`, email: email.toUpperCase(), name: 'Link Me (Google)' });
    const first = await request(app).post('/api/auth/google').send({ credential });
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({ link_required: true, email });
    expect(first.body).not.toHaveProperty('token');
    const ticket = first.body.link_ticket;

    // The ticket is not a session.
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ticket}`)).statusCode).toBe(401);

    const wrong = await request(app).post('/api/auth/google/link').send({ link_ticket: ticket, password: 'wrongpass1' });
    expect(wrong.statusCode).toBe(401);
    expect((await pool.query(`SELECT google_sub FROM users WHERE user_id = $1`, [userId])).rows[0].google_sub).toBeNull();

    const ok = await request(app).post('/api/auth/google/link').send({ link_ticket: ticket, password: 'testpass123' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.user).toMatchObject({ user_id: userId, google_linked: true, has_password: true, full_name: 'Link Me' });

    // From now on Google signs in directly, and the password still works.
    const direct = await request(app).post('/api/auth/google').send({ credential });
    expect(direct.statusCode).toBe(200);
    expect(direct.body.user.user_id).toBe(userId);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'testpass123' })).statusCode).toBe(200);
  });

  test('a different Google account cannot take over a linked email', async () => {
    const other = google({ sub: `g-other-${stamp}`, email, name: 'Someone else' });
    const res = await request(app).post('/api/auth/google').send({ credential: other });
    expect(res.statusCode).toBe(409);
  });

  test('a forged or expired ticket is refused', async () => {
    const res = await request(app).post('/api/auth/google/link').send({ link_ticket: 'eyJhbGciOiJIUzI1NiJ9.e30.bad', password: 'testpass123' });
    expect(res.statusCode).toBe(401);
  });

  test('deleting (anonymising) an account removes its Google link', async () => {
    await pool.query(`UPDATE users SET is_active = false WHERE user_id = $1`, [userId]);
    await pool.query(`INSERT INTO handover_submissions (user_id, input_type, content) VALUES ($1, 'text', 'x')`, [userId]);
    const userModel = require('../models/userModel');
    const result = await userModel.deleteOrAnonymiseUser(userId, 'x');
    expect(result.outcome).toBe('anonymised');
    expect((await pool.query(`SELECT google_sub FROM users WHERE user_id = $1`, [userId])).rows[0].google_sub).toBeNull();
  });
});
