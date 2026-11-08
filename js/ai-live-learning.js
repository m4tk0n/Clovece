/**
 * Průběžné učení místní AI.
 * Autoritativní model se načítá a ukládá do centrálního JSON souboru na serveru.
 * localStorage slouží pouze jako nouzová lokální kopie.
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
const CENTRAL_API = 'ai-learning-api.php';
let model = loadCachedModel();
let centralRevision = 0;
let centralBaseModel = null;
let centralCsrfToken = '';
let centralStorageAvailable = false;
let centralSaveQueue = Promise.resolve();
let currentGameStats = null;

function loadCachedModel() {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        return createSearchModel(raw ? JSON.parse(raw) : DEFAULT_SEARCH_MODEL);
    } catch {
        return createSearchModel(DEFAULT_SEARCH_MODEL);
    }
}

async function initializeCentralModel() {
    if (new URLSearchParams(globalThis.location?.search || '').get('test') === '1') return;
    if (typeof globalThis.fetch !== 'function' || !globalThis.location?.href) return;
    try {
        const url = new URL(CENTRAL_API, globalThis.location.href);
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = await response.json();
        if (!payload.success || !payload.model || typeof payload.csrf_token !== 'string') {
            throw new Error(payload.error || 'Neplatná odpověď centrálního úložiště.');
        }
        model = createSearchModel(payload.model);
        centralRevision = Number(payload.revision) || 0;
        centralBaseModel = createSearchModel(payload.base_model || payload.model);
        centralCsrfToken = payload.csrf_token;
        centralStorageAvailable = true;
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(model));
        } catch {
            // Centrální úložiště je autoritativní; cache není povinná.
        }
    } catch (error) {
        console.warn('Centrální model AI není dostupný; používám lokální záložní kopii:', error);
    }
}

// Načtení proběhne před prvním rozhodnutím AI, aby nová hra použila společný model.
await initializeCentralModel();

function rebaseLocalModel(localModel, sentModel, serverModel) {
    const rebased = JSON.parse(JSON.stringify(localModel));
    for (let index = 0; index < 1000; index++) {
        rebased.weights[index] = Math.max(-5, Math.min(5,
            Number(localModel.weights[index]) +
            Number(serverModel.weights[index]) -
            Number(sentModel.weights[index])
        ));
    }

    const sentByKey = new Map((sentModel.dynamicParameters || []).map(item => [item.key, item]));
    const merged = new Map();
    for (const item of localModel.dynamicParameters || []) {
        merged.set(item.key, { ...item });
    }
    for (const remote of serverModel.dynamicParameters || []) {
        const local = merged.get(remote.key);
        const sent = sentByKey.get(remote.key);
        if (!local) {
            merged.set(remote.key, { ...remote });
            continue;
        }
        local.weight = Math.max(-5, Math.min(5,
            Number(local.weight) + Number(remote.weight) - Number(sent?.weight || 0)
        ));
        for (const field of ['visits', 'teacherSupport', 'teacherRejects']) {
            local[field] = Math.max(0, Number(local[field] || 0) +
                Number(remote[field] || 0) - Number(sent?.[field] || 0));
        }
        local.id = remote.id;
        local.lastUpdatedGeneration = Math.max(
            Number(local.lastUpdatedGeneration || 0),
            Number(remote.lastUpdatedGeneration || 0)
        );
    }
    rebased.dynamicParameters = [...merged.values()];
    for (const field of ['decisionsTrained', 'gamesTrained']) {
        rebased[field] = Math.max(0, Number(localModel[field] || 0) +
            Number(serverModel[field] || 0) - Number(sentModel[field] || 0));
    }
    rebased.generation = Math.max(Number(localModel.generation || 0), Number(serverModel.generation || 0));
    return createSearchModel(rebased);
}

function queueCentralSave(snapshot) {
    if (!centralStorageAvailable || !centralCsrfToken || typeof fetch !== 'function') return;
    centralSaveQueue = centralSaveQueue.then(async () => {
        const response = await fetch(new URL(CENTRAL_API, globalThis.location.href), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                csrf_token: centralCsrfToken,
                revision: centralRevision,
                base_model: centralBaseModel || snapshot,
                model: snapshot
            })
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || ('HTTP ' + response.status));
        centralRevision = Number(payload.revision) || centralRevision;
        if (payload.model) {
            const serverModel = createSearchModel(payload.model);
            // Zachovej tahy, které se mezitím naučily lokálně během čekání na síť.
            model = rebaseLocalModel(model, snapshot, serverModel);
            centralBaseModel = serverModel;
        } else {
            centralBaseModel = createSearchModel(snapshot);
        }
    }).catch(error => {
        // Nezavírej synchronizaci natrvalo; další rozhodnutí může zápis zopakovat.
        console.warn('Uložení centrálního modelu AI selhalo:', error);
    });
}

function saveModel() {
    let saved = false;
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(model));
        saved = true;
    } catch {
        // Lokální cache není autoritativní ani povinná.
    }
    queueCentralSave(JSON.parse(JSON.stringify(model)));
    return saved || centralStorageAvailable;
}

export function beginLocalAiLearningGame() {
    if (new URLSearchParams(globalThis.location?.search || '').get('test') === '1') {
        currentGameStats = null;
        return;
    }
    currentGameStats = {
        dynamicAtStart: model.dynamicParameters.length,
        decisionsAtStart: model.decisionsTrained,
        newParameters: 0,
        changedParameters: 0,
        decisions: 0,
        lossTotal: 0
    };
}

export function completeLocalAiLearningGame() {
    if (new URLSearchParams(globalThis.location?.search || '').get('test') === '1') return null;
    if (!currentGameStats) beginLocalAiLearningGame();
    model.gamesTrained++;
    const saved = saveModel();
    const summary = {
        parametersAtStart: 1000 + currentGameStats.dynamicAtStart,
        newParameters: currentGameStats.newParameters,
        parametersAtEnd: 1000 + model.dynamicParameters.length,
        decisions: currentGameStats.decisions,
        changedParameters: currentGameStats.changedParameters,
        averageCrossEntropy: currentGameStats.decisions
            ? currentGameStats.lossTotal / currentGameStats.decisions : 0,
        gamesTrained: model.gamesTrained,
        topPatterns: [...model.dynamicParameters]
            .sort((a, b) => (b.teacherSupport - b.teacherRejects) - (a.teacherSupport - a.teacherRejects))
            .slice(0, 3)
            .map(item => ({
                id: item.id,
                featureNames: item.featureNames || [],
                weight: item.weight,
                teacherSupport: item.teacherSupport,
                teacherRejects: item.teacherRejects
            })),
        storageSaved: saved
    };
    currentGameStats = null;
    return summary;
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
    if (new URLSearchParams(globalThis.location?.search || '').get('test') === '1') return strategicDecision;
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
        if (!teacher) return strategicDecision;
        const teacherRanked = teacher.ranked || [
            { pieceId: teacher.pieceId, visits: teacher.visits, score: teacher.score },
            ...(teacher.alternatives || [])
        ];
        if (!teacherRanked.length) return strategicDecision;

        const studentDecision = chooseSearchPolicyMove(
            game, dependencies, model, { ...teacher, ranked: teacherRanked }, () => 0.5
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
        if (currentGameStats) {
            currentGameStats.decisions++;
            currentGameStats.newParameters += newParameters.length;
            currentGameStats.changedParameters += changedParameters;
            currentGameStats.lossTotal += trained.averageCrossEntropy;
        }
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
