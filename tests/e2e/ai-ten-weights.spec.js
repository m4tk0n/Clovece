import { test, expect } from '@playwright/test';

test('živý web načte produkční strategii s deseti vahami a vrátí legální rozhodnutí', async ({ page }) => {
    const pageErrors = [];
    const loadedScripts = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => { if (/\\.js(?:\\?|$)/.test(request.url())) loadedScripts.push(request.url()); });
    await page.goto('?debug=1');
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');

    const result = await page.evaluate(async () => {
        const config = await import('./js/ai-weight-config.js');
        const engine = await import('./js/game-engine.js');
        const strategy = await import('./js/ai-strategy.js');
        const game = engine.createGame(1, 1, [], [], 40);
        game.phase = 'move';
        game.diceValue = 1;
        game.pieces[0].pieces[0].steps = 0;
        game.pieces[0].pieces[1].steps = 5;
        const dependencies = {
            getValidMoves: engine.getValidMoves,
            movePiece: engine.movePiece,
            rollDice: engine.rollDice
        };
        const legalMoves = engine.getValidMoves(game);
        const decision = strategy.chooseStrategicDecision(game, dependencies);
        return {
            count: config.AI_WEIGHT_COUNT,
            keys: config.AI_WEIGHT_KEYS,
            values: config.getAIWeightValues(),
            legalMoves,
            decisionPiece: decision?.pieceId,
            selection: decision?.breakdown?.selection,
            simulatedDice: decision?.breakdown?.diceSimulation?.map(item => item.dice) || [],
            contributionCount: Object.keys(decision?.breakdown?.selectedWeightFactors?.weightContributions || {}).length
        };
    });

    expect(result.count).toBe(10);
    expect(result.keys).toHaveLength(10);
    expect(result.values).toHaveLength(10);
    expect(result.legalMoves).toContain(result.decisionPiece);
    expect(result.selection).toBe('weighted-ai-10-v1');
    expect(result.simulatedDice).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.contributionCount).toBe(10);
    expect(pageErrors).toEqual([]);
    expect(loadedScripts.some(url => /ai-original-|ai-neural-network|models\\/ludo-ai/.test(url))).toBe(false);
});
