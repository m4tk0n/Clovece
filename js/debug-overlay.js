/**
 * Diagnostický overlay aktivovaný výhradně parametrem ?debug=1.
 * Sleduje rozměry obrazovky/viewportu a orientační FPS vykreslování stránky.
 * Herní logiku ani herní chat nemění.
 */
export function initDebugOverlay() {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;

    const panel = document.createElement('div');
    panel.id = 'clovece-debug-overlay';
    panel.setAttribute('aria-hidden', 'true');
    panel.style.cssText = [
        'position:fixed',
        'top:2px',
        'left:2px',
        'z-index:2147483647',
        'max-width:calc(100vw - 8px)',
        'padding:3px 5px',
        'border:1px solid rgba(255,0,0,.45)',
        'border-radius:3px',
        'background:rgba(0,0,0,.72)',
        'color:#ff3b3b',
        'font:10px/1.35 monospace',
        'white-space:normal',
        'overflow-wrap:anywhere',
        'pointer-events:none',
        'user-select:none'
    ].join(';');
    document.body.appendChild(panel);

    let frameCount = 0;
    let lastSample = performance.now();
    let fps = 0;

    const format = value => Math.round(value);

    function update() {
        const viewport = window.visualViewport;
        const screenWidth = window.screen?.width ?? 0;
        const screenHeight = window.screen?.height ?? 0;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const visualWidth = viewport ? format(viewport.width) : windowWidth;
        const visualHeight = viewport ? format(viewport.height) : windowHeight;

        panel.textContent =
            'DEBUG | DISPLAY ' + screenWidth + '×' + screenHeight +
            ' | OKNO ' + windowWidth + '×' + windowHeight +
            ' | VIDITELNÉ ' + visualWidth + '×' + visualHeight +
            ' | DPR ' + (window.devicePixelRatio || 1).toFixed(2) +
            ' | FPS ' + fps;
    }

    function measureFrame(now) {
        frameCount++;
        const elapsed = now - lastSample;
        if (elapsed >= 1000) {
            fps = Math.round(frameCount * 1000 / elapsed);
            frameCount = 0;
            lastSample = now;
            update();
        }
        window.requestAnimationFrame(measureFrame);
    }

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });

    update();
    window.requestAnimationFrame(measureFrame);
}
