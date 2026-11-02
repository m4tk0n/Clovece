/**
 * Pomocné lazy načítání obrázků.
 * U obrázků použij loading="lazy" přímo v HTML.
 * Tento modul obsahuje pouze rozhraní pro případné prvky data-lazy-src.
 */
export function initLazyMedia(root = document) {
    const elements = root.querySelectorAll('[data-lazy-src]');
    if (!elements.length) return;

    const load = element => {
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
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            load(entry.target);
            currentObserver.unobserve(entry.target);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    elements.forEach(element => observer.observe(element));
}
