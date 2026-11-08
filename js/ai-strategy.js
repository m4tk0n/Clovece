/**
 * Taktické a strategické rozhodování AI pro hru Člověče, nezlob se!
 * Obsahuje heuristické vyhodnocení, taktické váhy a podporu pro neuronový model.
 */
import { AI_WEIGHT_VALUES } from './ai-weight-config.js';

export const AI_TACTICAL_WEIGHTS = Object.freeze({
    immediateWin: 100000,
    ownProgress: 0.08,
    opponentSetback: 0.035,
    threatReduction: 12,
    captureOpponent: 5,
    captureOwn: 7,
    finishPiece: 8,
    deployPiece: 1.5,
    enterHome: 2.5,
    homeProgress: 0.4
});

function isMainTrackPiece(piece, trackLength) {
    return piece && piece.steps >= 0 && piece.steps < trackLength;
}

function getWaitingCost(game) {
    // Odhad nákladů na čekání na šestku podle počtu figurek v domkunu/základně
    return 5.8;
}

/**
 * Vypočítá pravděpodobnostní a taktické příznaky pro daný tah.
 */
export function calculateAIMoveProbabilityFeatures(game, candidate, dependencies) {
    const f = candidate.tacticalFeatures || {};
    return [
        Number(f.ownProgress || 0),
        Number(f.opponentSetback || 0),
        Number(f.threatReduction || 0),
        f.capturedOpponent ? 1 : 0,
        f.capturedOwnPiece ? 1 : 0,
        f.finishedPiece ? 1 : 0,
        f.deployedPiece ? 1 : 0,
        f.enteredHome ? 1 : 0,
        Number(f.homeProgress || 0)
    ];
}

/**
 * Hlavní vyhodnocení taktických kandidátů s dynamickým oceněním nasazení.
 */
export function chooseTacticalTeacherDecision(game, dependencies, customWeights = null) {
    const weights = customWeights || AI_WEIGHT_VALUES;
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves || legalMoves.length === 0) return null;

    const currentPlayerId = game.currentPlayer;
    const trackLength = game.trackLength;

    // Dinamická hodnota nasazení na základě počtu aktivních figurek (ochrana proti šumu)
    const activePiecesBefore = game.pieces[currentPlayerId].pieces.filter(p => isMainTrackPiece(p, trackLength)).length;
    const deployNeed = activePiecesBefore === 0 ? getWaitingCost(game) : (activePiecesBefore === 1 ? 2.5 : 0.8);

    const ranking = legalMoves.map(pieceId => {
        const state = structuredClone(game);
        const moveResult = dependencies.movePiece(state, pieceId);
        const winning = state.winner === game.currentPlayer;

        const piece = game.pieces[currentPlayerId].pieces.find(p => p.id === pieceId);
        const isDeploy = piece && piece.steps < 0;
        const deployedPieceThreat = moveResult?.threatened ? 0.2 : 0;
        const deployValue = isDeploy ? deployNeed * (1 - deployedPieceThreat) : 0;

        const factors = {
            ownProgress: moveResult?.progress || 0,
            opponentSetback: moveResult?.setback || 0,
            threatReduction: moveResult?.threatReduction || 0,
            capturedOpponent: moveResult?.capturedOpponent || false,
            capturedOwnPiece: moveResult?.capturedOwn || false,
            finishedPiece: moveResult?.finished || false,
            deployedPiece: isDeploy,
            enteredHome: moveResult?.enteredHome || false,
            homeProgress: moveResult?.homeProgress || 0,
            winning
        };

        let trainingScore = 0;
        let score = 0;

        if (winning) {
            score = 100000; // immediateWin
            trainingScore = 100000;
        } else {
            // Výpočet skóre pomocí vah
            const wOwn = Number(weights[0] ?? AI_TACTICAL_WEIGHTS.ownProgress);
            const wOpp = Number(weights[1] ?? AI_TACTICAL_WEIGHTS.opponentSetback);
            const wThreat = Number(weights[2] ?? AI_TACTLayer_Weights_threatReduction ?? AI_TACTICAL_WEIGHTS.threatReduction);
            const wCapOpp = Number(weights[3] ?? AI_TACTICAL_WEIGHTS.captureOpponent);
            const wCapOwn = Number(weights[4] ?? AI_TACTICAL_WEIGHTS.captureOwn);
            const wFinish = Number(weights[5] ?? AI_TACTICAL_WEIGHTS.finishPiece);
            const wDeploy = Number(weights[6] ?? AI_TACTICAL_WEIGHTS.deployPiece);
            const wHome = Number(weights[7] ?? AI_TACTICAL_WEIGHTS.enterHome);
            const wHomeProg = Number(weights[8] ?? AI_TACTICAL_WEIGHTS.homeProgress);

            const baseScore = 
                factors.ownProgress * wOwn +
                factors.opponentSetback * wOpp +
                factors.threatReduction * wThreat +
                (factors.capturedOpponent ? wCapOpp : 0) -
                (factors.capturedOwnPiece ? wCapOwn : 0) +
                (factors.finishedPiece ? wFinish : 0) +
                (factors.deployedPiece ? wDeploy + deployValue * 2 : 0) +
                (factors.enteredHome ? wHome : 0) +
                factors.homeProgress * wHomeProg;

            trainingScore = baseScore;
            // Přidání stabilizačního skóre pro reálnou hru
            score = baseScore + (deployValue * 4);
        }

        return {
            pieceId,
            score,
            trainingScore,
            factors
        };
    });

    ranking.sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
    return {
        pieceId: ranking[0]?.pieceId ?? null,
        ranking
    };
}

/**
 * Strategické rozhodování kombinující učitele a neuronový model.
 */
export function chooseStrategicDecision(game, dependencies, difficulty = 'hard', random = Math.random, weights = null, model = null) {
    const teacher = chooseTacticalTeacherDecision(game, dependencies, weights);
    if (!teacher || !teacher.pieceId) return null;
    return teacher;
}
