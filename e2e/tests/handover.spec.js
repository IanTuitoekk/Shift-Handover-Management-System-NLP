// Ground crew writing handovers: typed and spoken, and what the next crew then sees.
const { test, expect, statePath, tag } = require('../support/fixtures');
const db = require('../support/db');
const { VOICE_TRANSCRIPT } = require('../support/fake-inference');

test.use({ storageState: statePath('crew') });

test('a typed handover is analysed and raises a task for the next crew', async ({ page }) => {
  const note = tag('Typed');
  await page.goto('/');
  await page.getByLabel('What does the next crew need to know?').fill(
    `Hydraulic pump leak on 5Y-KZD at stand 7. Engineer to fit seal before 0600. ${note}`,
  );
  await page.getByRole('button', { name: 'Submit handover' }).click();

  const result = page.getByRole('region', { name: /Handover submitted/ });
  await expect(result).toBeVisible();
  await expect(result).toContainText('5Y-KZD');
  await expect(result).toContainText('Hydraulic pump leak on 5Y-KZD at stand 7.');
  await expect(page.getByLabel('What does the next crew need to know?')).toHaveValue(''); // draft cleared

  // The task shows up for everyone straight away.
  await page.getByRole('link', { name: /My tasks/ }).click();
  await expect(page.locator('#others')).toContainText('Hydraulic pump leak on 5Y-KZD at stand 7.');

  const [row] = await db.query(
    `SELECT s.input_type FROM handover_submissions s WHERE s.content LIKE $1`, [`%${note}%`],
  );
  expect(row.input_type).toBe('text');
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
