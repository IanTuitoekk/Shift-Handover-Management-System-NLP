// Supervisor work: live updates, assigning and unassigning, crew resolving, report filters.
const { test, expect, statePath, api, tag, env } = require('../support/fixtures');
const db = require('../support/db');

async function userId(email) {
  const [row] = await db.query(`SELECT user_id FROM users WHERE email = $1`, [email]);
  return row.user_id;
}

async function taskFor(note) {
  const [row] = await db.query(
    `SELECT t.task_id, t.assigned_to, t.status FROM task_register t
     JOIN handover_reports r ON r.report_id = t.report_id
     JOIN handover_submissions s ON s.submission_id = r.submission_id
     WHERE s.content LIKE $1`,
    [`%${note}%`],
  );
  return row;
}

test('a new handover reaches the supervisor live; assigning reaches the crew live; crew resolve it', async ({ browser, request }) => {
  const sup = await (await browser.newContext({ storageState: statePath('supervisor') })).newPage();
  const crew = await (await browser.newContext({ storageState: statePath('crew') })).newPage();
  await sup.goto('/triage');
  await crew.goto('/my-tasks');
  await expect(sup.getByRole('heading', { name: /Unassigned/ })).toBeVisible();

  // Someone else on the crew hands over; the supervisor is told without reloading.
  const note = tag('Live');
  await api(request, 'crew2', 'POST', '/handovers', { narrative_text: `Main gear tyre worn on 5Y-KQB at stand 3. ${note}` });
  await expect(sup.locator('.toast').filter({ hasText: 'New handover' })).toBeVisible();
  const strip = sup.locator('#bay-unassigned .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' });
  await expect(strip).toBeVisible();

  // Assign to Juma; Juma sees it arrive.
  await strip.locator('select').selectOption(await userId(env.USERS.crew.email));
  await strip.getByRole('button', { name: 'Assign' }).click();
  await expect(crew.locator('.toast').filter({ hasText: 'A task was assigned to you' })).toBeVisible();
  const mine = crew.locator('#mine .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' });
  await expect(mine).toBeVisible();

  // Juma resolves it (two steps, so it can't happen by accident).
  await mine.getByRole('button', { name: 'Mark resolved' }).click();
  await mine.getByRole('button', { name: 'Confirm resolved' }).click();
  await expect(mine).toHaveCount(0);
  await expect.poll(async () => (await taskFor(note)).status).toBe('resolved');
  await sup.context().close();
  await crew.context().close();
});

test.describe('as supervisor', () => {
  test.use({ storageState: statePath('supervisor') });

  test('a task can be returned to the unassigned list', async ({ page, request }) => {
    const note = tag('Unassign');
    await api(request, 'crew2', 'POST', '/handovers', { narrative_text: `Brake pads low on 5Y-KQC at stand 9. ${note}` });
    const task = await taskFor(note);
    await api(request, 'supervisor', 'PATCH', `/tasks/${task.task_id}/assign`, { assigned_to: await userId(env.USERS.crew.email) });

    await page.goto('/triage');
    const strip = page.locator('#bay-assigned .strip').filter({ hasText: 'Brake pads low on 5Y-KQC' });
    await strip.locator('select').selectOption('nobody');
    await strip.getByRole('button', { name: 'Unassign' }).click();
    await expect(page.locator('#bay-unassigned .strip').filter({ hasText: 'Brake pads low on 5Y-KQC' })).toBeVisible();
    expect((await taskFor(note)).assigned_to).toBeNull();
  });

  test('reports filter on the server by confidence and category, and the overview counts reviews', async ({ page, request }) => {
    const note = tag('Unclear');
    await api(request, 'crew2', 'POST', '/handovers', { narrative_text: `Something unclear near the cargo door. ${note}` });

    await page.goto('/reports?confidence=low');
    await expect(page.locator('main .strip').filter({ hasText: 'Something unclear near the cargo door.' })).toBeVisible();
    await expect(page.locator('main .strip').filter({ hasText: 'Hydraulic pump leak on 5Y-KZD' })).toHaveCount(0);

    await page.goto('/reports?category=Aircraft%20Equipment%20Problem');
    await expect(page.locator('main .strip').filter({ hasText: 'Hydraulic pump leak on 5Y-KZD' }).first()).toBeVisible();
    await expect(page.locator('main .strip').filter({ hasText: 'Something unclear' })).toHaveCount(0);

    await page.goto('/');
    const review = page.locator('.tile, [class*=tile]').filter({ hasText: 'Needs review' }).first();
    await expect(review).not.toContainText(/\b0\b/);
    await expect(page.locator('#review .strip').filter({ hasText: 'Something unclear' })).toBeVisible();
  });
});
