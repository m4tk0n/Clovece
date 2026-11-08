/**
 * Průběh tahu, pohyb figurek, hody kostkou a řízení AI.
 * Herní stav je držen v tomto modulu; app.js předává pouze závislosti.
 */
import { getGameExtensionValue } from './game-extensions.js';
import { refreshAITrainingKnowledge } from './ai-training-knowledge.js';
import { isValidAINeuralModel } from './ai-neural-network.js';
export function createTurnController(deps) {
    const {
        getValidMoves, getForcedMove, movePiece, rollDice, advanceTurn, chooseAIMove, chooseAIMoveDecision,
        settings, animateDice, isPaused, toast, play, showGame, updateStartLog, addGameLogEntry, addAITrainingEvaluation, setAIDebugExport
    } = deps;
    const $ = id => document.getElementById(id);
    const speedDelay = () => 950;
    const debugMode = new URLSearchParams(window.location.search).get('debug');
    const debugAI = debugMode === '1';
    const trainingAI = debugMode === 'trainer' || debugMode === 'training';
    let game = null;
    let aiTimer = null;
    let automationPaused = false;
    let modalOpen = false;
    let moveAnimating = false;
    let pendingAIDebugExport = null;
    let pendingAIForcedMove = false;
    let trainingDecisionHistory = [];
    let trainingDecisionTurnKey = '';
    let trainingDecisionSequence = 0;
    const trainerDiceModeKey = 'clovece-trainer-ai-dice-mode';

    function getAIDiceMode() {
        try { return localStorage.getItem(trainerDiceModeKey) === 'auto' ? 'auto' : 'manual'; }
        catch { return 'manual'; }
    }

    function needsManualAIDice() {
        return trainingAI && Boolean(game?.players?.[game.currentPlayer]?.isAI) && getAIDiceMode() === 'manual';
    }

    function publishTrainingDecisionHistory() {
        if (!trainingAI) return;
        window.dispatchEvent(new CustomEvent('clovece:ai-training-decisions', {
            detail: { decisions: trainingDecisionHistory, currentId: pendingAIDebugExport?.decisionId || null }
        }));
    }

    function openKickModal(move) {
        modalOpen = true;
        const player = game.players[move.playerId];
        $('kicker-piece').style.background = player.color;
        $('kicked-piece').style.background = move.captured.color;
        $('kick-title').textContent = move.captured.ownPiece ? 'VÝMĚNA NA STARTU' : 'PŘESNÝ ZÁSAH!';
        $('kick-message').textContent = move.captured.ownPiece
            ? 'Při nasazení nové figurky se vaše původní figurka vrátila do základny.'
            : player.name + ' poslal hráče ' + move.captured.playerName + ' zpět do domečku.';
        $('kick-modal').classList.remove('hidden');
        play('kick-sound');
    }
    
    function closeKickModal() {
        $('kick-modal').classList.add('hidden');
        modalOpen = false;
        showGame();
        continueGame();
    }
    
    function snapshotPieceSteps() {
        return game.pieces.map(group => group.pieces.map(piece => piece.steps));
    }
    
    function restorePieceSteps(snapshot) {
        game.pieces.forEach((group, playerId) => group.pieces.forEach((piece, pieceId) => {
            piece.steps = snapshot[playerId][pieceId];
        }));
    }
    
    function delay(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }
    
    async function chooseAndLogAIMove() {
        const gameAtDecision = game;
        const decisionState = [game.currentPlayer, game.turnNumber, game.phase, game.diceValue].join(':');
        const knowledge = await refreshAITrainingKnowledge({ trainer: trainingAI });
        if (!game || game !== gameAtDecision ||
            [game.currentPlayer, game.turnNumber, game.phase, game.diceValue].join(':') !== decisionState) return null;
        if (knowledge.error && (debugAI || trainingAI)) {
            addGameLogEntry('AI učení', 'Paměť se nepodařilo aktualizovat: ' + knowledge.error);
        }
        if (trainingAI && Number(knowledge.processedNow) > 0) {
            addGameLogEntry('AI učení', 'Zpracováno nových hodnocení: ' + knowledge.processedNow +
                ' · celkem: ' + (knowledge.totalProcessed || 0) +
                ' · naučených situací: ' + (knowledge.situationCount || 0));
        }
        const piecesBefore = JSON.parse(JSON.stringify(game.pieces));
        pendingAIForcedMove = false;
        if (trainingAI) {
            const turnKey = [game.currentPlayer, game.turnNumber].join(':');
            if (turnKey !== trainingDecisionTurnKey) {
                trainingDecisionTurnKey = turnKey;
                trainingDecisionHistory = [];
            }
        }
        const legalMoves = getValidMoves(game);
        if (trainingAI && legalMoves.length === 1) {
            // Jediný legální tah není taktické rozhodnutí a nepatří do výukového panelu.
            pendingAIForcedMove = true;
            return legalMoves[0];
        }
        const playerPieces = game.pieces[game.currentPlayer]?.pieces || [];
        const allPiecesInBase = playerPieces.length > 0 && playerPieces.every(piece => Number(piece.steps) < 0);
        if (trainingAI && Number(game.diceValue) === 6 && allPiecesInBase) {
            // První povinné nasazení není taktické rozhodnutí, proto se nevytváří rozbor.
            return legalMoves[0] ?? null;
        }
        // Váhy neuronové sítě se načtou až při skutečném tahu AI, nikoli při startu webu.
        let neuralModel = null;
        try {
            const modelModule = await import('../models/ludo-ai.js');
            if (isValidAINeuralModel(modelModule.default)) neuralModel = modelModule.default;
        } catch (error) {
            if (debugAI || trainingAI) addGameLogEntry('AI model', 'Neuronový model není dostupný: ' + error.message);
        }
        const decision = chooseAIMoveDecision
            ? chooseAIMoveDecision(game, undefined, knowledge.memory, neuralModel)
            : { pieceId: chooseAIMove(game), reason: '' };
        if ((debugAI || trainingAI) && decision?.reason) {
            if (debugAI) addGameLogEntry('AI rozhodování', decision.reason);
            if (debugAI && decision.breakdown?.trainedKnowledge && decision.breakdown.usedInstructions?.length) {
                const usedIds = decision.breakdown.usedInstructions.map(item => item.id).join(', ');
                addGameLogEntry('AI učení', 'NAUČENO – použité instrukce: ' + usedIds);
            }
            const alternatives = [
                { pieceId: decision.pieceId, score: decision.score, reason: decision.reason, breakdown: decision.breakdown },
                ...(decision.alternatives || [])
            ].filter(item => item.pieceId !== null && item.pieceId !== undefined);
            if (debugAI && alternatives.length) {
                addGameLogEntry('AI možnosti', alternatives.map(item =>
                    'figurka ' + (Number(item.pieceId) + 1) + ': ' +
                    Number(item.score || 0).toFixed(4) + ' bodů (' + (item.reason || 'vyhodnocení') + ')'
                ).join('; '));
            }
            pendingAIDebugExport = {
                decisionId: trainingAI ? 'ai-decision-' + (++trainingDecisionSequence) : null,
                format: 'clovece-ai-debug',
                formatVersion: 1,
                strategyVersion: decision.breakdown?.trainedKnowledge ? 'human-instructions-v1' : 'untrained-v1',
                game: {
                    boardSize: game.boardSize || game.trackLength,
                    trackLength: game.trackLength,
                    playerCount: game.players.length,
                    players: game.players.map(player => ({
                        id: player.id, name: player.name, color: player.color,
                        type: player.isAI ? 'ai' : 'human', start: player.start, slot: player.slot
                    })),
                    rules: { ...game.rules },
                    currentPlayer: game.currentPlayer,
                    phase: game.phase,
                    diceValue: game.diceValue,
                    turnNumber: game.turnNumber,
                    piecesBefore
                },
                decision: {
                    legalMoves,
                    candidates: alternatives,
                    selectedPieceId: decision.pieceId,
                    explanation: decision.reason || '',
                    trainedKnowledge: Boolean(decision.breakdown?.trainedKnowledge),
                    usedInstructions: decision.breakdown?.usedInstructions || [],
                    knowledgeError: knowledge.error || null
                },
                result: null
            };
            if (trainingAI) {
                trainingDecisionHistory.push(pendingAIDebugExport);
                publishTrainingDecisionHistory();
            }
        }
        return decision?.pieceId ?? null;
    }

    function performMove(pieceId) {
        if (!game || moveAnimating) return;
        const playerId = game.currentPlayer;
        const before = snapshotPieceSteps();
        const move = movePiece(game, pieceId);
        const after = snapshotPieceSteps();
        if (trainingAI && pendingAIForcedMove && game.players[playerId]?.isAI) {
            addAITrainingEvaluation?.(game.players[playerId].name, 'jediný možný tah');
        }
        pendingAIForcedMove = false;
        if ((debugAI || trainingAI) && pendingAIDebugExport && game.players[playerId]?.isAI &&
            Number(pendingAIDebugExport.decision.selectedPieceId) === Number(pieceId)) {
            pendingAIDebugExport.result = {
                move: { ...move },
                piecesAfter: JSON.parse(JSON.stringify(game.pieces)),
                phaseAfter: game.phase,
                winner: game.winner
            };
            if (trainingAI) publishTrainingDecisionHistory();
            if (debugAI) setAIDebugExport?.(pendingAIDebugExport);
            if (trainingAI) {
                const playerName = game.players[playerId].name;
                // V herním chatu zůstane jen stručná značka; úplný rozbor patří do panelu.
                addAITrainingEvaluation?.(playerName, pendingAIDebugExport.decision.trainedKnowledge ? 'naučeno' : 'vyhodnocení');
                window.dispatchEvent(new CustomEvent('clovece:ai-training-decision', {
                    detail: {
                        ...pendingAIDebugExport,
                        aiName: playerName
                    }
                }));
            }
        }
        pendingAIDebugExport = null;
        return finishMove(move, { before, after });
    }
    
    async function animatePieceMove(move, movement) {
        if (!movement || settings.moveSpeed !== 'normal' || !settings.animations) return;
        const { before, after } = movement;
        const playerId = move.playerId;
        const pieceId = move.pieceId;
        const piece = game.pieces[playerId].pieces[pieceId];
        const from = before[playerId][pieceId];
        const to = after[playerId][pieceId];
        if (from === to) return;
    
        moveAnimating = true;
        try {
            const steps = from < 0 ? [0] : Array.from(
                { length: to - from }, (_, index) => from + index + 1
            );
            for (const step of steps) {
                piece.steps = step;
                if (move.captured) {
                    const captured = move.captured;
                    game.pieces[captured.playerId].pieces[captured.pieceId].steps =
                        before[captured.playerId][captured.pieceId];
                }
                showGame();
                await delay(350);
            }
        } finally {
            restorePieceSteps(after);
            moveAnimating = false;
            showGame();
        }
    }
    
    async function finishMove(move, movement) {
        await animatePieceMove(move, movement);
        const wasInBase = movement?.before?.[move.playerId]?.[move.pieceId] === -1;
        const logText = ['hodil ' + move.diceValue];
        if (wasInBase) {
            logText.push('nasadil figurku ' + (move.pieceId + 1));
        } else {
            logText.push('posunul figurku ' + (move.pieceId + 1) + ' o ' + move.diceValue + ' polí');
        }
        if (move.captured) logText.push(move.captured.ownPiece
            ? 'vyměnil vlastní figurku na startu (původní se vrátila do základny)'
            : 'vyhodil hráče ' + move.captured.playerName);
        if (move.finishedNow) logText.push('dostal figurku do domečku');
        if (move.penalty) logText.push('trest za tři šestky: figurka ' + (move.penalty.pieceId + 1) + ' se vrátila do základny');
        addGameLogEntry(move.playerName, logText.join(', '));
    
        showGame();
        if (move.captured) {
            openKickModal(move);
            if (game.players[move.playerId]?.isAI) {
                setTimeout(() => {
                    if (modalOpen) closeKickModal();
                }, 1900);
            }
            return;
        }
        if (move.finishedNow) toast('Figurka dorazila do domečku!');
        continueGame();
    }
    
    function continueGame() {
        if (!game || automationPaused || modalOpen || isPaused()) return;
        if (game.winner !== null) {
            showGame();
            showWin();
            return;
        }
        if (game.phase === 'no-move') {
            advanceTurn(game);
            continueGame();
            return;
        }
        showGame();
    
        if (game.players[game.currentPlayer].isAI) {
            scheduleAI();
        }
    }
    
    function showWin() {
        const winner = game.players[game.winner];
        $('winner-name').textContent = winner.name;
        $('win-title').textContent = winner.isAI ? 'AI VYHRÁLA!' : 'VÍTĚZSTVÍ!';
        $('win-message').textContent = winner.name + ' dostal všechny čtyři figurky domů.';
        $('win-modal').classList.remove('hidden');
        play('win-sound');
        const confetti = $('confetti');
        if (confetti) {
            confetti.innerHTML = Array.from({ length: 42 }, (_, i) =>
                '<i style="--i:' + i + ';--h:' + (i * 37 % 360) + 'deg"></i>'
            ).join('');
        }
    }
    
    async function doStartingRoll(isAI = false, selectedValue = null) {
        if (!game || game.phase !== 'start-roll' || modalOpen) return;
        const playerId = game.currentPlayer;
        const player = game.players[playerId];
        if (!isAI && player.isAI) return;
    
        const value = selectedValue === null ? Math.floor(Math.random() * 6) + 1 : Math.max(1, Math.min(6, Number(selectedValue) || 1));
        game.testRollSequence = (game.testRollSequence || 0) + 1;
        game.diceValue = value;
        if (selectedValue === null) await animateDice(value, settings);
        if (!game || automationPaused || game.phase !== 'start-roll' || game.currentPlayer !== playerId || isPaused()) return;
    
        const roundIndex = game.startRolls.length - 1;
        game.startRolls[roundIndex].push({ playerId, value });
    
        const candidates = game.startCandidates;
        const round = game.startRolls[roundIndex];
        if (round.length < candidates.length) {
            game.currentPlayer = candidates[round.length];
        } else {
            const highest = Math.max(...round.map(roll => roll.value));
            const winners = round.filter(roll => roll.value === highest).map(roll => roll.playerId);
            if (winners.length === 1) {
                game.startWinner = winners[0];
                game.startCandidates = [];
                game.currentPlayer = winners[0];
                game.phase = 'roll';
            } else {
                game.startCandidates = winners;
                game.startRolls.push([]);
                game.currentPlayer = winners[0];
            }
        }
    
        updateStartLog();
        showGame();
        if (game.phase === 'roll') {
            toast(game.players[game.currentPlayer].name + ' začíná hru.');
            // Pokud rozstřel vyhrála AI, musí se po přechodu do běžné hry
            // naplánovat její první hod. Bez continueGame() by hra zůstala stát.
            continueGame();
            return;
        }
        continueGame();
    }
    
    async function doRoll(isAI = false, selectedValue = null) {
        if (!game || modalOpen) return;
        if (game.phase === 'start-roll') {
            await doStartingRoll(isAI, selectedValue);
            return;
        }
        if (game.phase !== 'roll') return;
        if (!isAI && game.players[game.currentPlayer].isAI) return;
    
        const result = rollDice(game, selectedValue === null ? undefined : selectedValue);
        game.testRollSequence = (game.testRollSequence || 0) + 1;
        if (selectedValue === null) await animateDice(result.value, settings);
        if (!game || automationPaused || game.winner !== null || isPaused()) return;
    
        if (result.turnEnded) {
            const penaltyText = result.penalty
                ? 'hodil 6, nemá legální tah, trest za tři šestky: figurka ' + (result.penalty.pieceId + 1) + ' se vrátila do základny'
                : 'hodil 6, nemá legální tah; trest za tři šestky bez účinku (žádná figurka na hlavní trase)';
            addGameLogEntry(result.penalty?.playerName || game.players[(game.currentPlayer + game.players.length - 1) % game.players.length].name, penaltyText);
            showGame();
            continueGame();
            return;
        }

        if (result.retrying) {
            const retryText = result.value === 6
                ? 'hodil 6, nemá legální tah a hází znovu'
                : 'hodil ' + result.value + ', bez šestky (pokus ' + result.attempt + '/' + result.maxAttempts + ')';
            addGameLogEntry(game.players[game.currentPlayer].name, retryText);
            continueGame();
            return;
        }
    
        if (game.phase === 'no-move') {
            const noMoveText = result.attempt && result.maxAttempts
                ? 'hodil ' + result.value + ', bez šestky (pokus ' + result.attempt + '/' + result.maxAttempts + '), nemá platný tah'
                : 'hodil ' + result.value + ', nemá platný tah';
            addGameLogEntry(game.players[game.currentPlayer].name, noMoveText);
            toast(game.players[game.currentPlayer].name + ' nemá platný tah.');
            showGame();
            setTimeout(() => {
                if (game && !automationPaused && game.phase === 'no-move' && !isPaused()) {
                    advanceTurn(game);
                    continueGame();
                }
            }, 650);
            return;
        }
    
        const forcedMove = getForcedMove(game);
        const autoMoveForced = getGameExtensionValue('shouldAutoMoveForced', true, game);
        if (forcedMove !== null && autoMoveForced) {
            if (isAI) {
                const playerPieces = game.pieces[game.currentPlayer]?.pieces || [];
                const allPiecesInBase = playerPieces.length > 0 && playerPieces.every(piece => Number(piece.steps) < 0);
                const automaticFirstDeployment = trainingAI && Number(game.diceValue) === 6 && allPiecesInBase;
                // Nasazení první figurky šestkou je povinné a neobsahuje taktické rozhodnutí.
                if (!automaticFirstDeployment) await chooseAndLogAIMove();
                if (automationPaused || !game || game.phase !== 'move' || isPaused()) return;
                if (debugAI) {
                    addGameLogEntry('AI rozhodování', 'Mám pouze jeden legální tah, proto nemám jinou možnost než pohnout figurkou ' + (forcedMove + 1) + '.');
                }
            }
            performMove(forcedMove);
            return;
        }
    
        showGame();
        if (isAI) {
            const selected = await chooseAndLogAIMove();
            if (selected !== null) {
                aiTimer = setTimeout(() => {
                    if (!game || automationPaused || game.phase !== 'move' || isPaused()) return;
                    performMove(selected);
                }, speedDelay());
            }
        }
    }
    
    function scheduleAI() {
        clearTimeout(aiTimer);
        if (!game || automationPaused || game.winner !== null || modalOpen || isPaused()) return;
        const player = game.players[game.currentPlayer];
        if (!player || !player.isAI) return;
    
        aiTimer = setTimeout(async () => {
            if (!game || automationPaused || modalOpen || moveAnimating || game.winner !== null || isPaused()) return;
            if (game.phase === 'start-roll' || game.phase === 'roll') {
                if (needsManualAIDice()) {
                    showGame();
                    return;
                }
                doRoll(true);
            } else if (game.phase === 'move') {
                const selected = await chooseAndLogAIMove();
                if (selected !== null && !automationPaused && game?.phase === 'move' && !isPaused()) performMove(selected);
            }
        }, speedDelay());
    }
    
    function selectDice(value) {
        if (!trainingAI || !game || ![1, 2, 3, 4, 5, 6].includes(Number(value)) ||
            !['start-roll', 'roll'].includes(game.phase) || automationPaused || modalOpen || isPaused()) return;
        const player = game.players[game.currentPlayer];
        if (player?.isAI && getAIDiceMode() !== 'manual') return;
        void doRoll(Boolean(player?.isAI), Number(value));
    }

    function toggleAIDiceMode() {
        if (!trainingAI) return;
        const next = getAIDiceMode() === 'manual' ? 'auto' : 'manual';
        try { localStorage.setItem(trainerDiceModeKey, next); } catch (error) {
            console.warn('Režim házení AI se nepodařilo uložit:', error);
        }
        showGame();
        if (next === 'auto') continueGame();
    }

    function onBoardClick(event) {
        const piece = event.target.closest?.('[data-player][data-piece]');
        const playerId = Number(event.detail?.playerId ?? piece?.dataset.player);
        const pieceId = Number(event.detail?.pieceId ?? piece?.dataset.piece);
        if (!Number.isInteger(playerId) || !Number.isInteger(pieceId) || !game || game.phase !== 'move' || modalOpen || moveAnimating) return;
        if (playerId !== game.currentPlayer || game.players[playerId].isAI) return;
    
        if (!getValidMoves(game).includes(pieceId)) {
            toast('Tuto figurku tímto hodem posunout nelze.');
            return;
        }
    
        try {
            performMove(pieceId);
        } catch (error) {
            toast(error.message);
        }
    }
    

    function stopAI() {
        clearTimeout(aiTimer);
        aiTimer = null;
    }

    function pauseAI() {
        automationPaused = true;
        stopAI();
    }

    function resumeAI() {
        automationPaused = false;
        continueGame();
    }

    function resetForNewGame() {
        automationPaused = false;
        stopAI();
        modalOpen = false;
        moveAnimating = false;
        pendingAIDebugExport = null;
        trainingDecisionHistory = [];
        trainingDecisionTurnKey = '';
        setAIDebugExport?.(null);
    }

    return {
        setGame(value) { game = value; },
        stopAI,
        pauseAI,
        resumeAI,
        resetForNewGame,
        closeKickModal,
        continueGame,
        doRoll,
        selectDice,
        toggleAIDiceMode,
        onBoardClick
    };
}
