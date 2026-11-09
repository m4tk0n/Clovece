// /tests/e2e/debug-workbench.spec.js
import { test, expect } from '@playwright/test';

test('samostatná AI laboratoř načte deset vah a vyhodnotí testovací pozici', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('debug/index.php');
  await expect(page.getByRole('heading', { name: 'AI laboratoř' })).toBeVisible();
  await expect(page.locator('[data-weight]')).toHaveCount(10);
  await expect(page.locator('#status')).toContainText('Test dokončen');
  await expect(page.locator('#dice-results tbody tr')).toHaveCount(6);
  const firstWeight = page.locator('[data-weight="progressToGoal"]');
  const original = await firstWeight.inputValue();
  await firstWeight.fill(String(Number(original) + 1));
  await page.getByRole('button', { name: 'Vyhodnotit tah AI' }).click();
  await expect(page.locator('#status')).toContainText('Test dokončen');
  await page.getByRole('button', { name: 'Výchozí hodnoty' }).click();
  await expect(firstWeight).toHaveValue(original);
  expect(errors).toEqual([]);
});
