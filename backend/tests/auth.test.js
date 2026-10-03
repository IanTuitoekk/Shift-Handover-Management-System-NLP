const request = require('supertest');
const app = require('../app');

describe('Auth endpoints', () => {
  const testUser = {
    full_name: 'Test User',
    email: `test${Date.now()}@kenya-airways.com`,
    password: 'testpass123',
    role: 'ground_crew',
  };

  test('POST /api/auth/register creates a user', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.email).toBe(testUser.email);
    expect(res.body.password_hash).toBeUndefined();
  });

  test('POST /api/auth/login succeeds with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' });
    expect(res.statusCode).toBe(401);
  });
});