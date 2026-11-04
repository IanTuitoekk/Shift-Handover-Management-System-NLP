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
  // Roster the crew (like Team → Manage): Juma on days, Amina on nights.
  const roster = (email, shift) =>
    db.query(`UPDATE users SET shift_id = (SELECT shift_id FROM shifts WHERE name = $2 AND is_active) WHERE email = $1`, [email, shift]);
  await roster(env.USERS.crew.email, 'Day');
  await roster(env.USERS.crew2.email, 'Night');

  for (const role of Object.keys(env.USERS)) {
    const res = await request.post(`${env.API_URL}/auth/login`, { data: { email: env.USERS[role].email, password: env.PASSWORD } });
    expect(res.ok(), `login ${role}`).toBeTruthy();
    saveState(role, (await res.json()).token);
  }
});
