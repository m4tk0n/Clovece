import { test, expect } from '@playwright/test';

test('samostatná AI debug laboratoř vyhodnotí všech šest hodů bez chyby', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('debug/index.php');
  await expect(page.locator('#weights .weight')).toHaveCount(10);
  await expect(page.locator('#board-size')).toBeVisible();

  for (const boardSize of ['40', '48', '80']) {
    await page.locator('#board-size').selectOption(boardSize);
    await page.locator('#run-test').click();
    await expect(page.locator('#status')).toContainText('prověřeno všech 6 výsledků');
    await expect(page.locator('#dice-results tbody tr')).toHaveCount(6);
    await expect(page.locator('#decision .die-outcome')).toHaveCount(6);
  }

  await expect(page.locator('#status')).toContainText('80 polí');
  expect(errors, 'Debug laboratoř nesmí vyhazovat neošetřené JS chyby').toEqual([]);
});
