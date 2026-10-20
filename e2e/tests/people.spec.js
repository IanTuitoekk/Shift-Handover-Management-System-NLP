// Supervisor managing people: details, deactivation (with live sign-out), permanent delete.
const { test, expect, statePath, api, env } = require('../support/fixtures');
const db = require('../support/db');

test.use({ storageState: statePath('supervisor') });

const row = (page, name) => page.locator('#people .strip').filter({ hasText: name });

test('edit a ground crew member’s details', async ({ page }) => {
  await page.goto('/team');
  await row(page, env.USERS.crew2.full_name).getByRole('button', { name: /Manage/ }).click();
  const dialog = page.getByRole('dialog', { name: /Manage/ });
  await dialog.getByLabel('Staff number').fill('KQ-E2E-1');
  await dialog.getByLabel('Station').fill('JKIA');
  await dialog.getByRole('button', { name: 'Save details' }).click();
  await expect(row(page, env.USERS.crew2.full_name)).toContainText('Staff KQ-E2E-1 · JKIA');
});

test('deactivating signs the person out at once; reactivating lets them back', async ({ page, browser }) => {
  const crew2 = await (await browser.newContext({ storageState: statePath('crew2') })).newPage();
  await crew2.goto('/');
  await expect(crew2.locator('.who__name')).toHaveText(env.USERS.crew2.full_name);

  await page.goto('/team');
  await row(page, env.USERS.crew2.full_name).getByRole('button', { name: /Manage/ }).click();
  const dialog = page.getByRole('dialog', { name: /Manage/ });
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await dialog.getByLabel(/Reason/).fill('E2E: on leave');
  await dialog.locator('.person-confirm').getByRole('button', { name: 'Deactivate' }).click();
  await expect(dialog.getByRole('button', { name: 'Reactivate' })).toBeVisible();

  await expect(crew2).toHaveURL(/\/login$/);
  await expect(crew2.getByText('Your account has been deactivated by a supervisor.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Reactivate' }).click();
  await dialog.locator('.person-confirm').getByRole('button', { name: 'Reactivate' }).click();
  await expect(dialog.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, env.USERS.crew2.full_name)).not.toContainText('Deactivated');
  await crew2.context().close();
});

test('delete a deactivated ground crew account permanently, confirming with the email', async ({ page, request }) => {
  const email = `e2e-leaver-${Date.now()}@kenya-airways.com`;
  const res = await request.post(`${env.API_URL}/auth/register`, { data: { full_name: 'Leaving Person', email, password: env.PASSWORD } });
  const { user_id } = await res.json();
  await api(request, 'supervisor', 'PATCH', `/users/${user_id}/active`, { active: false });

  await page.goto('/team');
  await row(page, email).getByRole('button', { name: /Manage/ }).click();
  await page.getByRole('button', { name: 'Delete permanently…' }).click();
  const confirm = page.getByRole('dialog', { name: /permanently/ });
  const button = confirm.getByRole('button', { name: 'Delete permanently' });
  await expect(button).toBeDisabled();
  await confirm.getByLabel(/to confirm/).fill(email);
  await button.click();
  await expect(row(page, email)).toHaveCount(0);
  expect(await db.query(`SELECT 1 FROM users WHERE user_id = $1`, [user_id])).toHaveLength(0);
});
