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
    
    function ensureTrainerDiceControls(trainerMode) {
        const gameScreen = $('game-screen');
        if (!gameScreen) return null;
        let controls = $('trainer-dice-controls');
        if (!trainerMode) {
            controls?.remove();
            return null;
        }
        if (controls) return controls;
        const markup = [
            '<div id="trainer-dice-controls" class="trainer-dice-controls" aria-label="Výběr hodnoty kostky">',
            '<div id="trainer-dice-options" class="trainer-dice-options">',
            '<button type="button" class="trainer-die" data-dice-value="1" aria-label="Hodit 1"><span class="pip p5"></span></button>',
            '<button type="button" class="trainer-die" data-dice-value="2" aria-label="Hodit 2"><span class="pip p1"></span><span class="pip p9"></span></button>',
            '<button type="button" class="trainer-die" data-dice-value="3" aria-label="Hodit 3"><span class="pip p1"></span><span class="pip p5"></span><span class="pip p9"></span></button>',
            '<button type="button" class="trainer-die" data-dice-value="4" aria-label="Hodit 4"><span class="pip p1"></span><span class="pip p3"></span><span class="pip p7"></span><span class="pip p9"></span></button>',
            '<button type="button" class="trainer-die" data-dice-value="5" aria-label="Hodit 5"><span class="pip p1"></span><span class="pip p3"></span><span class="pip p5"></span><span class="pip p7"></span><span class="pip p9"></span></button>',
            '<button type="button" class="trainer-die" data-dice-value="6" aria-label="Hodit 6"><span class="pip p1"></span><span class="pip p3"></span><span class="pip p4"></span><span class="pip p6"></span><span class="pip p7"></span><span class="pip p9"></span></button>',
            '</div>',
            '<button type="button" id="trainer-ai-dice-mode" class="trainer-ai-dice-mode" aria-pressed="true">AI KOSTKA: RUČNĚ</button>',
            '</div>'
        ].join('');
        const header = gameScreen.querySelector('.game-header');
        if (!header) return null;
        header.insertAdjacentHTML('afterend', markup);
        return $('trainer-dice-controls');
    }
    function updateTurnControls() {
            const game = getGame();
            if (!game) return;
        const player = game.players[game.currentPlayer];
        const isHuman = !player.isAI;
        $('current-player-name').textContent = player.name;
        $('current-player-display').style.setProperty('--player-color', player.color);
        $('dice-value').textContent = game.diceValue || '—';
        const trainerMode = ['trainer', 'training'].includes(new URLSearchParams(window.location.search).get('debug'));
        const diceControls = ensureTrainerDiceControls(trainerMode);
        if (diceControls) {
            diceControls.classList.toggle('hidden', !trainerMode);
            const aiDiceMode = (() => { try { return localStorage.getItem('clovece-trainer-ai-dice-mode') === 'auto' ? 'auto' : 'manual'; } catch { return 'manual'; } })();
            const diceRow = $('trainer-dice-options');
            const canChooseDice = ['start-roll', 'roll'].includes(game.phase) && (!player.isAI || aiDiceMode === 'manual');
            if (diceRow) {
                diceRow.classList.toggle('hidden', !['start-roll', 'roll'].includes(game.phase));
                diceRow.querySelectorAll('[data-dice-value]').forEach(button => {
                    button.disabled = !canChooseDice;
                    button.classList.toggle('is-selected', Number(button.dataset.diceValue) === Number(game.diceValue));
                });
            }
            const modeButton = $('trainer-ai-dice-mode');
            if (modeButton) {
                modeButton.textContent = aiDiceMode === 'auto' ? 'AI KOSTKA: AUTOMATICKY' : 'AI KOSTKA: RUČNĚ';
                modeButton.setAttribute('aria-pressed', String(aiDiceMode === 'manual'));
            }
        }
        $('game-status').textContent = game.phase === 'start-roll'
            ? (isHuman ? 'Rozstřel: vyber hodnotu kostky.' : (trainerMode && (() => { try { return localStorage.getItem('clovece-trainer-ai-dice-mode') !== 'auto'; } catch { return true; } })() ? 'AI čeká na výběr kostky.' : 'AI hází v rozstřelu…'))
            : game.phase === 'move'
                ? (isHuman ? 'Vyber figurku, kterou chceš posunout.' : 'AI vybírá svůj tah…')
                : game.phase === 'no-move'
                    ? 'Žádný možný tah.'
                    : game.phase === 'finished'
                        ? 'Hra skončila.'
                        : (isHuman ? (trainerMode ? 'Vyber hodnotu kostky.' : 'Hoď kostkou a hraj.') : (trainerMode && (() => { try { return localStorage.getItem('clovece-trainer-ai-dice-mode') !== 'auto'; } catch { return true; } })() ? 'AI čeká na výběr kostky.' : 'AI hází kostkou…'));
    
        const canRoll = !trainerMode && isHuman && ['start-roll', 'roll'].includes(game.phase);
        $('roll-dice-btn').classList.toggle('hidden', !canRoll);
        $('roll-dice-btn').disabled = !canRoll;
        const rollLabel = $('roll-dice-btn').querySelector('span');
        if (rollLabel) rollLabel.textContent = game.phase === 'start-roll' ? 'HODIT ROZSTŘEL' : 'HODIT';
        $('end-turn-btn').classList.add('hidden');
    }
    
    return { showGame, renderPlayers, updateTurnControls };
}
