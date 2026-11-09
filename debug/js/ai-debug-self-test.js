import { createGame, getValidMoves, chooseAIMoveDecision } from './game-engine.js';
import { AI_WEIGHT_COUNT } from './ai-weight-config.js';

/**
 * Rychlý izolovaný smoke-test debug AI. Běží pouze v /debug/ a používá
 * kopii herního enginu i kopii strategického modelu.
 */
export function runAIDebugSelfTests() {
    const checks = [];
    const check = (name, condition, detail = '') => {
        checks.push({ name, ok: Boolean(condition), detail });
    };

    try {
        const game = createGame(
            1, 1,
            ['Test člověk', 'Test AI'],
            [],
            40,
            {
                threeRolls: true,
                mustDeploy: true,
                skipHomePieces: true,
                mustEnterHome: true,
                threeSixesPenalty: false
            },
            'medium'
        );
        game.currentPlayer = 0;
        game.phase = 'move';
        game.diceValue = 1;
        game.pieces[0].pieces[0].steps = 0;
        game.pieces[0].pieces[1].steps = 5;
        game.pieces[1].pieces[0].steps = 15;

        const legalMoves = getValidMoves(game);
        const decision = chooseAIMoveDecision(game, 'medium', { situations: {} });
        const factors = decision?.breakdown?.selectedWeightFactors || {};
        const dice = decision?.breakdown?.diceSimulation || factors.diceSimulation || [];
        const opponents = decision?.breakdown?.opponentResponses || factors.opponentResponses || [];

        check('AI vybírá pouze legální tah', legalMoves.includes(decision?.pieceId),
            'legální možnosti: ' + legalMoves.join(', '));
        check('AI vrací všech 10 strategických vah',
            Object.keys(factors.weightContributions || {}).length === AI_WEIGHT_COUNT,
            'nalezeno: ' + Object.keys(factors.weightContributions || {}).length + '/' + AI_WEIGHT_COUNT);
        check('AI propočítá všech šest příštích hodů', dice.length === 6,
            'vypočteno: ' + dice.length + '/6');
        check('AI vyhodnotí každého soupeře', opponents.length === 1,
            'soupeři: ' + opponents.length);
        check('AI propočítá šest hodů soupeře',
            opponents.length === 1 && opponents[0].diceOutcomes?.length === 6,
            'varianty soupeře: ' + (opponents[0]?.diceOutcomes?.length || 0) + '/6');
        check('Každý kandidát má cílovou pozici',
            (decision.alternatives || []).every(item => Number.isInteger(item.toSteps)) &&
                Number.isInteger(decision.breakdown?.selectedToSteps),
            'výstup obsahuje pozici vybrané i ostatních figurek');

        const failed = checks.filter(item => !item.ok);
        return {
            ok: failed.length === 0,
            checks,
            summary: failed.length
                ? 'CHYBA ' + failed.length + '/' + checks.length + ' testů'
                : 'OK ' + checks.length + '/' + checks.length + ' testů'
        };
    } catch (error) {
        checks.push({ name: 'Spuštění testovací situace', ok: false, detail: error?.message || String(error) });
        return { ok: false, checks, summary: 'CHYBA při spuštění testu' };
    }
}
