// Ground crew writing handovers: typed and spoken, and what the next crew then sees.
const { test, expect, statePath, tag, env } = require('../support/fixtures');
const db = require('../support/db');
const { VOICE_TRANSCRIPT } = require('../support/fake-inference');

test.use({ storageState: statePath('crew') });

test('a typed day-shift handover is analysed and its task goes to the incoming night crew', async ({ page }) => {
  const note = tag('Typed');
  await page.goto('/');
  await page.getByLabel('What does the next crew need to know?').fill(
    `Hydraulic pump leak on 5Y-KZD at stand 7. Engineer to fit seal before 0600. ${note}`,
  );
  await page.getByLabel('Shift', { exact: true }).selectOption('Day');
  await page.getByRole('button', { name: 'Submit handover' }).click();

  const result = page.getByRole('region', { name: /Handover submitted/ });
  await expect(result).toBeVisible();
  await expect(result).toContainText('5Y-KZD');
  await expect(result).toContainText('Hydraulic pump leak on 5Y-KZD at stand 7.');
  await expect(page.getByLabel('What does the next crew need to know?')).toHaveValue(''); // draft cleared
  // Amina is the only one rostered on nights.
  await expect(result).toContainText(`assigned to ${env.USERS.crew2.full_name} on the incoming night shift`);

  // The task shows up for everyone straight away; the writer can see it but not resolve it.
  await page.getByRole('link', { name: /My tasks/ }).click();
  const strip = page.locator('#others .strip').filter({ hasText: 'Hydraulic pump leak on 5Y-KZD at stand 7.' });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0);

  const [row] = await db.query(
    `SELECT s.input_type, t.assigned_to, u.email AS assignee_email FROM handover_submissions s
     JOIN handover_reports r ON r.submission_id = s.submission_id
     JOIN task_register t ON t.report_id = r.report_id
     JOIN users u ON u.user_id = t.assigned_to
     WHERE s.content LIKE $1`,
    [`%${note}%`],
  );
  expect(row.input_type).toBe('text');
  expect(row.assignee_email).toBe(env.USERS.crew2.email);
});

test('a draft survives a reload', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('What does the next crew need to know?');
  await box.fill('Draft that must not be lost');
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.reload();
  await expect(box).toHaveValue('Draft that must not be lost');
  await box.fill('');
});

test('a spoken handover is turned into text to check, then saved as voice input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Speak the handover' }).click();
  await expect(page.getByText('Speak now')).toBeVisible();
  await page.waitForTimeout(2500); // record a little of the fake microphone's tone
  await page.getByRole('button', { name: /Stop recording/ }).click();

  const box = page.getByLabel('What does the next crew need to know?');
  await expect(box).toHaveValue(VOICE_TRANSCRIPT);
  await expect(page.getByText(/Check it, especially the aircraft registration/)).toBeVisible();

  await page.getByRole('button', { name: 'Submit handover' }).click();
  await expect(page.getByRole('region', { name: /Handover submitted/ })).toBeVisible();
  const [row] = await db.query(
    `SELECT input_type FROM handover_submissions WHERE content = $1 ORDER BY submitted_at DESC LIMIT 1`,
    [VOICE_TRANSCRIPT],
  );
  expect(row.input_type).toBe('voice');
});

test('"Record again" replaces only the last recording and keeps typed text', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('What does the next crew need to know?');
  await box.fill('Typed by hand first.');

  async function record(button) {
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByText('Speak now')).toBeVisible();
    await page.waitForTimeout(2500); // record a little of the fake microphone's tone
    await page.getByRole('button', { name: /Stop recording/ }).click();
  }

  await record('Speak the handover');
  await expect(box).toHaveValue(`Typed by hand first.\n${VOICE_TRANSCRIPT}`);
  await record('Record again');
  await expect(page.getByText(/Replaced your last recording/)).toBeVisible();
  // The typed text is still there and the transcript appears once, not twice.
  await expect(box).toHaveValue(`Typed by hand first.\n${VOICE_TRANSCRIPT}`);

  // Once the recorded words are edited, there is nothing to swap, so the button goes away.
  await box.fill('Typed by hand first. Edited.');
  await expect(page.getByRole('button', { name: 'Record again' })).toHaveCount(0);
  await box.fill('');
});
