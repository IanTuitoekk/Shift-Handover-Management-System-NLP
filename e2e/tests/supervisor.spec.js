// Supervisor work: live updates, automatic and manual assigning, mark done and sign-off, report filters.
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

test('a night handover goes to the incoming day crew live; the assignee marks it done and a supervisor signs it off', async ({ browser, request }) => {
  const sup = await (await browser.newContext({ storageState: statePath('supervisor') })).newPage();
  const crew = await (await browser.newContext({ storageState: statePath('crew') })).newPage();
  await sup.goto('/triage');
  await crew.goto('/my-tasks');
  await expect(sup.getByRole('heading', { name: /Unassigned/ })).toBeVisible();
  // Both pages must be connected for live updates before anything happens.
  await expect(sup.getByText('Live updates on')).toBeAttached();
  await expect(crew.getByText('Live updates on')).toBeAttached();

  // Amina (nights) hands over; the supervisor is told without reloading, and the task is already
  // Juma's, the only one rostered on the incoming day shift, and Juma is told live too.
  const note = tag('Live');
  await api(request, 'crew2', 'POST', '/handovers', { narrative_text: `Main gear tyre worn on 5Y-KQB at stand 3. ${note}`, shift: 'Night' });
  await expect(sup.locator('.toast').filter({ hasText: 'New handover' })).toBeVisible();
  await expect(crew.locator('.toast').filter({ hasText: 'A task was assigned to you' })).toBeVisible();
  const task = await taskFor(note);
  expect(task.assigned_to).toBe(await userId(env.USERS.crew.email));
  await expect(sup.locator('#bay-assigned .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' })).toBeVisible();
  const mine = crew.locator('#mine .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' });
  await expect(mine).toBeVisible();

  // Ground crew can't resolve, not even the assignee: no button, and the API refuses.
  await expect(mine.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0);
  for (const who of ['crew', 'crew2']) {
    expect((await api(request, who, 'PATCH', `/tasks/${task.task_id}/resolve`)).status).toBe(403);
  }

  // Amina can't mark Juma's task done either.
  expect((await api(request, 'crew2', 'PATCH', `/tasks/${task.task_id}/done`)).status).toBe(403);

  // Juma marks it done: it waits for sign-off, and the supervisor is told live.
  await mine.getByRole('button', { name: 'Mark done' }).click();
  await expect(mine).toContainText('Done, awaiting sign-off');
  await expect(mine.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  await expect(sup.locator('.toast').filter({ hasText: `${env.USERS.crew.full_name} marked a task done` })).toBeVisible();
  const signoff = sup.locator('#bay-signoff .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' });
  await expect(signoff).toBeVisible();
  await expect(sup.locator('#bay-assigned .strip').filter({ hasText: 'Main gear tyre worn on 5Y-KQB' })).toHaveCount(0);

  // Not finished: the supervisor sends it back, and it's Juma's to do again.
  await signoff.getByRole('button', { name: 'Send back' }).click();
  await expect(signoff).toHaveCount(0);
  await expect(crew.locator('.toast').filter({ hasText: 'A supervisor sent a task back to you' })).toBeVisible();
  await expect(mine.getByRole('button', { name: 'Mark done' })).toBeVisible();

  // Done again; this time the supervisor signs it off (two steps, so it can't happen by accident).
  await mine.getByRole('button', { name: 'Mark done' }).click();
  await signoff.getByRole('button', { name: 'Sign off' }).click();
  await signoff.getByRole('button', { name: 'Confirm resolved' }).click();
  await expect(signoff).toHaveCount(0);
  await expect(crew.locator('.toast').filter({ hasText: 'A supervisor resolved one of your tasks' })).toBeVisible();
  await expect(mine).toHaveCount(0);
  await expect.poll(async () => (await taskFor(note)).status).toBe('resolved');
  await sup.context().close();
  await crew.context().close();
});

test.describe('as supervisor', () => {
  test.use({ storageState: statePath('supervisor') });

  test('with nobody else on the incoming shift the task waits unassigned; a supervisor assigns and unassigns it', async ({ page, request }) => {
    // Juma (days) hands over a day shift: Amina is the only one on nights.
    const note = tag('Unassign');
    await api(request, 'crew', 'POST', '/handovers', { narrative_text: `Brake pads low on 5Y-KQC at stand 9. ${note}`, shift: 'Day' });
    expect((await taskFor(note)).assigned_to).toBe(await userId(env.USERS.crew2.email));
    // Juma hands over a night shift: the day crew is only Juma, so nobody gets it.
    const lone = tag('Lone');
    await api(request, 'crew', 'POST', '/handovers', { narrative_text: `Cabin light out on 5Y-KQD at stand 2. ${lone}`, shift: 'Night' });
    expect((await taskFor(lone)).assigned_to).toBeNull();

    await page.goto('/triage');
    const waiting = page.locator('#bay-unassigned .strip').filter({ hasText: 'Cabin light out on 5Y-KQD' });
    await waiting.locator('select').selectOption(await userId(env.USERS.crew.email));
    await waiting.getByRole('button', { name: 'Assign' }).click();
    await expect.poll(async () => (await taskFor(lone)).assigned_to).toBe(await userId(env.USERS.crew.email));

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
