const request = require('supertest');
const { mockGoogle } = require('./googleHelpers');
const app = require('../app');
const pool = require('../config/db');

describe('Sign in with Google', () => {
  const stamp = Date.now();
  const google = mockGoogle();
  const signIn = (credential) => request(app).post('/api/auth/google').send({ credential });

  test('a new Google user gets a ground crew account, then signs straight in', async () => {
    const credential = google({ sub: `g-new-${stamp}`, email: `g-new${stamp}@gmail.com`, name: 'Wanjiru Google' });
    const first = await signIn(credential);
    expect(first.statusCode).toBe(201);
    expect(first.body.created).toBe(true);
    expect(first.body.user).toMatchObject({ full_name: 'Wanjiru Google', role: 'ground_crew', has_password: false, google_linked: true });
    expect(first.body.user).not.toHaveProperty('google_sub');
    expect(first.body.user).not.toHaveProperty('password_hash');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${first.body.token}`);
    expect(me.statusCode).toBe(200);
    expect(me.body.email).toBe(`g-new${stamp}@gmail.com`);

    const again = await signIn(credential);
    expect(again.statusCode).toBe(200);
    expect(again.body.user.user_id).toBe(first.body.user.user_id);
  });

  test('a Google-only account cannot use password login', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: `g-new${stamp}@gmail.com`, password: 'anything123' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/signs in with Google/);
  });

  test('bad tokens and unverified emails are refused, and nothing is created', async () => {
    expect((await signIn('not-a-real-google-token-at-all')).statusCode).toBe(401);
    const unverified = google({ sub: `g-unv-${stamp}`, email: `g-unv${stamp}@gmail.com`, name: 'X', email_verified: false });
    const res = await signIn(unverified);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/not verified/);
    expect((await pool.query(`SELECT 1 FROM users WHERE email = $1`, [`g-unv${stamp}@gmail.com`])).rowCount).toBe(0);
    expect((await request(app).post('/api/auth/google').send({})).statusCode).toBe(400);
  });

  test('a deactivated account cannot sign in with Google', async () => {
    const credential = google({ sub: `g-off-${stamp}`, email: `g-off${stamp}@gmail.com`, name: 'Off' });
    const { body } = await signIn(credential);
    await pool.query(`UPDATE users SET is_active = false WHERE user_id = $1`, [body.user.user_id]);
    const res = await signIn(credential);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/deactivated/);
  });
});
