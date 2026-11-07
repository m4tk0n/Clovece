/**
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
} from './game-board-view.js?v=20261107-2';
