const request = require('supertest');
const app = require('../app');

describe('Handover endpoints', () => {
  let token;

  beforeAll(async () => {
    const email = `handovertest${Date.now()}@kenya-airways.com`;
    await request(app).post('/api/auth/register').send({
      full_name: 'Handover Tester',
      email,
      password: 'testpass123',
      role: 'ground_crew',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'testpass123' });

    token = loginRes.body.token;
  });

  test('POST /api/handovers requires authentication', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .send({ narrative_text: 'Test without auth' });
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/handovers creates a full report with real inference', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${token}`)
      .send({ narrative_text: 'Hydraulic pump leak detected on B737.', language_variant: 'English' });

    expect(res.statusCode).toBe(201);
    expect(res.body.report).toBeDefined();
    expect(res.body.entities).toBeInstanceOf(Array);
    expect(res.body.task).toBeDefined();
    expect(res.body.notification).toBeDefined();
  }, 15000);

  test('GET /api/handovers lists reports', async () => {
    const res = await request(app).get('/api/handovers').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });
});