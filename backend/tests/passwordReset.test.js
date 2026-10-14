const request = require('supertest');

// Capture reset emails instead of sending them.
jest.mock('../utils/mailer', () => ({ sendMail: jest.fn(), sendPasswordReset: jest.fn().mockResolvedValue() }));
const mailer = require('../utils/mailer');
const app = require('../app');
const pool = require('../config/db');

describe('Forgot password', () => {
  const stamp = Date.now();
  const address = `pr-crew${stamp}@kenya-airways.com`;
  const supAddress = `pr-sup${stamp}@kenya-airways.com`;
  const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
  const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });
  const reset = (token, newPassword) => request(app).post('/api/auth/reset-password').send({ token, new_password: newPassword });
  const tokenFromLastEmail = () => new URL(mailer.sendPasswordReset.mock.calls.at(-1)[0].link).searchParams.get('token');

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({ full_name: 'PR Crew', email: address, password: 'testpass123' });
    await request(app).post('/api/auth/register').send({ full_name: 'PR Sup', email: supAddress, password: 'testpass123' });
    await pool.query(`UPDATE users SET role = 'supervisor' WHERE email = $1`, [supAddress]);
  });
  beforeEach(() => mailer.sendPasswordReset.mockClear());

  test('an unknown email gets the same answer and no email', async () => {
    const known = await forgot(address);
    const unknown = await forgot(`nobody${stamp}@kenya-airways.com`);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  test('the link sets a new password once, ends old sessions, and works for supervisors too', async () => {
    const session = (await login(address, 'testpass123')).body.token;
    await new Promise((r) => setTimeout(r, 1100)); // token iat is in seconds

    await forgot(address);
    const token = tokenFromLastEmail();
    expect(mailer.sendPasswordReset.mock.calls.at(-1)[0].to).toBe(address);

    expect((await reset(token, 'short')).statusCode).toBe(400);
    expect((await reset('not-a-real-token', 'newpass1234')).statusCode).toBe(400);
    expect((await reset(token, 'newpass1234')).statusCode).toBe(200);
    expect((await reset(token, 'another1234')).statusCode).toBe(400); // used

    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${session}` })).statusCode).toBe(401);
    expect((await login(address, 'testpass123')).statusCode).toBe(401);
    expect((await login(address, 'newpass1234')).statusCode).toBe(200);

    await forgot(supAddress);
    expect((await reset(tokenFromLastEmail(), 'suppass1234')).statusCode).toBe(200);
    expect((await login(supAddress, 'suppass1234')).statusCode).toBe(200);
  });

  test('expired links and deactivated accounts are refused', async () => {
    await forgot(address);
    const token = tokenFromLastEmail();
    await pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
    expect((await reset(token, 'expired1234')).statusCode).toBe(400);

    await pool.query(`UPDATE users SET is_active = false WHERE email = $1`, [address]);
    mailer.sendPasswordReset.mockClear();
    expect((await forgot(address)).statusCode).toBe(200);
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });
});
