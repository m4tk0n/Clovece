/**
 * Průběh tahu, pohyb figurek, hody kostkou a řízení AI.
 * Herní stav je držen v tomto modulu; app.js předává pouze závislosti.
 */
import { getGameExtensionValue } from './game-extensions.js';
export function createTurnController(deps) {
    const {
        getValidMoves, getForcedMove, movePiece, rollDice, advanceTurn, chooseAIMove,
        settings, animateDice, isPaused, toast, play, showGame, updateStartLog, addGameLogEntry
    } = deps;
    const $ = id => document.getElementById(id);
    const speedDelay = () => 950;
    let game = null;
    let aiTimer = null;
    let modalOpen = false;
    let moveAnimating = false;

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
    
    function performMove(pieceId) {
        if (!game || moveAnimating) return;
        const before = snapshotPieceSteps();
        const move = movePiece(game, pieceId);
        const after = snapshotPieceSteps();
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
        if (!game || modalOpen || isPaused()) return;
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
        game.diceValue = value;
        await animateDice(value, settings);
        if (!game || game.phase !== 'start-roll' || game.currentPlayer !== playerId || isPaused()) return;
    
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
        await animateDice(result.value, settings);
        if (!game || game.winner !== null || isPaused()) return;
    
        if (result.retrying) {
            const retryText = result.value === 6
                ? 'hodil 6, nemá legální tah a hází znovu'
                : 'hodil ' + result.value + ', bez šestky (pokus ' + result.attempt + '/3)';
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
                if (game && game.phase === 'no-move' && !isPaused()) {
                    advanceTurn(game);
                    continueGame();
                }
            }, 650);
            return;
        }
    
        const forcedMove = getForcedMove(game);
        const autoMoveForced = getGameExtensionValue('shouldAutoMoveForced', true, game);
        if (forcedMove !== null && autoMoveForced) {
            performMove(forcedMove);
            return;
        }
    
        showGame();
        if (isAI) {
            const selected = chooseAIMove(game);
            if (selected !== null) {
                aiTimer = setTimeout(() => {
                    if (!game || game.phase !== 'move' || isPaused()) return;
                    performMove(selected);
                }, speedDelay());
            }
        }
    }
    
    function scheduleAI() {
        clearTimeout(aiTimer);
        if (!game || game.winner !== null || modalOpen || isPaused()) return;
        const player = game.players[game.currentPlayer];
        if (!player || !player.isAI) return;
    
        aiTimer = setTimeout(() => {
            if (!game || modalOpen || moveAnimating || game.winner !== null || isPaused()) return;
            if (game.phase === 'start-roll' || game.phase === 'roll') {
                doRoll(true);
            } else if (game.phase === 'move') {
                const selected = chooseAIMove(game);
                if (selected !== null) performMove(selected);
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

    function resetForNewGame() {
        stopAI();
        modalOpen = false;
        moveAnimating = false;
    }

    return {
        setGame(value) { game = value; },
        stopAI,
        resetForNewGame,
        closeKickModal,
        continueGame,
        doRoll,
        onBoardClick
    };
}
