/**
 * Průběžné učení místní AI.
 * Model se ukládá jako JSON do úložiště prohlížeče daného zařízení.
 * Legální tahy a simulace zůstávají výhradně v herním enginu.
 */
import {
    createSearchModel,
    DEFAULT_SEARCH_MODEL,
    chooseSearchPolicyMove,
    trainSearchPolicy,
    getSearchPolicyScores
} from './ai-learning-search.js';
import { chooseMonteCarloDecision } from './ai-mcts.js';

const STORAGE_KEY = 'clovece.ai.search.learning.v1';
const STORAGE_PARAMETER_LIMIT = 5000;
let model = loadModel();

function loadModel() {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        return createSearchModel(raw ? JSON.parse(raw) : DEFAULT_SEARCH_MODEL);
    } catch {
        return createSearchModel(DEFAULT_SEARCH_MODEL);
    }
}

function saveModel() {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(model));
        return true;
    } catch {
        // localStorage má omezenou kapacitu. Zachováme nejpoužívanější
        // vzorce a stabilní ID, místo abychom poškodili nebo smazali celý model.
        if (model.dynamicParameters.length > STORAGE_PARAMETER_LIMIT) {
            model.dynamicParameters = [...model.dynamicParameters]
                .sort((a, b) => (b.visits + Math.abs(b.weight) * 4) - (a.visits + Math.abs(a.weight) * 4))
                .slice(0, STORAGE_PARAMETER_LIMIT)
                .sort((a, b) => a.id - b.id);
            try {
                globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(model));
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}

function decisionOptions(decision) {
    return decision ? [decision, ...(decision.alternatives || [])] : [];
}

/**
 * Vykoná jedno učící rozhodnutí. MCTS poskytne cílové hodnocení, model se
 * aktualizuje ihned a jeho naučené preference ovlivní následující tah AI.
 */
export function learnFromAIMove(game, dependencies, strategicDecision) {
    if (!strategicDecision || game?.phase !== 'move') return strategicDecision;
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return strategicDecision;

    const beforeCount = model.dynamicParameters.length;
    const beforeWeights = new Map(model.dynamicParameters.map(item => [item.id, item.weight]));
    const seed = (
        (Number(game.turnNumber) || 1) * 7919 +
        (Number(game.currentPlayer) || 0) * 104729 +
        (Number(game.diceValue) || 0) * 15485863 +
        (Number(model.decisionsTrained) || 0)
    ) >>> 0;

    try {
        const teacher = chooseMonteCarloDecision(game, dependencies, {
            simulations: 12,
            exploration: Math.SQRT2,
            maxPlayoutTurns: 80,
            seed
        });
        if (!teacher?.ranked?.length) return strategicDecision;

        const studentDecision = chooseSearchPolicyMove(
            game, dependencies, model, teacher, () => 0.5
        );
        if (!studentDecision?.model || !studentDecision.experience) return strategicDecision;

        const trained = trainSearchPolicy(studentDecision.model, [studentDecision.experience]);
        model = trained.model;
        const saved = saveModel();

        const learnedScores = getSearchPolicyScores(game, dependencies, model);
        const probabilityByPiece = new Map(learnedScores.map(item => [item.pieceId, item.probability]));
        const options = decisionOptions(strategicDecision).filter(item =>
            legalMoves.includes(item.pieceId)
        );
        const scores = options.map(item => Number(item.score) || 0);
        const minimum = scores.length ? Math.min(...scores) : 0;
        const maximum = scores.length ? Math.max(...scores) : 0;
        const range = Math.max(1e-9, maximum - minimum);
        const count = Math.max(1, options.length);

        const ranked = options.map(item => {
            const strategic = (Number(item.score) - minimum) / range;
            const policy = (probabilityByPiece.get(item.pieceId) || 0) * count;
            return {
                ...item,
                learningProbability: probabilityByPiece.get(item.pieceId) || 0,
                combinedScore: strategic * 0.88 + policy * 0.12
            };
        }).sort((a, b) => b.combinedScore - a.combinedScore || a.pieceId - b.pieceId);

        const selected = ranked[0] || strategicDecision;
        const changedParameters = model.dynamicParameters.filter(item =>
            Math.abs(item.weight - (beforeWeights.get(item.id) || 0)) > 1e-9
        ).length;
        const newParameters = studentDecision.newDynamicParameters || [];
        const totalParameters = 1000 + model.dynamicParameters.length;
        const summary = {
            decisionsTrained: model.decisionsTrained,
            gamesTrained: model.gamesTrained,
            newParameterCount: model.dynamicParameters.length - beforeCount,
            newParameters: newParameters.slice(0, 8),
            totalParameters,
            changedParameters,
            averageCrossEntropy: trained.averageCrossEntropy,
            teacherSimulations: teacher.simulations,
            storageSaved: saved,
            selectedPieceId: selected.pieceId,
            strategicPieceId: strategicDecision.pieceId,
            policyInfluencedChoice: selected.pieceId !== strategicDecision.pieceId
        };

        return {
            ...strategicDecision,
            ...selected,
            reason: selected.pieceId === strategicDecision.pieceId
                ? strategicDecision.reason
                : (selected.reason || strategicDecision.reason),
            learning: summary
        };
    } catch (error) {
        // Chyba učící vrstvy nikdy nesmí zastavit nebo zneplatnit běžnou hru.
        return {
            ...strategicDecision,
            learning: {
                decisionsTrained: model.decisionsTrained,
                totalParameters: 1000 + model.dynamicParameters.length,
                error: String(error?.message || error)
            }
        };
    }
}

export function getLocalAiLearningStats() {
    return {
        baseParameters: 1000,
        dynamicParameters: model.dynamicParameters.length,
        totalParameters: 1000 + model.dynamicParameters.length,
        decisionsTrained: model.decisionsTrained,
        gamesTrained: model.gamesTrained,
        generation: model.generation
    };
}
