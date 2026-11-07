/**
 * Monte Carlo Tree Search for Člověče, nezlob se!
 *
 * Decision nodes contain legal moves from the game engine. Between decision
 * nodes, dice are sampled as chance events through rollDice(); no game rules
 * are reimplemented here. UCT uses the reward component of the player who
 * made the parent decision, so opponents optimize their own chance to win.
 */
import { chooseStrategicMove } from './ai-strategy.js';

function cloneGame(game) {
    return JSON.parse(JSON.stringify(game));
}

function makeRandom(seed = Date.now()) {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function createNode(state, playerCount) {
    return {
        state,
        playerId: state.currentPlayer,
        playerCount,
        visits: 0,
        valueSums: Array(playerCount).fill(0),
        children: [],
        unexpandedMoves: null
    };
}

/** Resolve chance events until a player has a decision to make. */
function advanceToDecision(state, dependencies, random, maxChanceRolls = 80) {
    const { rollDice } = dependencies;
    let chanceRolls = 0;

    while (state.winner === null && chanceRolls < maxChanceRolls) {
        if (state.phase === 'move') return state;
        if (state.phase === 'finished') return state;
        if (state.phase === 'no-move') {
            dependencies.advanceTurn(state);
            continue;
        }
        if (state.phase !== 'roll') return state;

        const value = 1 + Math.floor(random() * 6);
        const result = rollDice(state, value);
        chanceRolls++;
        if (result.turnEnded || state.phase === 'no-move') {
            dependencies.advanceTurn(state);
        }
    }
    return state;
}

function getRewardVector(state, dependencies) {
    const count = state.players.length;
    if (state.winner !== null) {
        return Array.from({ length: count }, (_, id) => id === state.winner ? 1 : 0);
    }

    const pips = state.players.map(player =>
        dependencies.calculatePlayerPips(state, player.id)
    );
    const minimum = Math.min(...pips);
    const temperature = Math.max(8, 1.24 * Math.sqrt(
        pips.reduce((sum, value) => sum + value, 0) / Math.max(1, pips.length)
    ));
    const weights = pips.map(value => Math.exp(-(value - minimum) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => total ? value / total : 1 / count);
}

function selectChild(node, exploration) {
    const logParent = Math.log(Math.max(1, node.visits));
    let best = null;
    let bestScore = -Infinity;

    for (const child of node.children) {
        if (child.visits === 0) return child;
        const exploitation = child.valueSums[node.playerId] / child.visits;
        const explorationBonus = exploration * Math.sqrt(logParent / child.visits);
        const score = exploitation + explorationBonus;
        if (score > bestScore) {
            bestScore = score;
            best = child;
        }
    }
    return best;
}

function rollout(state, dependencies, random, options) {
    const maxTurns = options.maxPlayoutTurns;
    const startTurn = state.turnNumber;
    let turns = 0;

    while (state.winner === null && turns < maxTurns) {
        if (state.phase === 'roll') {
            const value = 1 + Math.floor(random() * 6);
            const result = dependencies.rollDice(state, value);
            if (result.turnEnded || state.phase === 'no-move') {
                dependencies.advanceTurn(state);
                turns++;
            }
            continue;
        }

        if (state.phase === 'no-move') {
            dependencies.advanceTurn(state);
            turns++;
            continue;
        }

        if (state.phase === 'move') {
            const pieceId = chooseStrategicMove(
                state,
                dependencies,
                options.rolloutDifficulty
            );
            if (pieceId === null || pieceId === undefined) {
                dependencies.advanceTurn(state);
                turns++;
            } else {
                dependencies.movePiece(state, pieceId);
                if (state.turnNumber > startTurn) turns = state.turnNumber - startTurn;
            }
            continue;
        }
        break;
    }

    return getRewardVector(state, dependencies);
}

/**
 * Search the current move decision. Defaults are deliberately modest for
 * mobile responsiveness; training scripts can request larger budgets.
 */
export function chooseMonteCarloDecision(game, dependencies, options = {}) {
    if (game.phase !== 'move' || game.winner !== null) return null;
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return null;

    const settings = {
        simulations: Math.max(1, Math.min(5000, Math.floor(options.simulations ?? 160))),
        exploration: Math.max(0.05, Math.min(4, Number(options.exploration ?? Math.SQRT2))),
        maxPlayoutTurns: Math.max(20, Math.min(3000, Math.floor(options.maxPlayoutTurns ?? 500))),
        rolloutDifficulty: ['easy', 'medium', 'hard'].includes(options.rolloutDifficulty)
            ? options.rolloutDifficulty : 'easy',
        seed: options.seed ?? 1
    };
    const random = makeRandom(settings.seed);
    const root = createNode(cloneGame(game), game.players.length);
    root.unexpandedMoves = [...legalMoves];

    for (let iteration = 0; iteration < settings.simulations; iteration++) {
        let node = root;
        let terminalState = null;

        while (true) {
            if (node.state.winner !== null) {
                terminalState = node.state;
                break;
            }

            if (node.unexpandedMoves === null) {
                node.unexpandedMoves = dependencies.getValidMoves(node.state);
            }

            if (node.unexpandedMoves.length) {
                const choiceIndex = Math.floor(random() * node.unexpandedMoves.length);
                const [pieceId] = node.unexpandedMoves.splice(choiceIndex, 1);
                const nextState = cloneGame(node.state);
                dependencies.movePiece(nextState, pieceId);
                advanceToDecision(nextState, dependencies, random);
                const child = createNode(nextState, game.players.length);
                child.parentMove = pieceId;
                node.children.push(child);
                node = child;
                terminalState = nextState;
                break;
            }

            if (!node.children.length) {
                terminalState = node.state;
                break;
            }

            node = selectChild(node, settings.exploration);
            if (!node) {
                terminalState = root.state;
                break;
            }
        }

        let rewards;
        if (terminalState?.winner !== null) {
            rewards = getRewardVector(terminalState, dependencies);
        } else {
            const simulation = cloneGame(terminalState || node.state);
            rewards = rollout(simulation, dependencies, random, settings);
        }

        let backprop = node;
        while (backprop) {
            backprop.visits++;
            rewards.forEach((value, playerId) => {
                backprop.valueSums[playerId] += value;
            });
            backprop = backprop.parent || null;
        }
    }

    const ranked = root.children
        .map(child => ({
            pieceId: child.parentMove,
            visits: child.visits,
            score: child.visits ? child.valueSums[game.currentPlayer] / child.visits : 0
        }))
        .sort((a, b) => b.visits - a.visits || b.score - a.score || a.pieceId - b.pieceId);

    // A legal move is retained as a defensive fallback for a zero-budget edge case.
    const selected = ranked[0] || { pieceId: legalMoves[0], visits: 0, score: 0 };
    return {
        pieceId: selected.pieceId,
        score: selected.score,
        simulations: settings.simulations,
        visits: selected.visits,
        alternatives: ranked.slice(1)
    };
}

export function chooseMonteCarloMove(game, dependencies, options = {}) {
    return chooseMonteCarloDecision(game, dependencies, options)?.pieceId ?? null;
}
