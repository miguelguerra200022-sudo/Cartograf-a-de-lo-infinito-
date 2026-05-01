/**
 * js/planet_surface.js
 * Surface management and atmosphere rendering.
 */

import * as THREE from 'three';
import { initChunkManager, updateChunks } from './chunk_manager.js';
import { setPlanetPostProcessing } from './scene.js';
import { enableFPS, disableFPS } from './fps_controller.js';

let scene, camera, renderer;
let currentPlanetData = null;
let mode = 'SPACE'; // 'SPACE' | 'SURFACE'
let atmosphere = null;

/**
 * Initialize surface systems.
 */
export function initPlanetSurface(sceneRef, cameraRef, rendererRef) {
    scene = sceneRef;
    camera = cameraRef;
    renderer = rendererRef;
}

/**
 * Transition from space to planet surface.
 * @param {Object} planetData { biome, name, seed, radius, index }
 */
export function enterPlanet(planetData) {
    currentPlanetData = planetData;
    mode = 'SURFACE';

    // 1. Setup Terrain
    initChunkManager(scene, planetData);

    // 2. Setup Atmosphere
    createAtmosphere(planetData.biome);

    // 3. Update HUD/UI
    window.dispatchEvent(new CustomEvent('planet-mode', { detail: { type: 'enter', data: planetData } }));

    // 4. Enable Visual Effects
    setPlanetPostProcessing(true);
    
    // 5. Switch Controls
    enableFPS();
}

/**
 * Transition back to space.
 */
export function leavePlanet() {
    mode = 'SPACE';
    
    // 1. Cleanup
    if (atmosphere) scene.remove(atmosphere);
    
    // 2. HUD
    window.dispatchEvent(new CustomEvent('planet-mode', { detail: { type: 'leave' } }));

    // 3. Disable Effects
    setPlanetPostProcessing(false);
    
    // 4. Switch Controls back
    disableFPS();
}

/**
 * Update loop for surface mode.
 */
export function updatePlanetSurface(delta) {
    if (mode !== 'SURFACE') return;

    updateChunks(camera);
    
    if (atmosphere) {
        atmosphere.position.copy(camera.position);
    }
}

/**
 * Create a simple volumetric atmosphere based on biome.
 */
function createAtmosphere(biome) {
    if (atmosphere) scene.remove(atmosphere);

    const colors = {
        'Temperate': 0x4488ff,
        'Desert':    0xffaa44,
        'Ice':       0x88ccff,
        'Volcanic':  0xff4422,
        'Alien':     0xaa44ff
    };

    const color = colors[biome] || 0x4488ff;
    
    const geometry = new THREE.SphereGeometry(1000, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.15,
        fog: false
    });

    atmosphere = new THREE.Mesh(geometry, material);
    atmosphere.userData.dynamic = true;
    scene.add(atmosphere);

    // Adjust scene fog for planet
    scene.fog.color.set(color).multiplyScalar(0.2);
    scene.fog.density = 0.002;
}

export function getGameMode() { return mode; }
export function getCurrentPlanetData() { return currentPlanetData; }
export function getAltitude(camera) {
    // Basic sea level is 0, terrain height is variable.
    // For now we use Y coordinate directly.
    return camera.position.y;
}
