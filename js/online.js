/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen } from './navigation.js';
import { renderBoard } from './game-board.js';
import { animateDice } from './app.js';
import { getForcedMove } from './game-engine.js';

const $ = id => document.getElementById(id);
const API_URL = 'online-api.php';

let csrfToken = '';
let currentGameId = null;
let currentInviteUrl = '';
let pollTimer = null;
let pollInFlight = false;
let bootstrapPromise = Promise.resolve();
let onlineState = null;
let onlineStateVersion = 0;
let autoMoveVersion = -1;
let currentPlayerIndex = -1;
let onlineMode = false;

async function api(action, values = {}) {
    await bootstrapPromise;
    if (!csrfToken) throw new Error('Online identita není připravená. Obnov stránku.');
    const body = new URLSearchParams({ action, ...values });
    if (csrfToken) body.set('csrf_token', csrfToken);

    const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('Server vrátil neplatnou odpověď.');
    }

    if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'Požadavek se nepodařilo dokončit.');
    }
    return result;
}

function notify(message) {
    const toast = $('toast');
    const target = $('toast-message');
    if (toast && target) {
        target.textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    } else {
        window.alert(message);
    }
}

function stopPolling() {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function schedulePoll() {
    stopPolling();
    if (!currentGameId) return;
    pollTimer = window.setTimeout(refreshGame, document.hidden ? 8000 : 3000);
}

function renderChat(messages, participants) {
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

function renderGameChat(messages, participants, moves = []) {
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

function renderOnlineGame(data) {
    const game = data.game;
    const previousState = onlineState;
    const previousVersion = onlineStateVersion;
    const hasNewRoll = Boolean(
        previousState &&
        Number(game.state_version) > previousVersion &&
        previousState.phase === 'roll' &&
        ['move', 'no-move', 'roll'].includes(game.state.phase)
    );

    onlineState = game.state;
    onlineStateVersion = Number(game.state_version);
    currentPlayerIndex = Number(data.current_player_index);
    onlineMode = true;

    if (!onlineState) return;
    showScreen('game');
    renderBoard($('game-container'), onlineState);

    // Animaci a zvuk spustíme pouze při přechodu po novém online hodu.
    const forcedMove = hasNewRoll && currentPlayerIndex === Number(onlineState.currentPlayer)
        ? getForcedMove(onlineState)
        : null;
    if (hasNewRoll && onlineState.diceValue) {
        const rollVersion = onlineStateVersion;
        void animateDice(onlineState.diceValue).then(() => {
            if (forcedMove !== null && autoMoveVersion !== rollVersion) {
                autoMoveVersion = rollVersion;
                if (onlineStateVersion === rollVersion && onlineState?.phase === 'move') {
                    void sendGameAction('move', forcedMove);
                }
            }
        });
    }

    const player = onlineState.players[onlineState.currentPlayer];
    const ownTurn = currentPlayerIndex === Number(onlineState.currentPlayer);
    $('current-player-name').textContent = player.name;
    $('current-player-display')?.style.setProperty('--player-color', player.color);
    $('dice-value').textContent = onlineState.diceValue || '—';

    let status = 'Čeká se na tah.';
    if (onlineState.phase === 'start-roll') {
        status = ownTurn ? 'Rozstřel: jsi na řadě. Hoď kostkou.' : 'Rozstřel: hází ' + player.name + '.';
    } else if (onlineState.phase === 'roll') {
        const pieces = onlineState.pieces?.[onlineState.currentPlayer]?.pieces || [];
        const retry = pieces.length === 4 && pieces.every(piece => Number(piece.steps) === -1) && Number(onlineState.baseRollAttempts) > 0;
        status = ownTurn ? 'Jsi na tahu. Hoď kostkou' + (retry ? ' (pokus ' + (Number(onlineState.baseRollAttempts) + 1) + '/3 o šestku)' : '') + '.' : 'Na tahu je ' + player.name + '.';
    } else if (onlineState.phase === 'move') {
        status = ownTurn ? 'Vyber figurku, kterou chceš posunout.' : player.name + ' vybírá figurku.';
    } else if (onlineState.phase === 'no-move') {
        status = ownTurn ? 'Nemáš platný tah. Přeskoč tah.' : player.name + ' nemá platný tah.';
    } else if (onlineState.phase === 'finished') {
        status = player.name + ' vyhrál.';
    }
    $('game-status').textContent = status;

    const rollButton = $('roll-dice-btn');
    const canRoll = ownTurn && ['start-roll', 'roll'].includes(onlineState.phase);
    rollButton?.classList.toggle('hidden', !canRoll);
    if (rollButton) {
        rollButton.disabled = !canRoll;
        const label = rollButton.querySelector('span');
        if (label) label.textContent = onlineState.phase === 'start-roll' ? 'HODIT ROZSTŘEL' : 'HODIT';
    }

    const passButton = $('end-turn-btn');
    passButton?.classList.toggle('hidden', !ownTurn || onlineState.phase !== 'no-move');
    if (passButton) {
        passButton.disabled = !ownTurn || onlineState.phase !== 'no-move';
        const label = passButton.querySelector('span');
        if (label) label.textContent = 'PŘESKOČIT TAH';
    }

    $('restart-btn')?.classList.add('hidden');
    renderGameChat(data.chat || [], data.participants || [], data.moves || []);

    const winModal = $('win-modal');
    if (onlineState.winner !== null && winModal) {
        const winner = onlineState.players[onlineState.winner];
        $('winner-name').textContent = winner.name;
        $('win-title').textContent = 'VÍTĚZSTVÍ!';
        $('win-message').textContent = winner.name + ' dostal všechny čtyři figurky domů.';
        winModal.classList.remove('hidden');
    } else {
        winModal?.classList.add('hidden');
    }
}

function renderGame(data) {
    const game = data.game;
    const participants = data.participants || [];

    if (['active', 'finished'].includes(game.status) && game.state) {
        renderOnlineGame(data);
        return;
    }

    onlineMode = false;
    $('win-modal')?.classList.add('hidden');
    showScreen('room');
    $('room-code-display')?.replaceChildren(document.createTextNode(game.public_id));
    if ($('room-invite-url')) $('room-invite-url').value = currentInviteUrl;

    const status = game.status === 'waiting' ? 'Čeká na hráče' : game.status;
    if ($('room-status-display')) {
        $('room-status-display').textContent = status + ' · ' + participants.length + '/' + game.player_limit;
    }

    const list = $('participant-list');
    if (list) {
        const participantKey = JSON.stringify(participants.map(player => ({
            id: player.id,
            display_name: player.display_name,
            color: player.color,
            player_type: player.player_type
        })));
        if (list.dataset.renderKey !== participantKey) {
            list.dataset.renderKey = participantKey;
            list.replaceChildren();
            participants.forEach(player => {
            const row = document.createElement('div');
            row.className = 'participant-item';
            const dot = document.createElement('span');
            dot.className = 'participant-color';
            dot.style.backgroundColor = player.color === 'random' ? '#778196' : player.color;
            const name = document.createElement('span');
            name.textContent = player.display_name;
            const type = document.createElement('small');
            const ownerLabel = player.player_type === 'ai' ? 'POČÍTAČ'
                : (Number(player.id) === Number(data.current_participant_id) ? 'TY' : 'HRÁČ');
            type.textContent = player.color === 'random' && player.player_type !== 'ai' ? ownerLabel + ' · NÁHODNÁ' : ownerLabel;
            row.append(dot, name, type);
            list.appendChild(row);
            });
        }
    }

    const ownParticipant = participants.find(player =>
        Number(player.id) === Number(data.current_participant_id)
    );
    const nameInput = $('room-player-name');
    if (nameInput && document.activeElement !== nameInput && ownParticipant) {
        nameInput.value = ownParticipant.display_name;
    }

    const colorSelect = $('room-player-color');
    if (colorSelect && ownParticipant) {
        const usedByOthers = new Set(participants
            .filter(player => Number(player.id) !== Number(data.current_participant_id))
            .map(player => player.color));
        const colorKey = JSON.stringify({
            ownColor: ownParticipant.color,
            usedByOthers: [...usedByOthers].sort()
        });
        if (document.activeElement !== colorSelect && colorSelect.dataset.renderKey !== colorKey) {
            colorSelect.dataset.renderKey = colorKey;
            colorSelect.replaceChildren();
            const randomOption = document.createElement('option');
            randomOption.value = 'random';
            randomOption.textContent = 'Náhodná';
            randomOption.selected = ownParticipant.color === 'random';
            colorSelect.appendChild(randomOption);

            ["#E53935","#1E88E5","#43A047","#F9A825","#FB8C00","#8E24AA","#00ACC1","#D81B60"].forEach((color, index) => {
                const option = document.createElement('option');
                option.value = color;
                option.textContent = ["Červená","Modrá","Zelená","Žlutá","Oranžová","Fialová","Tyrkysová","Růžová"][index];
                option.disabled = usedByOthers.has(color);
                option.selected = color === ownParticipant.color;
                colorSelect.appendChild(option);
            });
        }
        colorSelect.disabled = game.status !== 'waiting';
    }
    $('room-player-settings')?.classList.toggle('hidden', !ownParticipant);
    $('random-room-color-btn')?.classList.toggle('hidden', game.status !== 'waiting');

    $('ready-btn')?.classList.add('hidden');
    $('add-ai-player-btn')?.classList.toggle('hidden', !data.is_creator || participants.length >= Number(game.player_limit) || game.status !== 'waiting');
    $('room-start-game-btn')?.classList.toggle(
        'hidden',
        !data.is_creator || Number(data.human_count || 0) < 2 || participants.length < 2 || game.status !== 'waiting'
    );
    renderChat(data.chat || [], participants);
}

async function sendGameAction(actionType, pieceId = null) {
    if (!currentGameId || !onlineState) return;
    const values = {
        game_id: String(currentGameId),
        expected_version: String(onlineStateVersion),
        request_id: crypto.randomUUID(),
        action_type: actionType,
    };
    if (pieceId !== null) values.piece_id = String(pieceId);

    try {
        await api('game_action', values);
        await refreshGame();
    } catch (error) {
        notify(error.message);
        await refreshGame();
    }
}

async function refreshGame() {
    if (!currentGameId || pollInFlight) return;
    pollInFlight = true;
    try {
        const data = await api('get_game', { game_id: String(currentGameId) });
        renderGame(data);
    } catch (error) {
        notify(error.message);
        stopPolling();
    } finally {
        pollInFlight = false;
        schedulePoll();
    }
}

async function openGame(gameId, inviteUrl = '') {
    currentGameId = Number(gameId);
    currentInviteUrl = inviteUrl;
    showScreen('room');
    await refreshGame();
}


function renderMyGames(games) {
    const container = $('my-games-list');
    if (!container) return;

    // Nemažeme a nevytváříme znovu seznam, pokud server vrátil stejná data.
    const renderKey = JSON.stringify(games);
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;
    container.replaceChildren();
    if (!games.length) {
        const empty = document.createElement('p');
        empty.className = 'my-games-empty';
        empty.textContent = 'Zatím tu nemáš žádné čekající místnosti ani rozehrané hry.';
        container.appendChild(empty);
        return;
    }

    games.forEach(game => {
        const row = document.createElement('div');
        row.className = 'my-game-item';

        const details = document.createElement('div');
        details.className = 'my-game-details';

        const name = document.createElement('strong');
        name.textContent = 'Místnost ' + game.public_id;
        const meta = document.createElement('span');
        const status = game.status === 'waiting' ? 'Čeká na hráče'
            : game.status === 'active' ? 'Rozehraná hra' : 'Dokončeno';
        meta.textContent = status + ' · ' + game.participant_count + '/' + game.player_limit + ' hráčů';
        details.append(name, meta);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-btn small my-game-resume';
        button.dataset.gameId = String(game.id);
        button.textContent = game.status === 'finished' ? 'DOKONČENO' : 'POKRAČOVAT';
        button.disabled = game.status === 'finished';

        row.append(details, button);
        container.appendChild(row);
    });
}

async function loadMyGames() {
    const container = $('my-games-list');
    if (!container) return;
    try {
        const result = await api('list_my_games');
        renderMyGames(result.games || []);
    } catch (error) {
        container.textContent = 'Seznam her se nepodařilo načíst: ' + error.message;
    }
}

async function resumeMyGame(gameId, button) {
    if (button) button.disabled = true;
    try {
        const result = await api('resume_game', { game_id: String(gameId) });
        const inviteUrl = result.invite_url
            ? new URL(result.invite_url, window.location.href).toString()
            : '';
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        history.replaceState({}, '', url);
        await openGame(result.game_id, inviteUrl);
    } catch (error) {
        notify(error.message);
        await loadMyGames();
    } finally {
        if (button) button.disabled = false;
    }
}

async function savePlayerName() {
    await bootstrapPromise;
    const name = $('online-player-name')?.value.trim();
    if (name) await api('set_name', { display_name: name });
}

function extractInviteToken(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    try {
        const url = new URL(text, window.location.href);
        const token = url.searchParams.get('invite');
        if (token) return token;
    } catch {
        // Vstup může být přímo token, nikoli URL.
    }

    return /^[A-Za-z0-9_-]{40,60}$/.test(text) ? text : '';
}

async function joinRoom(value) {
    const inviteToken = extractInviteToken(value);
    if (!inviteToken) {
        notify('Vlož celý pozvánkový odkaz nebo jeho token. Samotný starý kód místnosti není podporován.');
        return;
    }

    try {
        await savePlayerName();
        const result = await api('join_game', { invite_token: inviteToken });
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('invite', inviteToken);
        history.replaceState({}, '', url);
        await openGame(result.game_id, url.toString());
    } catch (error) {
        notify(error.message);
    }
}

async function createRoom(button = $('create-room-btn-lobby')) {
    if (button?.dataset.creating === '1') return;

    const select = $('online-player-limit');
    const playerLimit = Number(select?.value || 4);
    const label = button?.querySelector('span');
    const originalLabel = label?.textContent || 'VYTVOŘIT NOVOU MÍSTNOST';

    if (button) {
        button.dataset.creating = '1';
        button.disabled = true;
        if (label) label.textContent = 'VYTVÁŘÍM MÍSTNOST…';
    }

    try {
        await savePlayerName();
        const result = await api('create_game', { player_limit: String(playerLimit) });
        const inviteUrl = new URL(result.invite_url, window.location.href).toString();
        await openGame(result.game_id, inviteUrl);
        notify('Místnost byla vytvořena. Zkopíruj pozvánku a pošli ji ostatním hráčům.');
    } catch (error) {
        console.error('Vytvoření online místnosti selhalo:', error);
        notify('Místnost se nepodařilo vytvořit: ' + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            delete button.dataset.creating;
        }
        if (label) label.textContent = originalLabel;
    }
}

async function copyInvite() {
    if (!currentInviteUrl) {
        notify('Pozvánkový odkaz zatím není k dispozici.');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentInviteUrl);
        notify('Pozvánkový odkaz zkopírován.');
    } catch {
        const field = $('room-invite-url');
        if (field) {
            field.value = currentInviteUrl;
            field.focus();
            field.select();
            notify('Označil jsem odkaz. Zkopíruj ho pomocí nabídky telefonu.');
        }
    }
}

async function leaveRoom() {
    if (!currentGameId) {
        showScreen('lobby');
        return;
    }

    try {
        await api('leave_game', { game_id: String(currentGameId) });
        currentGameId = null;
        currentInviteUrl = '';
        onlineState = null;
        onlineMode = false;
        stopPolling();
        showScreen('lobby');
        await loadMyGames();
    } catch (error) {
        notify(error.message);
    }
}

export async function initOnline() {
    $('my-games-list')?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-game-id]');
        if (!button || button.disabled) return;
        void resumeMyGame(button.dataset.gameId, button);
    });
    document.addEventListener('click', event => {
        if (event.target.closest?.('#back-from-room, #back-from-lobby')) {
            window.setTimeout(() => void loadMyGames(), 0);
        }
    });

    // Delegované navázání: funguje i při změně vnitřní struktury tlačítka.
    document.addEventListener('click', event => {
        const button = event.target.closest?.('#create-room-btn-lobby');
        if (!button) return;
        event.preventDefault();
        void createRoom(button);
    }, true);
    // Tlačítko pro připojení obsluhuje navigation.js přes window.joinRoom().
    $('room-player-settings')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!currentGameId) return;
        const name = $('room-player-name')?.value.trim();
        if (!name) {
            notify('Zadej zobrazované jméno.');
            return;
        }
        try {
            const result = await api('rename_participant', {
                game_id: String(currentGameId),
                display_name: name
            });
            const identityName = $('online-player-name');
            if (identityName) identityName.value = result.display_name;
            await refreshGame();
            notify('Tvoje jméno bylo změněno.');
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('room-player-color')?.addEventListener('change', async event => {
        if (!currentGameId) return;
        try {
            await api('set_color', {
                game_id: String(currentGameId),
                color: event.target.value
            });
            await refreshGame();
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('random-room-color-btn')?.addEventListener('click', async () => {
        const select = $('room-player-color');
        if (!currentGameId || !select) return;
        try {
            await api('set_color', {
                game_id: String(currentGameId),
                color: 'random'
            });
            await refreshGame();
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('create-transfer-code-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
            const result = await api('create_transfer_code');
            const output = $('transfer-code-output');
            if (output) {
                output.value = result.transfer_code;
                output.focus();
                output.select();
            }
            try {
                await navigator.clipboard.writeText(result.transfer_code);
                notify('Přenosový kód byl vytvořen a zkopírován. Platí 15 minut.');
            } catch {
                notify('Přenosový kód je připraven. Zkopíruj ho a zadej na druhém zařízení.');
            }
        } catch (error) {
            notify('Kód se nepodařilo vytvořit: ' + error.message);
        } finally {
            button.disabled = false;
        }
    });
    $('claim-transfer-code-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const input = $('transfer-code-input');
        const code = input?.value.trim() || '';
        if (!code) {
            notify('Nejprve vlož přenosový kód.');
            return;
        }
        button.disabled = true;
        try {
            await api('claim_transfer_code', { transfer_code: code });
            notify('Identita byla převedena. Obnovuji aplikaci…');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            notify('Přenos identity se nepodařil: ' + error.message);
            button.disabled = false;
        }
    });

    $('add-ai-player-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        if (!currentGameId || button.disabled) return;
        button.disabled = true;
        try {
            const result = await api('add_ai_player', { game_id: String(currentGameId) });
            notify(result.display_name + ' byl přidán do místnosti.');
            await refreshGame();
        } catch (error) {
            notify('AI hráče se nepodařilo přidat: ' + error.message);
        } finally {
            button.disabled = false;
        }
    });
    $('copy-invite-btn')?.addEventListener('click', copyInvite);
    $('room-start-game-btn')?.addEventListener('click', async () => {
        if (!currentGameId) return;
        try {
            await api('start_game', { game_id: String(currentGameId) });
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });
    $('roll-dice-btn')?.addEventListener('click', () => {
        if (!onlineMode) return;
        void sendGameAction(onlineState?.phase === 'start-roll' ? 'start_roll' : 'roll');
    });
    $('end-turn-btn')?.addEventListener('click', () => {
        if (onlineMode) void sendGameAction('pass_turn');
    });
    $('game-container')?.addEventListener('click', event => {
        if (!onlineMode || !onlineState || onlineState.phase !== 'move') return;
        const piece = event.target.closest('[data-player][data-piece]');
        if (!piece) return;
        const playerId = Number(piece.dataset.player);
        const pieceId = Number(piece.dataset.piece);
        if (playerId !== currentPlayerIndex || playerId !== onlineState.currentPlayer) return;
        void sendGameAction('move', pieceId);
    });
    $('quit-btn')?.addEventListener('click', event => {
        if (!onlineMode) return;
        event.stopImmediatePropagation();
        void leaveRoom();
    });
    $('close-win-btn')?.addEventListener('click', event => {
        if (!onlineMode) return;
        event.stopImmediatePropagation();
        void leaveRoom();
    });
    $('leave-room-btn')?.addEventListener('click', leaveRoom);

    $('chat-form')?.addEventListener('submit', async event => {
        if (!onlineMode) return;
        event.preventDefault();
        const input = $('chat-input');
        const message = input?.value.trim();
        if (!message || !currentGameId) return;
        try {
            await api('send_chat', { game_id: String(currentGameId), message });
            input.value = '';
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });

    $('room-chat-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const input = $('room-chat-input');
        const message = input?.value.trim();
        if (!message || !currentGameId) return;

        try {
            await api('send_chat', { game_id: String(currentGameId), message });
            input.value = '';
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });

    window.joinRoom = joinRoom;
    document.addEventListener('visibilitychange', schedulePoll);

    bootstrapPromise = (async () => {
        const response = await fetch(API_URL + '?action=bootstrap', {
            credentials: 'same-origin',
            cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) {
            throw new Error(data.error || 'Nepodařilo se připravit anonymní identitu.');
        }
        csrfToken = data.csrf_token || '';
        if (!csrfToken) throw new Error('Server neposlal bezpečnostní token.');
        const nameField = $('online-player-name');
        if (nameField && !nameField.value) nameField.value = data.identity?.display_name || 'Hráč';
        return data;
    })();

    try {
        await bootstrapPromise;
        await loadMyGames();
        const invite = new URLSearchParams(window.location.search).get('invite');
        if (invite) {
            showScreen('lobby');
            await joinRoom(invite);
        }
    } catch (error) {
        console.error('Online bootstrap:', error);
        notify('Online část se nepodařilo připojit: ' + error.message);
    }
}
