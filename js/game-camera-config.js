// /js/game-camera-config.js
// FTP sync refresh marker 2026-11-09
/**
 * Jediný zdroj nastavení kamery 3D hrací desky.
 * Renderer ani ovládací prvky nesmí obsahovat vlastní kopie těchto hodnot.
 */
export const BOARD_CAMERA_CONFIG = Object.freeze({
    target: Object.freeze({ x: 0, y: 0, z: 0 }),
    tiltDegrees: 55,
    distance: 29.9,
    azimuthX: 0.4385559757,
    azimuthZ: -0.8987038757,
    fov: 34,
    near: 0.1,
    far: 100,
    minDistanceMultiplier: 1.25,
    maxDistanceMultiplier: 4,
    maxPolarAngleDegrees: 88.2,
    enableDamping: true,
    dampingFactor: 0.07
});

/**
 * Nastaví výchozí polohu a limity OrbitControls z jediné konfigurace.
 * Po nastavení může hráč kamerou dál volně otáčet a přibližovat.
 */
export function configureBoardCamera(camera, controls, boardRadius) {
    const config = BOARD_CAMERA_CONFIG;
    const tilt = config.tiltDegrees * Math.PI / 180;
    const horizontal = config.distance * Math.sin(tilt);

    controls.target.set(config.target.x, config.target.y, config.target.z);
    camera.position.set(
        config.target.x + horizontal * config.azimuthX,
        config.target.y + config.distance * Math.cos(tilt),
        config.target.z + horizontal * config.azimuthZ
    );

    controls.enableDamping = config.enableDamping;
    controls.dampingFactor = config.dampingFactor;
    controls.minDistance = boardRadius * config.minDistanceMultiplier;
    controls.maxDistance = boardRadius * config.maxDistanceMultiplier;
    controls.maxPolarAngle = config.maxPolarAngleDegrees * Math.PI / 180;
    controls.update();
}
