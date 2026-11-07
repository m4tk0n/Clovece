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
        const boardContainer = $('game-container');
        if (boardContainer && !boardContainer._playerPanelRefreshBound) {
            boardContainer.addEventListener('clovece:board-rendered', renderPlayers);
            boardContainer._playerPanelRefreshBound = true;
        }
        renderBoard(boardContainer, game);
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
    
    function updateTurnControls() {
            const game = getGame();
            if (!game) return;
        const player = game.players[game.currentPlayer];
        const isHuman = !player.isAI;
        $('current-player-name').textContent = player.name;
        $('current-player-display').style.setProperty('--player-color', player.color);
        $('dice-value').textContent = game.diceValue || '—';
        $('game-status').textContent = game.phase === 'start-roll'
            ? (isHuman ? 'Rozstřel: hoď kostkou, až přijdeš na řadu.' : 'AI hází v rozstřelu…')
            : game.phase === 'move'
                ? (isHuman ? 'Vyber figurku, kterou chceš posunout.' : 'AI vybírá svůj tah…')
                : game.phase === 'no-move'
                    ? 'Žádný možný tah.'
                    : game.phase === 'finished'
                        ? 'Hra skončila.'
                        : (isHuman ? 'Hoď kostkou a hraj.' : 'AI hází kostkou…');
    
        const canRoll = isHuman && ['start-roll', 'roll'].includes(game.phase);
        $('roll-dice-btn').classList.toggle('hidden', !canRoll);
        $('roll-dice-btn').disabled = !canRoll;
        const rollLabel = $('roll-dice-btn').querySelector('span');
        if (rollLabel) rollLabel.textContent = game.phase === 'start-roll' ? 'HODIT ROZSTŘEL' : 'HODIT';
        $('end-turn-btn').classList.add('hidden');
    }
    
    return { showGame, renderPlayers, updateTurnControls };
}
