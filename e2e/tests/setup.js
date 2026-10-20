// Runs first (Playwright "setup" project): creates the test accounts through the real API and
// saves a signed-in session for each. The database was rebuilt empty when the backend started.
const { test: setup, expect } = require('@playwright/test');
const env = require('../support/env');
const db = require('../support/db');
const { saveState } = require('../support/session');

setup('create accounts and sign in', async ({ request }) => {
  for (const [role, user] of Object.entries(env.USERS)) {
    const res = await request.post(`${env.API_URL}/auth/register`, { data: { ...user, password: env.PASSWORD } });
    expect(res.status(), `register ${role}`).toBe(201);
  }
  // Sign-up always makes ground crew; promote the supervisor directly (like `npm run set-role`).
  await db.query(`UPDATE users SET role = 'supervisor' WHERE email = $1`, [env.USERS.supervisor.email]);

  for (const role of Object.keys(env.USERS)) {
    const res = await request.post(`${env.API_URL}/auth/login`, { data: { email: env.USERS[role].email, password: env.PASSWORD } });
    expect(res.ok(), `login ${role}`).toBeTruthy();
    saveState(role, (await res.json()).token);
  }
});
