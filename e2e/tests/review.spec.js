// A supervisor reviews and corrects the model's analysis of a low-confidence report.
const { test, expect, statePath, api, tag } = require('../support/fixtures');
const db = require('../support/db');

test.use({ storageState: statePath('supervisor') });

test('a supervisor corrects category and entities; the report leaves the review queue', async ({ page, request }) => {
  // "unclear" makes the fake model answer "Other/Rare Ground Event" at 41% (low confidence).
  const note = tag('Review');
  const narrative = `Brake wear looks unclear on 5Y-KQD at stand 5, cargo door seal also worn. ${note}`;
  await api(request, 'crew2', 'POST', '/handovers', { narrative_text: narrative });
  const [{ report_id: reportId }] = await db.query(
    `SELECT r.report_id FROM handover_reports r JOIN handover_submissions s ON s.submission_id = r.submission_id WHERE s.content = $1`,
    [narrative],
  );

  await page.goto(`/reports/${reportId}`);
  await expect(page.getByText(/only 41% confident/)).toBeVisible();
  await page.getByRole('button', { name: 'Review analysis' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review analysis' });
  await expect(dialog.getByText(narrative)).toBeVisible();

  await dialog.getByLabel('Category').selectOption('Aircraft Equipment Problem');
  // Add the component the model missed: first with words that aren't in the text (refused), then right.
  await dialog.getByRole('button', { name: 'Add entity' }).click();
  const rows = dialog.locator('.review__row');
  const last = rows.last();
  await last.getByRole('textbox').fill('landing gear');
  await expect(last.getByText('Not in the handover text')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save review' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Every entity needs words that appear');
  await last.getByRole('textbox').fill('cargo door seal');
  await last.getByRole('combobox').selectOption('COMPONENT');
  await dialog.getByRole('button', { name: 'Save review' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('.detail-head').getByText('Reviewed')).toBeVisible();
  await expect(page.locator('.detail-head').getByText('Aircraft equipment problem')).toBeVisible();
  await expect(page.locator('#details')).toContainText('cargo door seal');
  await page.getByText('What the model originally said').click();
  await expect(page.locator('.review-history__model')).toContainText('Other/rare ground event');

  // Out of the review queue; the task now names the corrected category.
  await page.goto('/reports?confidence=low');
  await expect(page.locator('main .strip').filter({ hasText: note })).toHaveCount(0);
  const [task] = await db.query(`SELECT description FROM task_register WHERE report_id = $1`, [reportId]);
  expect(task.description.startsWith('New Aircraft Equipment Problem incident reported:')).toBeTruthy();
  const [review] = await db.query(`SELECT review_count FROM report_reviews WHERE report_id = $1`, [reportId]);
  expect(review.review_count).toBe(1);
});
