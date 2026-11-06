/**
 * Akce čekající online místnosti: seznam, vytvoření, připojení,
 * pozvánky, změna identity a opuštění místnosti.
 */
import { renderMyGames } from './my-games-view.js';

export function createRoomActions(deps) {
    const { $, api, notify, session, bootstrapOnline, showScreen, refreshGame, openGame, stopPolling } = deps;

    async function loadMyGames(containerId = 'my-games-list') {
        const container = $(containerId);
        if (!container) return;
        try {
            const result = await api('list_my_games');
            renderMyGames(result.games || [], containerId);
        } catch (error) {
            container.textContent = 'Seznam her se nepodařilo načíst: ' + error.message;
        }
    }
    
    async function resumeMyGame(gameId, button, containerId = 'my-games-list') {
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
            await loadMyGames(containerId);
        } finally {
            if (button) button.disabled = false;
        }
    }
    
    async function savePlayerName() {
        await bootstrapOnline();
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
        if (!session.currentInviteUrl) {
            notify('Pozvánkový odkaz zatím není k dispozici.');
            return;
        }
    
        try {
            await navigator.clipboard.writeText(session.currentInviteUrl);
            notify('Pozvánkový odkaz zkopírován.');
        } catch {
            const field = $('room-invite-url');
            if (field) {
                field.value = session.currentInviteUrl;
                field.focus();
                field.select();
                notify('Označil jsem odkaz. Zkopíruj ho pomocí nabídky telefonu.');
            }
        }
    }
    
    async function leaveRoom() {
        if (!session.currentGameId) {
            showScreen('lobby');
            return;
        }
    
        try {
            await api('leave_game', { game_id: String(session.currentGameId) });
            session.currentGameId = null;
            session.currentInviteUrl = '';
            session.onlineState = null;
            session.onlineMode = false;
            stopPolling();
            showScreen('lobby');
            await loadMyGames();
        } catch (error) {
            notify(error.message);
        }
    }

    return { loadMyGames, resumeMyGame, savePlayerName, joinRoom, createRoom, copyInvite, leaveRoom };
}
