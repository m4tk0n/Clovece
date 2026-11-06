import { test, expect } from '@playwright/test';

test('místní hra používá aktuální rozšířená pravidla a skutečné animace', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#main-menu')).toBeVisible();

  // Vstupujeme výhradně do místní hry. Test nevytváří online místnost ani účet.
  await page.getByRole('button', { name: /MÍSTNÍ HRA/i }).click();
  await expect(page.locator('#player-selection')).toBeVisible();

  const rulesToggle = page.locator('#extended-rules-toggle');
  await rulesToggle.click();
  await expect(page.locator('#extended-rules-panel')).toBeVisible();

  const ruleNames = ['threeRolls', 'mustDeploy', 'skipHomePieces', 'mustEnterHome'];
  const activeRules = {};
  for (const name of ruleNames) {
    const toggle = page.locator(`[data-rule-toggle="${name}"]`);
    await expect(toggle).toBeVisible();
    activeRules[name] = await toggle.getAttribute('aria-pressed');
    expect(activeRules[name], `Rozšířené pravidlo ${name} musí být v aktuálním výchozím nastavení zapnuté.`).toBe('true');
  }

  await page.getByRole('button', { name: /ZAČÍT HRU/i }).click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#game-container')).not.toBeEmpty();

  // Zaznamenáme skutečné vizuální herní UI a necháme proběhnout úvodní hod.
  await expect(page.locator('#dice-animation')).toBeAttached();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: test.info().outputPath('game-running.png'), fullPage: true });

  // Pauza a pokračování nesmí opustit herní obrazovku ani založit novou hru.
  await page.locator('#menu-btn').click();
  await expect(page.locator('#game-menu')).toBeVisible();
  await page.locator('#resume-btn').click();
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#game-screen')).toBeVisible();

  expect(runtimeErrors, 'Prohlížeč během místní hry nesmí vyhodit neošetřenou JS chybu.').toEqual([]);
});
