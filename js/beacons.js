// Beacon system — Leave holographic messages in claimed sectors.
// Dark Souls style: short messages left by explorers for others to find.

import * as THREE from 'three';

const MAX_MESSAGE_LENGTH = 80;
const MAX_BEACONS_STORED = 200;

let beaconState = {
    beacons: {},  // key: "x,y,z" → { message, author, timestamp, rating }
};

/**
 * Initialize beacon system. Load from localStorage.
 */
export function initBeacons() {
    loadBeaconState();
}

/**
 * Leave a beacon message at the given sector coordinates.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} message
 * @param {string} author - Player name or ID
 * @returns {boolean} success
 */
export function leaveBeacon(x, y, z, message, author = 'Explorador Anónimo') {
    if (!message || message.length === 0) return false;
    if (message.length > MAX_MESSAGE_LENGTH) {
        message = message.substring(0, MAX_MESSAGE_LENGTH);
    }

    const key = `${x},${y},${z}`;
    beaconState.beacons[key] = {
        message,
        author,
        timestamp: Date.now(),
        rating: 0,
        coords: { x, y, z },
    };

    // Enforce max storage
    const keys = Object.keys(beaconState.beacons);
    if (keys.length > MAX_BEACONS_STORED) {
        // Remove oldest
        const sorted = keys.sort((a, b) =>
            beaconState.beacons[a].timestamp - beaconState.beacons[b].timestamp
        );
        delete beaconState.beacons[sorted[0]];
    }

    saveBeaconState();
    return true;
}

/**
 * Get the beacon at given coordinates, if any.
 * @returns {object|null} Beacon data or null
 */
export function getBeacon(x, y, z) {
    const key = `${x},${y},${z}`;
    return beaconState.beacons[key] || null;
}

/**
 * Rate a beacon (upvote).
 */
export function rateBeacon(x, y, z) {
    const key = `${x},${y},${z}`;
    if (beaconState.beacons[key]) {
        beaconState.beacons[key].rating++;
        saveBeaconState();
        return true;
    }
    return false;
}

/**
 * Get all beacons as an array, sorted by most recent.
 */
export function getAllBeacons() {
    return Object.values(beaconState.beacons)
        .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Generate preset messages for quick selection.
 */
export function getPresetMessages() {
    return [
        '⚠️ Peligro: Sector Anómalo adelante',
        '💎 Recursos valiosos aquí',
        '🕳️ Cuidado con el Agujero Negro',
        '🌟 Sistema estelar impresionante',
        '🏴 Territorio reclamado — pasar de largo',
        '🔭 Vista espectacular',
        '⛏️ Buen lugar para minar',
        '🌿 Vida alienígena detectada',
        '💀 No vale la pena explorar',
        '🚀 Punto de partida seguro',
        '🗿 Ruinas antiguas — investigar',
        '❄️ Sector congelado — traer anticongelante',
    ];
}

/**
 * Create a 3D holographic beacon in the scene.
 * Returns a THREE.Group to add to the scene.
 */
export function createBeaconMesh(beaconData) {
    const group = new THREE.Group();

    // Base pillar (holographic blue cylinder)
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6);
    const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 0.75;
    group.add(pillar);

    // Top diamond (holographic indicator)
    const diamondGeo = new THREE.OctahedronGeometry(0.3, 0);
    const diamondMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 1.8;
    group.add(diamond);

    // Rotating ring
    const ringGeo = new THREE.TorusGeometry(0.5, 0.03, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 1.8;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Pulse sphere
    const pulseGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.position.y = 1.8;
    group.add(pulse);

    // Store references for animation
    group.userData.isBeacon = true;
    group.userData.dynamic = true;
    group.userData.diamond = diamond;
    group.userData.ring = ring;
    group.userData.pulse = pulse;
    group.userData.beaconData = beaconData;
    group.userData.time = Math.random() * 100;

    // Position in scene (near star but offset)
    group.position.set(15, 5, -10);
    group.scale.setScalar(2);

    return group;
}

/**
 * Animate a beacon mesh (call each frame).
 */
export function animateBeacon(beaconGroup, delta) {
    if (!beaconGroup || !beaconGroup.userData.isBeacon) return;

    beaconGroup.userData.time += delta;
    const t = beaconGroup.userData.time;

    // Rotate diamond
    if (beaconGroup.userData.diamond) {
        beaconGroup.userData.diamond.rotation.y += delta * 1.5;
        beaconGroup.userData.diamond.position.y = 1.8 + Math.sin(t * 2) * 0.15;
    }

    // Rotate ring
    if (beaconGroup.userData.ring) {
        beaconGroup.userData.ring.rotation.z += delta * 0.8;
    }

    // Pulse effect
    if (beaconGroup.userData.pulse) {
        const scale = 1 + Math.sin(t * 3) * 0.3;
        beaconGroup.userData.pulse.scale.setScalar(scale);
        beaconGroup.userData.pulse.material.opacity = 0.05 + Math.sin(t * 3) * 0.03;
    }
}

// ─── Persistence ───

function saveBeaconState() {
    try {
        localStorage.setItem('cartografia_beacons', JSON.stringify(beaconState));
    } catch (e) { /* silent */ }
}

function loadBeaconState() {
    try {
        const raw = localStorage.getItem('cartografia_beacons');
        if (raw) {
            const data = JSON.parse(raw);
            beaconState = { ...beaconState, ...data };
        }
    } catch (e) { /* fresh start */ }
}
