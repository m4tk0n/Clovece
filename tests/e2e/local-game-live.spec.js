import { test, expect } from '@playwright/test';

test('živá automatická hra: aktuální pravidla, pohyb, pauza a pokračování', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.goto('/?test=1');
  await expect(page.locator('#live-test-panel')).toBeVisible();

  const ruleNames = ['threeRolls', 'mustDeploy', 'skipHomePieces', 'mustEnterHome'];
  for (const name of ruleNames) {
    await expect(page.locator('[data-test-rule="' + name + '"]')).toBeChecked();
  }

  // Přepnutí pravidla v testovacím panelu musí být předáno do stejného setup objektu.
  await page.locator('[data-test-rule="threeRolls"]').uncheck();
  await expect(page.locator('[data-test-rule="threeRolls"]')).not.toBeChecked();

  await page.locator('#test-start').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#game-container')).not.toBeEmpty();
  await expect(page.locator('#test-status')).toHaveText('Probíhá');
  await expect.poll(async () => page.locator('#test-live-log').innerText(), { timeout: 20000 })
    .toContain('hodil');

  const activeRules = await page.evaluate(() => window.__cloveceTest.state().rules);
  expect(activeRules).toEqual({
    threeRolls: false,
    mustDeploy: true,
    skipHomePieces: true,
    mustEnterHome: true
  });

  // Pauza pozastaví automatické tahy, aniž by opustila skutečnou herní obrazovku.
  await page.locator('#test-pause').click();
  await expect(page.locator('#test-status')).toHaveText('Pozastaveno');
  await expect(page.locator('#game-menu')).toBeVisible();
  await page.waitForTimeout(2200);
  const pausedState = await page.evaluate(() => window.__cloveceTest.state());

  await page.locator('#test-resume').click();
  await expect(page.locator('#test-status')).toHaveText('Probíhá');
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect.poll(async () => page.locator('#test-live-log').innerText(), { timeout: 15000 })
    .toContain('pokračuje ze stejného herního stavu');

  await page.screenshot({ path: test.info().outputPath('live-game-board.png'), fullPage: true });
  await page.locator('#test-stop').click();
  await expect(page.locator('#test-status')).toHaveText('Zastaveno');

  expect(pausedState).toBeTruthy();
  expect(runtimeErrors, 'Během automatické hry nesmí vzniknout neošetřená JS chyba.').toEqual([]);
});
