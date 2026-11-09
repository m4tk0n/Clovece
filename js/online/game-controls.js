// /js/online/game-controls.js
/**
 * Ovládací prvky aktivní online hry.
 * Modul se inicializuje až po otevření herní obrazovky.
 */
export function createOnlineGameControls(deps) {
    const { session, sendGameAction, leaveRoom, api, notify, refreshGame } = deps;
    const $ = id => document.getElementById(id);
    let initialized = false;
    
    function initOnlineGameControls() {
        if (initialized) return;
        initialized = true;
    
        $('roll-dice-btn')?.addEventListener('click', () => {
            if (!session.onlineMode) return;
            void sendGameAction(session.onlineState?.phase === 'start-roll' ? 'start_roll' : 'roll');
        });
        $('end-turn-btn')?.addEventListener('click', () => {
            if (session.onlineMode) void sendGameAction('pass_turn');
        });
        $('game-container')?.addEventListener('click', event => {
            if (!session.onlineMode || !session.onlineState || session.onlineState.phase !== 'move') return;
            const piece = event.target.closest('[data-player][data-piece]');
            if (!piece) return;
            const playerId = Number(piece.dataset.player);
            const pieceId = Number(piece.dataset.piece);
            if (playerId !== session.currentPlayerIndex || playerId !== session.onlineState.currentPlayer) return;
            void sendGameAction('move', pieceId);
        });
        $('quit-btn')?.addEventListener('click', event => {
            if (!session.onlineMode) return;
            event.stopImmediatePropagation();
            void leaveRoom();
        });
        $('close-win-btn')?.addEventListener('click', event => {
            if (!session.onlineMode) return;
            event.stopImmediatePropagation();
            void leaveRoom();
        });
    
        $('chat-form')?.addEventListener('submit', async event => {
            if (!session.onlineMode) return;
            event.preventDefault();
            const input = $('chat-input');
            const message = input?.value.trim();
            if (!message || !session.currentGameId) return;
            try {
                await api('send_chat', { game_id: String(session.currentGameId), message });
                input.value = '';
                await refreshGame();
            } catch (error) {
                notify(error.message);
            }
        });
    }
    return initOnlineGameControls;
}
