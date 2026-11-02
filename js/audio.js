/**
 * Správa zvuků.
 * Audio soubory mají preload="none" a stáhnou se až při prvním přehrání.
 */
let audioInitialized = false;

export function initAudio() {
    if (audioInitialized) return;
    audioInitialized = true;

    document.querySelectorAll('audio').forEach(audio => {
        audio.preload = 'none';
    });
}

export function playSound(id) {
    const audio = document.getElementById(id);
    if (!audio) return;

    audio.play().catch(error => {
        console.warn(`Zvuk ${id} se nepodařilo přehrát:`, error);
    });
}

export function stopSound(id) {
    const audio = document.getElementById(id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}

window.playSound = playSound;
window.stopSound = stopSound;
