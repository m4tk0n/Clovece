/**
 * Správa zvuků.
 * Audio soubory mají preload="none" a stáhnou se až při prvním přehrání.
 */
let audioInitialized = false;
let masterVolume = 0.7;
let masterMuted = false;
let soundEffectsEnabled = true;

function applyMasterAudioState() {
    document.querySelectorAll('audio').forEach(audio => {
        audio.volume = masterMuted ? 0 : masterVolume;
    });
}

export function setMasterVolume(volume) {
    const value = Number(volume);
    if (!Number.isFinite(value)) return;
    masterVolume = Math.max(0, Math.min(1, value));
    masterMuted = masterVolume === 0;
    applyMasterAudioState();
}

export function toggleMasterMute() {
    masterMuted = !masterMuted;
    applyMasterAudioState();
    return !masterMuted;
}

export function getAudioState() {
    return { volume: masterVolume, muted: masterMuted };
}

export function initAudio() {
    if (audioInitialized) return;
    audioInitialized = true;

    document.querySelectorAll('audio').forEach(audio => {
        audio.preload = 'none';
    });
    applyMasterAudioState();
}

export function setSoundEffectsEnabled(enabled) {
    soundEffectsEnabled = Boolean(enabled);

    // Při vypnutí efektů zastavíme i zvuk, který právě hraje.
    if (!soundEffectsEnabled) {
        document.querySelectorAll('audio').forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    }
}

export function playSound(id) {
    if (!soundEffectsEnabled) return;
    const audio = document.getElementById(id);
    if (!audio) return;

    // Každý efekt respektuje aktuální celkovou hlasitost i ztlumení.
    audio.volume = masterMuted ? 0 : masterVolume;

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
