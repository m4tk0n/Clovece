/**
 * Diagnostický overlay aktivovaný výhradně parametrem ?debug=1.
 * Sleduje rozměry obrazovky/viewportu a orientační FPS vykreslování stránky.
 * Panel je připnutý ke spodnímu okraji právě viditelné části obrazovky.
 * Herní logiku ani herní chat nemění.
 */
export function initDebugOverlay() {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    if (!document.body || document.getElementById('clovece-debug-overlay')) return;

    const panel = document.createElement('div');
    panel.id = 'clovece-debug-overlay';
    panel.setAttribute('aria-hidden', 'true');
    panel.style.cssText = [
        'position:fixed',
        'top:0',
        'left:2px',
        'z-index:2147483647',
        'box-sizing:border-box',
        'width:max-content',
        'max-width:calc(100vw - 8px)',
        'padding:3px 5px',
        'border:1px solid rgba(255,0,0,.55)',
        'border-radius:3px',
        'background:rgba(0,0,0,.82)',
        'color:#ff3b3b',
        'font:10px/1.35 monospace',
        'white-space:normal',
        'overflow-wrap:anywhere',
        'pointer-events:none',
        'user-select:none',
        '-webkit-user-select:none'
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

        // VisualViewport má vlastní rozměry a posun (např. při klávesnici
        // nebo skrytí adresního řádku). Výpočet proto nepoužívá jen innerHeight.
        const visibleTop = viewport ? viewport.offsetTop : 0;
        const visibleHeight = viewport ? viewport.height : windowHeight;
        const panelTop = Math.max(2, visibleTop + visibleHeight - panel.offsetHeight - 2);
        panel.style.top = format(panelTop) + 'px';
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
    window.visualViewport?.addEventListener('scroll', update, { passive: true });

    update();
    window.requestAnimationFrame(measureFrame);
}
