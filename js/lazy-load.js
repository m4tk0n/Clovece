/**
 * Pomocné lazy načítání médií.
 *
 * Pro obrázky a iframe lze použít data-lazy-src místo src.
 * Zdroj se nastaví až těsně před vstupem prvku do viewportu.
 * Zvukové prvky v index.html mají preload="none".
 */
function activateLazyMedia() {
    const elements = document.querySelectorAll('[data-lazy-src]');

    if (!elements.length) return;

    const load = (element) => {
        const source = element.getAttribute('data-lazy-src');
        if (!source) return;

        element.setAttribute('src', source);
        element.removeAttribute('data-lazy-src');
    };

    if (!('IntersectionObserver' in window)) {
        elements.forEach(load);
        return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            load(entry.target);
            currentObserver.unobserve(entry.target);
        });
    }, {
        rootMargin: '200px 0px',
        threshold: 0.01
    });

    elements.forEach((element) => observer.observe(element));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateLazyMedia, { once: true });
} else {
    activateLazyMedia();
}
