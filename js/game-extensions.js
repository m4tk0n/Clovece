/**
 * Lehké rozhraní pro volitelná rozšíření hry.
 * Samotná rozšíření se registrují samostatně a mohou se načítat podle potřeby.
 */
const extensions = new Set();

export function registerGameExtension(extension) {
    if (!extension || typeof extension !== 'object') {
        throw new TypeError('Rozšíření hry musí být objekt.');
    }
    extensions.add(extension);
    return () => extensions.delete(extension);
}

export function notifyGameExtensions(method, ...args) {
    for (const extension of extensions) {
        const callback = extension[method];
        if (typeof callback !== 'function') continue;
        try {
            callback(...args);
        } catch (error) {
            console.error('Volitelné rozšíření hry selhalo (' + method + '):', error);
        }
    }
}

export function getGameExtensionValue(method, fallback, ...args) {
    for (const extension of extensions) {
        const callback = extension[method];
        if (typeof callback !== 'function') continue;
        try {
            const value = callback(...args);
            if (value !== undefined) return value;
        } catch (error) {
            console.error('Volitelné rozšíření hry selhalo (' + method + '):', error);
        }
    }
    return fallback;
}
