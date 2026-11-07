/**
 * Vykreslení chatů online lobby a online hry.
 * Modul neobsahuje síťovou komunikaci ani stav online relace.
 */
const $ = id => document.getElementById(id);
const debugAI = new URLSearchParams(window.location.search).get('debug') === '1';

export function renderChat(messages, participants) {
    const container = $('room-chat-messages');
    if (!container) return;

    const names = new Map(participants.map(player => [
        Number(player.id),
        player.display_name
    ]));
    const renderKey = JSON.stringify({
        messages,
        names: [...names.entries()]
    });
    if (container.dataset.renderKey === renderKey) return;

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 24;
    const previousScrollTop = container.scrollTop;
    container.dataset.renderKey = renderKey;
    container.replaceChildren();
    messages.forEach(message => {
        const line = document.createElement('div');
        line.className = 'chat-message';

        const sender = document.createElement('strong');
        sender.textContent = (names.get(Number(message.participant_id)) || 'Hráč') + ': ';

        const body = document.createElement('span');
        body.textContent = message.message;

        line.append(sender, body);
        container.appendChild(line);
    });
    if (wasAtBottom) {
        container.scrollTop = container.scrollHeight;
    } else {
        container.scrollTop = previousScrollTop;
    }
}

export function renderGameChat(messages, participants, moves = []) {
    const container = $('chat-messages');
    if (!container) return;

    const names = new Map(participants.map(player => [Number(player.id), player.display_name]));
    const entries = [
        ...messages.map(item => ({ ...item, kind: 'chat', timestamp: Date.parse(item.created_at) || 0 })),
        ...moves.map(item => ({ ...item, kind: 'event', timestamp: Date.parse(item.created_at) || 0 }))
    ];

    entries.sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id));
    const renderKey = JSON.stringify({ entries, names: [...names.entries()] });
    if (container.dataset.renderKey === renderKey) return;

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 24;
    const previousScrollTop = container.scrollTop;
    container.dataset.renderKey = renderKey;
    container.replaceChildren();

    // Sousední herní události stejného hráče se slučují; běžná zpráva chatu řádek přeruší.
    const displayEntries = [];
    entries.forEach(item => {
        if (item.kind === 'chat') {
            displayEntries.push({
                kind: 'chat',
                sender: names.get(Number(item.participant_id)) || 'Hráč',
                text: item.message
            });
            return;
        }

        let action = {};
        try {
            action = JSON.parse(item.action_json || '{}');
        } catch {
            action = {};
        }

        const sender = names.get(Number(item.participant_id)) || 'Hra';
        let text = '';

        if (item.action_type === 'start') {
            const rounds = Array.isArray(action.rounds) ? action.rounds : [];
            const summary = rounds.map((round, index) =>
                'kolo ' + (index + 1) + ': ' + round.map(roll =>
                    (roll.playerName || ('Hráč ' + (Number(roll.playerId) + 1))) + ' ' + roll.value
                ).join(', ')
            ).join('; ');
            text = 'Rozstřel: ' + (summary || 'čeká se na první hod')
                + (action.inProgress
                    ? ' · čeká se na hod hráče ' + (action.currentPlayerName || '…')
                    : '. ' + (action.startingPlayerName || 'Vítěz') + ' začíná.');
        } else if (item.action_type === 'roll') {
            text = 'hodil ' + (action.value || '?');
            if (action.retrying) {
                text += action.value === 6
                    ? ', neměl platný tah a hází znovu'
                    : ', bez šestky (pokus ' + (action.attempt || '?') + '/3)';
            } else if (action.attempt && action.maxAttempts) {
                text += ', pokus ' + action.attempt + '/' + action.maxAttempts;
            }
        } else if (item.action_type === 'move') {
            const pieceNumber = Number(action.pieceId) + 1;
            const parts = [action.deployed
                ? 'nasadil figurku ' + pieceNumber
                : 'posunul figurku ' + pieceNumber + ' o ' + (action.diceValue || '?') + ' polí'];
            if (action.captured?.ownPiece) {
                parts.push('vyměnil vlastní figurku na startu (původní se vrátila do základny)');
            } else if (action.captured?.playerName) {
                parts.push('vyhodil hráče ' + action.captured.playerName);
            }
            if (action.finishedNow) parts.push('dostal figurku do domečku');
            text = parts.join(', ');
        } else if (item.action_type === 'pass_turn') {
            text = 'neměl platný tah, tah končí';
        } else {
            text = 'provedl herní akci';
        }

        const previous = displayEntries[displayEntries.length - 1];
        if (item.action_type !== 'start' && previous?.kind === 'event' && previous.sender === sender) {
            previous.text += ', ' + text;
        } else {
            displayEntries.push({ kind: 'event', sender, text });
        }

        if (debugAI && item.action_type === 'move' && action.aiLearning) {
            const learning = action.aiLearning;
            let learningText = 'Rozhodnutí ' + (learning.decisionsTrained || '?') +
                ': nové parametry +' + (learning.newParameterCount || 0) +
                ', upraveno vah ' + (learning.changedParameters || 0) +
                ', celkem parametrů ' + (learning.totalParameters || 1000) +
                ', loss ' + Number(learning.averageCrossEntropy || 0).toFixed(4) + '.';
            if (learning.policyInfluencedChoice) learningText += ' Naučená politika ovlivnila výběr tahu.';
            const examples = (learning.newParameters || []).slice(0, 3).map(parameter =>
                '#' + parameter.id + ' ' + (parameter.featureNames || []).join(' × ')
            );
            if (examples.length) learningText += ' Nové vzorce: ' + examples.join('; ') + '.';
            displayEntries.push({ kind: 'event', sender: 'AI UČENÍ', text: learningText });
        }
    });

    displayEntries.forEach(item => {
        const line = document.createElement('div');
        line.className = item.kind === 'chat' ? 'game-chat-message' : 'game-chat-event';
        const sender = document.createElement('strong');
        sender.textContent = item.sender + ': ';
        const body = document.createElement('span');
        body.textContent = item.text;
        line.append(sender, body);
        container.appendChild(line);
    });

    if (wasAtBottom) {
        container.scrollTop = container.scrollHeight;
    } else {
        container.scrollTop = previousScrollTop;
    }
}
