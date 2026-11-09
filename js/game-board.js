// /js/game-board.js
/**
 * FTP deploy marker: force-refresh the public board module on the live host.
 * Veřejné kompatibilní rozhraní herní desky.
 * Implementace přepínání zobrazení je v game-board-view.js.
 */
export {
    getBoardStyle,
    getBoardView,
    ensureGameStyles,
    buildBoardSceneData,
    renderBoard,
    prepareBoardRendering,
    ensureModeStyles,
    releaseGameView,
    animateThreeDice
} from './game-board-view.js';
