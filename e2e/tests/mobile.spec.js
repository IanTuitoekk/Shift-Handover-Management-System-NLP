// Phone-sized screens: nothing wider than the screen, and the main actions reachable.
const { test, expect, statePath } = require('../support/fixtures');

for (const role of ['crew', 'supervisor']) {
  test(`${role} pages fit a phone screen`, async ({ browser }) => {
    const context = await browser.newContext({ ...test.info().project.use, storageState: statePath(role) });
    const page = await context.newPage();
    const pages = role === 'crew' ? ['/', '/my-tasks', '/reports', '/alerts', '/account'] : ['/', '/triage', '/reports', '/team'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    if (role === 'crew') {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Speak the handover' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Your account' })).toBeVisible();
    }
    await context.close();
  });
}
