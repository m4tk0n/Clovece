/**
 * Lazy načítání vykreslovacího runtime online hry.
 * Vykreslování a animace se stáhnou až po vstupu do rozehrané hry.
 */
let runtimePromise = null;

export function loadOnlineGameRuntime() {
    if (!runtimePromise) {
        runtimePromise = Promise.all([
            import('./game-board.js'),
            import('./dice.js'),
            import('./game-engine.js')
        ]).then(([board, app, engine]) => ({
            renderBoard: board.renderBoard,
            ensureModeStyles: board.ensureModeStyles,
            getBoardView: board.getBoardView,
            animateDice: app.animateDice,
            getForcedMove: engine.getForcedMove
        })).catch(error => {
            runtimePromise = null;
            throw error;
        });
    }
    return runtimePromise;
}
