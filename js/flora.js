// Flora generator — L-System based procedural alien vegetation.
// Generates fractal tree/crystal structures on planet surfaces.

import * as THREE from 'three';

/**
 * Seeded PRNG for deterministic generation.
 */
function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * L-System rule definitions per biome type.
 * Each rule set produces different visual character.
 */
const L_SYSTEM_RULES = {
    Temperate: {
        axiom: 'F',
        rules: { 'F': 'F[+F]F[-F]F' },
        angle: 25.7,
        iterations: 3,
        color1: 0x2d6b30,
        color2: 0x55cc44,
        segmentLength: 0.3,
        thickness: 0.04,
    },
    Lush: {
        axiom: 'X',
        rules: { 'X': 'F[+X][-X]FX', 'F': 'FF' },
        angle: 22.5,
        iterations: 4,
        color1: 0x1a8a3a,
        color2: 0x66ff55,
        segmentLength: 0.25,
        thickness: 0.05,
    },
    Crystalline: {
        axiom: 'F',
        rules: { 'F': 'FF+[+F-F-F]-[-F+F+F]' },
        angle: 30,
        iterations: 2,
        color1: 0x8855cc,
        color2: 0xcc99ff,
        segmentLength: 0.4,
        thickness: 0.06,
    },
    Biomechanical: {
        axiom: 'A',
        rules: { 'A': 'F[+A][-A]FA', 'F': 'FG' },
        angle: 35,
        iterations: 3,
        color1: 0x446688,
        color2: 0x88ccee,
        segmentLength: 0.35,
        thickness: 0.03,
    },
    Jungle: {
        axiom: 'X',
        rules: { 'X': 'F-[[X]+X]+F[+FX]-X', 'F': 'FF' },
        angle: 22,
        iterations: 4,
        color1: 0x0a5a0a,
        color2: 0x33aa22,
        segmentLength: 0.2,
        thickness: 0.04,
    },
    Frozen: {
        axiom: 'F',
        rules: { 'F': 'F[+F][-F]' },
        angle: 60,
        iterations: 3,
        color1: 0x88bbdd,
        color2: 0xcceeFF,
        segmentLength: 0.5,
        thickness: 0.02,
    },
};

/**
 * Expand an L-System string by applying rules for N iterations.
 */
function expandLSystem(axiom, rules, iterations) {
    let current = axiom;
    for (let i = 0; i < iterations; i++) {
        let next = '';
        for (const ch of current) {
            next += rules[ch] || ch;
        }
        current = next;
        // Safety cap to prevent exponential explosion
        if (current.length > 5000) break;
    }
    return current;
}

/**
 * Interpret an L-System string into 3D line segments using a turtle.
 * Returns an array of { start, end, depth } objects.
 */
function interpretLSystem(lString, angleStep, segmentLength, rng) {
    const segments = [];
    const stack = [];
    let pos = new THREE.Vector3(0, 0, 0);
    let dir = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3(1, 0, 0);
    let depth = 0;

    const angleDeg = angleStep;

    for (const ch of lString) {
        switch (ch) {
            case 'F':
            case 'G': {
                const start = pos.clone();
                // Add slight random variation
                const jitter = 1 + (rng() - 0.5) * 0.3;
                pos = pos.clone().add(dir.clone().multiplyScalar(segmentLength * jitter));
                segments.push({ start, end: pos.clone(), depth });
                break;
            }
            case '+': {
                const axis = new THREE.Vector3(0, 0, 1).applyAxisAngle(dir, rng() * Math.PI);
                const angle = THREE.MathUtils.degToRad(angleDeg + (rng() - 0.5) * 10);
                dir.applyAxisAngle(axis.length() > 0.001 ? axis.normalize() : right, angle).normalize();
                break;
            }
            case '-': {
                const axis = new THREE.Vector3(0, 0, 1).applyAxisAngle(dir, rng() * Math.PI);
                const angle = THREE.MathUtils.degToRad(angleDeg + (rng() - 0.5) * 10);
                dir.applyAxisAngle(axis.length() > 0.001 ? axis.normalize() : right, -angle).normalize();
                break;
            }
            case '[': {
                stack.push({ pos: pos.clone(), dir: dir.clone(), depth });
                depth++;
                break;
            }
            case ']': {
                if (stack.length > 0) {
                    const state = stack.pop();
                    pos = state.pos;
                    dir = state.dir;
                    depth = state.depth;
                }
                break;
            }
        }
    }

    return segments;
}

/**
 * Build a THREE.Group containing an L-System plant/crystal.
 * @param {string} biome - The biome type to determine visual style
 * @param {number} seed - Random seed for deterministic generation
 * @returns {THREE.Group|null} - The 3D flora object, or null if biome has no flora
 */
export function generateFlora(biome, seed) {
    const rules = L_SYSTEM_RULES[biome];
    if (!rules) return null;

    const rng = seededRandom(seed);
    const lString = expandLSystem(rules.axiom, rules.rules, rules.iterations);
    const segments = interpretLSystem(lString, rules.angle, rules.segmentLength, rng);

    if (segments.length === 0) return null;

    const group = new THREE.Group();
    const maxDepth = Math.max(...segments.map(s => s.depth), 1);

    // Build geometry from segments using cylinders for thick look
    const mat1 = new THREE.MeshBasicMaterial({ color: rules.color1 });
    const mat2 = new THREE.MeshBasicMaterial({ color: rules.color2 });

    // Use instanced approach: batch segments into a single BufferGeometry for performance
    const positions = [];
    const colors = [];
    const color1 = new THREE.Color(rules.color1);
    const color2 = new THREE.Color(rules.color2);

    for (const seg of segments) {
        positions.push(seg.start.x, seg.start.y, seg.start.z);
        positions.push(seg.end.x, seg.end.y, seg.end.z);

        // Color gradient: trunk → tips
        const t = seg.depth / maxDepth;
        const c = color1.clone().lerp(color2, t);
        colors.push(c.r, c.g, c.b);
        colors.push(c.r, c.g, c.b);
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 1,
        transparent: true,
        opacity: 0.9,
    });

    const linesMesh = new THREE.LineSegments(lineGeo, lineMat);
    group.add(linesMesh);

    // Add glowing tips (leaf/crystal nodes) at branch ends
    const tipPositions = [];
    const tipColors = [];
    const endPoints = new Set();

    // Find actual endpoints (positions that appear as end but not as start of next segment)
    const startSet = new Set(segments.map(s => `${s.start.x.toFixed(3)},${s.start.y.toFixed(3)},${s.start.z.toFixed(3)}`));
    for (const seg of segments) {
        const key = `${seg.end.x.toFixed(3)},${seg.end.y.toFixed(3)},${seg.end.z.toFixed(3)}`;
        if (!startSet.has(key) && !endPoints.has(key)) {
            endPoints.add(key);
            tipPositions.push(seg.end.x, seg.end.y, seg.end.z);
            tipColors.push(color2.r, color2.g, color2.b);
        }
    }

    if (tipPositions.length > 0) {
        const tipGeo = new THREE.BufferGeometry();
        tipGeo.setAttribute('position', new THREE.Float32BufferAttribute(tipPositions, 3));
        tipGeo.setAttribute('color', new THREE.Float32BufferAttribute(tipColors, 3));

        const tipMat = new THREE.PointsMaterial({
            size: biome === 'Crystalline' ? 0.15 : 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const tips = new THREE.Points(tipGeo, tipMat);
        group.add(tips);
    }

    group.userData.isFlora = true;
    return group;
}

/**
 * Create multiple flora instances scattered on a planet surface.
 * @param {THREE.Group} planetObj - The planet group to attach flora to
 * @param {string} biome - Planet biome
 * @param {number} planetRadius - Planet mesh radius
 * @param {number} seed - Base seed
 * @param {number} count - Number of flora instances (default 8)
 */
export function scatterFloraOnPlanet(planetObj, biome, planetRadius, seed, count = 8) {
    const rng = seededRandom(seed);

    for (let i = 0; i < count; i++) {
        const flora = generateFlora(biome, seed + i * 137);
        if (!flora) return; // Biome doesn't support flora

        // Random position on sphere surface using fibonacci sphere
        const phi = Math.acos(1 - 2 * rng());
        const theta = 2 * Math.PI * ((i * 0.618033988749895) % 1);

        const x = Math.sin(phi) * Math.cos(theta) * planetRadius;
        const y = Math.sin(phi) * Math.sin(theta) * planetRadius;
        const z = Math.cos(phi) * planetRadius;

        flora.position.set(x, y, z);

        // Orient flora to point outward from planet center
        flora.lookAt(x * 2, y * 2, z * 2);

        // Scale based on planet size
        const scale = planetRadius * 0.15 * (0.7 + rng() * 0.6);
        flora.scale.setScalar(scale);

        flora.userData.dynamic = true;
        planetObj.add(flora);
    }
}
