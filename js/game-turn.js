/**
 * Průběh tahu, pohyb figurek, hody kostkou a řízení AI.
 * Herní stav je držen v tomto modulu; app.js předává pouze závislosti.
 */
import { getGameExtensionValue } from './game-extensions.js';
import { refreshAITrainingKnowledge } from './ai-training-knowledge.js';
export function createTurnController(deps) {
    const {
        getValidMoves, getForcedMove, movePiece, rollDice, advanceTurn, chooseAIMove, chooseAIMoveDecision,
        settings, animateDice, isPaused, toast, play, showGame, updateStartLog, addGameLogEntry, addAITrainingEvaluation, setAIDebugExport
    } = deps;
    const $ = id => document.getElementById(id);
    const speedDelay = () => 950;
    const debugMode = new URLSearchParams(window.location.search).get('debug');
    const debugAI = debugMode === '1';
    const trainingAI = debugMode === 'training';
    let game = null;
    let aiTimer = null;
    let automationPaused = false;
    let modalOpen = false;
    let moveAnimating = false;
    let pendingAIDebugExport = null;

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
        const knowledge = await refreshAITrainingKnowledge();
        if (!game || game !== gameAtDecision ||
            [game.currentPlayer, game.turnNumber, game.phase, game.diceValue].join(':') !== decisionState) return null;
        if (knowledge.error && debugAI) {
            addGameLogEntry('AI učení', 'Instrukce se nepodařilo načíst: ' + knowledge.error);
        }
        const piecesBefore = JSON.parse(JSON.stringify(game.pieces));
        const legalMoves = getValidMoves(game);
        const playerPieces = game.pieces[game.currentPlayer]?.pieces || [];
        const allPiecesInBase = playerPieces.length > 0 && playerPieces.every(piece => Number(piece.steps) < 0);
        if (trainingAI && Number(game.diceValue) === 6 && allPiecesInBase) {
            // První povinné nasazení není taktické rozhodnutí, proto se nevytváří rozbor.
            return legalMoves[0] ?? null;
        }
        const decision = chooseAIMoveDecision
            ? chooseAIMoveDecision(game, undefined, knowledge.instructions)
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
        }
        return decision?.pieceId ?? null;
    }

    function performMove(pieceId) {
        if (!game || moveAnimating) return;
        const playerId = game.currentPlayer;
        const before = snapshotPieceSteps();
        const move = movePiece(game, pieceId);
        const after = snapshotPieceSteps();
        if ((debugAI || trainingAI) && pendingAIDebugExport && game.players[playerId]?.isAI &&
            Number(pendingAIDebugExport.decision.selectedPieceId) === Number(pieceId)) {
            pendingAIDebugExport.result = {
                move: { ...move },
                piecesAfter: JSON.parse(JSON.stringify(game.pieces)),
                phaseAfter: game.phase,
                winner: game.winner
            };
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
    
    async function doStartingRoll(isAI = false) {
        if (!game || game.phase !== 'start-roll' || modalOpen) return;
        const playerId = game.currentPlayer;
        const player = game.players[playerId];
        if (!isAI && player.isAI) return;
    
        const value = Math.floor(Math.random() * 6) + 1;
        game.testRollSequence = (game.testRollSequence || 0) + 1;
        game.diceValue = value;
        await animateDice(value, settings);
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
    
    async function doRoll(isAI = false) {
        if (!game || modalOpen) return;
        if (game.phase === 'start-roll') {
            await doStartingRoll(isAI);
            return;
        }
        if (game.phase !== 'roll') return;
        if (!isAI && game.players[game.currentPlayer].isAI) return;
    
        const result = rollDice(game);
        game.testRollSequence = (game.testRollSequence || 0) + 1;
        await animateDice(result.value, settings);
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
                doRoll(true);
            } else if (game.phase === 'move') {
                const selected = await chooseAndLogAIMove();
                if (selected !== null && !automationPaused && game?.phase === 'move' && !isPaused()) performMove(selected);
            }
        }, speedDelay());
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
        onBoardClick
    };
}
