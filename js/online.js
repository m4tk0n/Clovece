/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen } from './navigation.js';
import { renderBoard } from './game-board.js';

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
    container.scrollTop = container.scrollHeight;
}

function renderGameChat(messages, participants) {
    const container = $('chat-messages');
    if (!container) return;

    const names = new Map(participants.map(player => [Number(player.id), player.display_name]));
    container.replaceChildren();
    messages.forEach(message => {
        const line = document.createElement('div');
        line.className = 'game-chat-message';
        const sender = document.createElement('strong');
        sender.textContent = (names.get(Number(message.participant_id)) || 'Hráč') + ': ';
        const body = document.createElement('span');
        body.textContent = message.message;
        line.append(sender, body);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
}

function renderOnlineGame(data) {
    const game = data.game;
    onlineState = game.state;
    onlineStateVersion = Number(game.state_version);
    currentPlayerIndex = Number(data.current_player_index);
    onlineMode = true;

    if (!onlineState) return;
    showScreen('game');
    renderBoard($('game-container'), onlineState);

    const player = onlineState.players[onlineState.currentPlayer];
    const ownTurn = currentPlayerIndex === Number(onlineState.currentPlayer);
    $('current-player-name').textContent = player.name;
    $('current-player-display')?.style.setProperty('--player-color', player.color);
    $('dice-value').textContent = onlineState.diceValue || '—';

    let status = 'Čeká se na tah.';
    if (onlineState.phase === 'roll') {
        status = ownTurn ? 'Jsi na tahu. Hoď kostkou.' : 'Na tahu je ' + player.name + '.';
    } else if (onlineState.phase === 'move') {
        status = ownTurn ? 'Vyber figurku, kterou chceš posunout.' : player.name + ' vybírá figurku.';
    } else if (onlineState.phase === 'no-move') {
        status = ownTurn ? 'Nemáš platný tah. Přeskoč tah.' : player.name + ' nemá platný tah.';
    } else if (onlineState.phase === 'finished') {
        status = player.name + ' vyhrál.';
    }
    $('game-status').textContent = status;

    const rollButton = $('roll-dice-btn');
    rollButton?.classList.toggle('hidden', !ownTurn || onlineState.phase !== 'roll');
    if (rollButton) rollButton.disabled = !ownTurn || onlineState.phase !== 'roll';

    const passButton = $('end-turn-btn');
    passButton?.classList.toggle('hidden', !ownTurn || onlineState.phase !== 'no-move');
    if (passButton) {
        passButton.disabled = !ownTurn || onlineState.phase !== 'no-move';
        const label = passButton.querySelector('span');
        if (label) label.textContent = 'PŘESKOČIT TAH';
    }

    $('restart-btn')?.classList.add('hidden');
    renderGameChat(data.chat || [], data.participants || []);

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

    if (game.status === 'active' && game.state) {
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
        list.replaceChildren();
        participants.forEach(player => {
            const row = document.createElement('div');
            row.className = 'participant-item';
            const dot = document.createElement('span');
            dot.className = 'participant-color';
            dot.style.backgroundColor = player.color;
            const name = document.createElement('span');
            name.textContent = player.display_name;
            const type = document.createElement('small');
            type.textContent = Number(player.id) === Number(data.current_participant_id) ? 'TY' : 'HRÁČ';
            row.append(dot, name, type);
            list.appendChild(row);
        });
    }

    $('ready-btn')?.classList.add('hidden');
    $('room-start-game-btn')?.classList.toggle(
        'hidden',
        !data.is_creator || participants.length < 2 || game.status !== 'waiting'
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

async function createRoom() {
    const select = $('online-player-limit');
    const playerLimit = Number(select?.value || 4);

    try {
        const result = await api('create_game', { player_limit: String(playerLimit) });
        const inviteUrl = new URL(result.invite_url, window.location.href).toString();
        await openGame(result.game_id, inviteUrl);
        notify('Místnost byla vytvořena. Zkopíruj pozvánku a pošli ji ostatním hráčům.');
    } catch (error) {
        notify(error.message);
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
    } catch (error) {
        notify(error.message);
    }
}

export async function initOnline() {
    $('join-room-btn')?.addEventListener('click', () => showScreen('lobby'));
    $('create-room-btn-lobby')?.addEventListener('click', createRoom);
    // Tlačítko pro připojení obsluhuje navigation.js přes window.joinRoom().
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
        if (onlineMode) void sendGameAction('roll');
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
        return data;
    })();

    try {
        await bootstrapPromise;
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
