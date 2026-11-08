#!/usr/bin/env node
/**
 * Browser automation for the live Člověče trainer.
 *
 * Requirements:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Run:
 *   BASE_URL="https://7x.wz.cz/clovece/" node tests/trainer-browser.mjs
 *
 * The test endpoint is intentionally combined with debug=trainer:
 *   ?debug=trainer&test=1
 * This exposes the existing window.__cloveceTest API without adding test
 * controls or test-only code to ordinary game sessions.
 */

import process from 'node:process';

const BASE_URL = (process.env.BASE_URL || 'https://7x.wz.cz/clovece/').replace(/\/$/, '') + '/';
const GAME_URL = process.env.GAME_URL || new URL('?debug=trainer&test=1', BASE_URL).toString();

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Chybí Playwright. Spusť: npm install --no-save playwright');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => {
  failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'request failed'
  });
});

try {
  console.log('Otevírám:', GAME_URL);
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    return document.readyState === 'complete' &&
      document.querySelector('#main-menu') &&
      !document.querySelector('#main-menu').classList.contains('hidden');
  }, null, { timeout: 60000 });

  await page.waitForFunction(() => Boolean(window.__cloveceTest?.start), {
    timeout: 30000
  });

  // Uses the same local-game creation path as the built-in test runner.
  // startTestGame marks all participants as AI, so the game can run unattended.
  const initialState = await page.evaluate(async () => {
    const state = await window.__cloveceTest.start();
    window.__cloveceTest.pause();
    return state;
  });

  await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 30000 });
  await page.waitForTimeout(500);

  const visibleSnapshot = await page.evaluate(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 0 && rect.height > 0;
    };
    const game = document.querySelector('#game-screen');
    const board = document.querySelector('#game-container');
    const dice = [
      ...document.querySelectorAll(
        '[id*="dice"], [class*="dice"], [id*="die"], [class*="die"]'
      )
    ].filter(visible);
    const trainingOverlay = document.querySelector(
      '#ai-training-overlay, .ai-training-overlay, [data-ai-training]'
    );
    return {
      title: document.title,
      gameScreenVisible: visible(game),
      boardVisible: visible(board),
      boardTag: board?.tagName || null,
      boardSvgCount: board?.querySelectorAll('svg').length || 0,
      boardCanvasCount: board?.querySelectorAll('canvas').length || 0,
      visibleDiceElements: dice.map(element => ({
        tag: element.tagName,
        id: element.id || null,
        className: typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class')
      })),
      visibleButtons: [...(game?.querySelectorAll('button') || [])]
        .filter(visible)
        .map(button => ({
          id: button.id || null,
          text: (button.innerText || button.getAttribute('aria-label') || '').trim()
        })),
      trainingOverlayVisible: visible(trainingOverlay),
      visibleGameText: (game?.innerText || '').trim().slice(0, 5000)
    };
  });

  const finalState = await page.evaluate(() => window.__cloveceTest.state());

  console.log('\n=== VYTVOŘENÁ HRA ===');
  console.log(JSON.stringify({
    url: page.url(),
    initialState,
    finalState,
    visibleSnapshot,
    consoleErrors,
    pageErrors,
    failedRequests
  }, null, 2));
} catch (error) {
  console.error('Automatizace selhala:', error);
  console.error(JSON.stringify({ consoleErrors, pageErrors, failedRequests }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
