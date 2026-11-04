// Shift plans: a supervisor says who takes over from whom, and a handover's task follows the plan.
const { test, expect, statePath, api, tag, env } = require('../support/fixtures');
const db = require('../support/db');

// Later specs rely on the seeded Day and Night shifts and the roster alone. Shifts are put back
// through the API so the server's cached shifts change too: added ones off first, then Day and Night on.
test.afterEach(async ({ request }) => {
  await db.query(`DELETE FROM shift_plans`);
  const rows = await db.query(`SELECT shift_id, name, is_active FROM shifts`);
  const seeded = (s) => s.name === 'Day' || s.name === 'Night';
  for (const s of rows.filter((r) => r.is_active && !seeded(r))) await api(request, 'supervisor', 'PATCH', `/shifts/${s.shift_id}`, { is_active: false });
  for (const s of rows.filter((r) => !r.is_active && seeded(r))) await api(request, 'supervisor', 'PATCH', `/shifts/${s.shift_id}`, { is_active: true });
});

const shiftId = async (name) => (await db.query(`SELECT shift_id FROM shifts WHERE name = $1 AND is_active`, [name]))[0].shift_id;

test('a supervisor plans who takes over from whom, and the handover task follows the plan', async ({ browser, request }) => {
  const { crew, crew2 } = env.USERS;
  const sup = await (await browser.newContext({ storageState: statePath('supervisor') })).newPage();
  await sup.goto('/shifts');

  // A night handover goes to the next (or current) day shift: the first day-shift card.
  const card = sup.locator('.shift-plans > section').filter({ hasText: /Day shift,/ }).first();
  await expect(card).toContainText('Not planned');
  await card.getByRole('button', { name: 'Plan shift' }).click();
  // The roster is the starting point: Juma works days.
  await expect(card.getByRole('checkbox', { name: new RegExp(crew.full_name) })).toBeChecked();
  await card.getByRole('checkbox', { name: new RegExp(crew.full_name) }).uncheck();
  await card.getByRole('checkbox', { name: new RegExp(crew2.full_name) }).check();
  await card.getByLabel(`Who ${crew2.full_name} takes over from`).selectOption({ label: crew.full_name });
  await card.getByRole('button', { name: 'Save plan' }).click();
  await expect(card).toContainText('Planned, 1');
  await expect(card).toContainText(`takes over from ${crew.full_name}`);

  // Juma sees who takes over from them.
  const home = await (await browser.newContext({ storageState: statePath('crew') })).newPage();
  await home.goto('/');
  await expect(home.locator('#brief-partners')).toContainText(`${crew2.full_name} takes over from you`);

  // Juma hands over the night shift. By the roster nobody else works days, but the plan names Amina.
  const note = tag('Plan');
  const res = await api(request, 'crew', 'POST', '/handovers', { narrative_text: `Cabin door seal torn on 5Y-KQD at stand 4. ${note}`, shift: 'Night' });
  expect(res.status).toBe(201);
  const [row] = await db.query(
    `SELECT u.email, t.assigned_by_rule FROM task_register t JOIN users u ON u.user_id = t.assigned_to WHERE t.task_id = $1`,
    [res.body.task.task_id],
  );
  expect(row).toEqual({ email: crew2.email, assigned_by_rule: 'takes_over' });

  // Clearing the plan hands the shift back to the roster.
  await card.getByRole('button', { name: 'Edit plan' }).click();
  await card.getByRole('button', { name: 'Clear plan, use the roster' }).click();
  await expect(card).toContainText('Not planned');
  await sup.context().close();
  await home.context().close();
});

test('a supervisor plans a shift a week ahead', async ({ browser }) => {
  const { crew, crew2 } = env.USERS;
  const date = new Date(Date.now() + 7 * 24 * 3600 * 1000).toLocaleDateString('en-CA'); // YYYY-MM-DD
  const night = await shiftId('Night');
  const sup = await (await browser.newContext({ storageState: statePath('supervisor') })).newPage();
  await sup.goto('/shifts');
  await expect(sup.locator(`#shift-${date}-${night}`)).toHaveCount(0); // only the next few shifts are listed

  await sup.getByRole('button', { name: 'Plan a later shift' }).click();
  const form = sup.locator('#create-shift');
  await form.getByLabel('Date').fill(date);
  await form.getByLabel('Shift').selectOption({ label: 'Night (18:00 to 06:00)' });
  await form.getByRole('button', { name: 'Next: choose the crew' }).click();

  const card = sup.locator(`#shift-${date}-${night}`);
  await expect(card.getByRole('heading')).toContainText('New: Night shift');
  await card.getByRole('checkbox', { name: new RegExp(crew2.full_name) }).check();
  await card.getByLabel(`Who ${crew2.full_name} takes over from`).selectOption({ label: crew.full_name });
  await card.getByRole('button', { name: 'Save plan' }).click();

  // The new shift now sits in the list with its plan, after the coming shifts.
  await expect(card).toContainText('Planned, 1');
  await expect(card.getByRole('heading')).not.toContainText('New:');
  await expect(card).toContainText(`takes over from ${crew.full_name}`);
  const [row] = await db.query(`SELECT count(*)::int AS n FROM shift_plans WHERE shift_date = $1 AND shift_id = $2`, [date, night]);
  expect(row.n).toBe(1);
  await sup.context().close();
});

test('a supervisor sets up shift times: overlaps are refused inline, and shifts are deactivated, not deleted', async ({ browser }) => {
  const sup = await (await browser.newContext({ storageState: statePath('supervisor') })).newPage();
  await sup.goto('/shifts');
  const settings = sup.locator('#shift-settings');
  const row = (name) => settings.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) });
  await expect(settings.getByRole('listitem')).toHaveCount(2);

  // An early shift overlapping Night and Day is refused, beside the time.
  await settings.getByRole('button', { name: 'Add shift' }).click();
  const form = settings.getByRole('form', { name: 'Add a shift' });
  await form.getByLabel('Name').fill('Dawn');
  await form.getByLabel('Starts').fill('05:00');
  await form.getByLabel('Ends').fill('07:00');
  await form.getByRole('button', { name: 'Add shift' }).click();
  await expect(form).toContainText(/overlap (Night|Day)/);
  await form.getByRole('button', { name: 'Cancel' }).click();

  // Make room: deactivate Night, then add Evening and Late (past midnight) in its place.
  await settings.getByRole('button', { name: 'Deactivate Night' }).click();
  await expect(row('Night')).toContainText('Inactive');
  for (const [name, start, end] of [['Evening', '18:00', '22:00'], ['Late', '22:00', '06:00']]) {
    await settings.getByRole('button', { name: 'Add shift' }).click();
    const add = settings.getByRole('form', { name: 'Add a shift' });
    await add.getByLabel('Name').fill(name);
    await add.getByLabel('Starts').fill(start);
    await add.getByLabel('Ends').fill(end);
    await add.getByRole('button', { name: 'Add shift' }).click();
    await expect(add).toHaveCount(0);
  }
  await expect(row('Late')).toContainText('past midnight');

  // Night can't come back while it overlaps the new shifts.
  await settings.getByRole('button', { name: 'Reactivate Night' }).click();
  await expect(row('Night')).toContainText(/overlap Evening/);

  // The handover form now offers the new shifts.
  const crew = await (await browser.newContext({ storageState: statePath('crew') })).newPage();
  await crew.goto('/');
  await expect(crew.getByLabel('Shift', { exact: true }).locator('option')).toHaveText(['Day', 'Evening', 'Late']);

  // Unused shifts can be deleted (after confirming); Night has handovers, so it can only be deactivated.
  await expect(row('Night').getByRole('button', { name: 'Delete Night' })).toHaveCount(0);
  for (const name of ['Evening', 'Late']) {
    await settings.getByRole('button', { name: `Delete ${name}` }).click();
    await expect(row(name)).toContainText(`Delete ${name} for good?`);
    await row(name).getByRole('button', { name: `Delete ${name}` }).click();
    await expect(row(name)).toHaveCount(0);
  }
  await settings.getByRole('button', { name: 'Reactivate Night' }).click();
  await expect(row('Night')).not.toContainText('Inactive');
  expect(await db.query(`SELECT name FROM shifts WHERE name IN ('Evening', 'Late')`)).toEqual([]);
  await sup.context().close();
  await crew.context().close();
});
