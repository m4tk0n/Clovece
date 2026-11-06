/**
 * Vykreslení stavu lokální hry a ovládacích informací tahu.
 * Herní stav a renderer desky se předávají zvenku.
 */
export function createGameView({ getGame, renderBoard }) {
    const $ = id => document.getElementById(id);
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }
    function showGame() {
        const game = getGame();
        if (!game) return;
        renderBoard($('game-container'), game);
        renderPlayers();
        updateTurnControls();
    }
    
    function renderPlayers() {
        const game = getGame();
        const panel = $('players-panel');
        if (!panel || !game) return;
        panel.innerHTML = game.players.map((player, index) => {
            const finished = game.pieces[index].pieces.filter(
                piece => piece.steps >= game.trackLength
            ).length;
            return '<div class="board-player-stat" style="--player-color:' + player.color + '" title="' +
                escapeHtml(player.name) + '">' +
                '<strong>' + finished + '/4</strong>' +
            '</div>';
        }).join('');
    }
    
    return { showGame, renderPlayers, updateTurnControls };
}
