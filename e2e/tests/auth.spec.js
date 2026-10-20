// Signing in and out: password, forgot password, and Sign in with Google (Google stubbed).
const { test, expect, env } = require('../support/fixtures');
const { tokenFor } = require('../support/session');

test.describe('signing in', () => {
  test('a wrong password is refused with a clear message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(env.USERS.crew.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('don’t match');
  });

  test('ground crew log in, land on their home page, and log out', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Work email').fill(env.USERS.crew.email);
    await page.getByLabel('Password', { exact: true }).fill(env.PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'New handover' })).toBeVisible();
    await expect(page.locator('.who__name')).toHaveText(env.USERS.crew.full_name);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('forgot password gives the same answer for any email', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Work email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('a reset link is on its way')).toBeVisible();
  });

  test('Google sign-in for an existing email asks for that account’s password, then signs in', async ({ page }) => {
    // Google can't run in a test, so both Google endpoints are answered here; the backend's own
    // tests cover token verification and linking (backend/tests/google*.test.js).
    let sentPassword = null;
    await page.route('**/api/auth/google', (route) =>
      route.fulfill({ json: { link_required: true, link_ticket: 'e2e-ticket', email: env.USERS.crew2.email } }),
    );
    await page.route('**/api/auth/google/link', async (route) => {
      sentPassword = route.request().postDataJSON().password;
      if (sentPassword !== env.PASSWORD) return route.fulfill({ status: 401, json: { error: 'That password is not correct for this account' } });
      const me = await (await fetch(`${env.API_URL}/auth/me`, { headers: { Authorization: `Bearer ${tokenFor('crew2')}` } })).json();
      return route.fulfill({ json: { user: me, token: tokenFor('crew2') } });
    });

    await page.goto('/login');
    await page.locator('#fake-google-button').click();
    await expect(page.getByText(`An account already uses ${env.USERS.crew2.email}`)).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeHidden(); // only one password box on screen

    const linkPassword = page.locator('#google-link-password');
    await linkPassword.fill('wrong-one');
    await page.getByRole('button', { name: 'Link Google and log in' }).click();
    await expect(page.getByRole('alert')).toContainText('not correct');

    await linkPassword.fill(env.PASSWORD);
    await page.getByRole('button', { name: 'Link Google and log in' }).click();
    await expect(page.locator('.who__name')).toHaveText(env.USERS.crew2.full_name);
  });
});
