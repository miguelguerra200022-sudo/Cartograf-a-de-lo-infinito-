// L-System ruin visualizer — 3D turtle graphics.
// Interprets L-System derivation strings from the WASM engine
// as 3D construction instructions to build fractal alien structures.

import * as THREE from 'three';

let ruinGroup = null;

const RUIN_STYLES = {
    PrecursorMonolith: {
        color: 0x667eea,
        emissive: 0x334488,
        emissiveIntensity: 0.6,
        stepLength: 2.0,
        turnAngle: Math.PI / 6,
        thickness: 0.15,
    },
    BiomechanicalHive: {
        color: 0x44aa66,
        emissive: 0x115522,
        emissiveIntensity: 0.8,
        stepLength: 1.5,
        turnAngle: Math.PI / 4,
        thickness: 0.2,
    },
    CrystallineArchive: {
        color: 0x8a5aba,
        emissive: 0x553388,
        emissiveIntensity: 1.0,
        stepLength: 2.5,
        turnAngle: Math.PI / 3,
        thickness: 0.1,
    },
    VoidGateway: {
        color: 0xff6600,
        emissive: 0x883300,
        emissiveIntensity: 0.7,
        stepLength: 3.0,
        turnAngle: Math.PI / 5,
        thickness: 0.25,
    },
    QuantumRelay: {
        color: 0x00ccff,
        emissive: 0x006688,
        emissiveIntensity: 0.9,
        stepLength: 1.8,
        turnAngle: Math.PI / 4.5,
        thickness: 0.12,
    },
};

/**
 * Create 3D ruin structures from L-System data.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {object[]} ruins - Array of ruin objects from WASM JSON.
 */
export function createRuins(scene, ruins) {
    removeRuins(scene);
    if (!ruins || ruins.length === 0) return;

    ruinGroup = new THREE.Group();
    ruinGroup.userData.dynamic = true;

    ruins.forEach((ruin, index) => {
        const ruinMesh = buildRuinGeometry(ruin, index, ruins.length);
        ruinGroup.add(ruinMesh);
    });

    scene.add(ruinGroup);
}

function buildRuinGeometry(ruin, index, totalRuins) {
    const style = RUIN_STYLES[ruin.ruin_type] || RUIN_STYLES.PrecursorMonolith;
    const group = new THREE.Group();
    group.userData.dynamic = true;

    // Extract the derivation string (remove truncation info)
    let derivation = ruin.derivation_sequence || '';
    const truncIdx = derivation.indexOf('...[');
    if (truncIdx > 0) {
        derivation = derivation.substring(0, truncIdx);
    }

    // Limit processing length for performance
    const maxSymbols = 500;
    if (derivation.length > maxSymbols) {
        derivation = derivation.substring(0, maxSymbols);
    }

    // Turtle state
    const points = [];
    const state = {
        pos: new THREE.Vector3(0, 0, 0),
        dir: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
    };
    const stack = [];

    points.push(state.pos.clone());

    // Interpret derivation
    for (const ch of derivation) {
        switch (ch) {
            case 'A':
            case 'B':
                // Move forward and record point
                state.pos.add(state.dir.clone().multiplyScalar(style.stepLength));
                points.push(state.pos.clone());
                break;

            case '+':
                // Rotate positive around Z axis
                state.dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), style.turnAngle);
                state.right.applyAxisAngle(new THREE.Vector3(0, 0, 1), style.turnAngle);
                break;

            case '-':
                // Rotate negative around Z axis
                state.dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -style.turnAngle);
                state.right.applyAxisAngle(new THREE.Vector3(0, 0, 1), -style.turnAngle);
                break;

            case '[':
                // Push state
                stack.push({
                    pos: state.pos.clone(),
                    dir: state.dir.clone(),
                    right: state.right.clone(),
                });
                break;

            case ']':
                // Pop state — draw a connecting line back
                if (stack.length > 0) {
                    const saved = stack.pop();
                    points.push(state.pos.clone());
                    points.push(saved.pos.clone());
                    state.pos = saved.pos;
                    state.dir = saved.dir;
                    state.right = saved.right;
                }
                break;
        }
    }

    // Create line geometry from points
    if (points.length > 1) {
        // Line structure
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
            color: style.color,
            transparent: true,
            opacity: 0.7,
            linewidth: 1,
        });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        lines.userData.dynamic = true;
        group.add(lines);

        // Node spheres at branch points for visual interest
        const nodeMat = new THREE.MeshStandardMaterial({
            color: style.color,
            emissive: style.emissive,
            emissiveIntensity: style.emissiveIntensity,
            roughness: 0.3,
            metalness: 0.5,
        });

        // Add nodes at key points (every Nth point to avoid too many)
        const nodeInterval = Math.max(3, Math.floor(points.length / 30));
        for (let i = 0; i < points.length; i += nodeInterval) {
            const nodeGeo = new THREE.SphereGeometry(style.thickness * 3, 8, 8);
            const node = new THREE.Mesh(nodeGeo, nodeMat);
            node.position.copy(points[i]);
            node.userData.dynamic = true;
            group.add(node);
        }

        // Add cylinder segments for the main trunk
        for (let i = 0; i < Math.min(points.length - 1, 100); i += 2) {
            const start = points[i];
            const end = points[i + 1];
            if (!start || !end) continue;

            const segLen = start.distanceTo(end);
            if (segLen < 0.01) continue;

            const cylGeo = new THREE.CylinderGeometry(
                style.thickness, style.thickness * 0.7, segLen, 6
            );
            const cyl = new THREE.Mesh(cylGeo, nodeMat.clone());

            // Position and orient the cylinder
            const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            cyl.position.copy(mid);

            const direction = new THREE.Vector3().subVectors(end, start).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), direction
            );
            cyl.setRotationFromQuaternion(quaternion);
            cyl.userData.dynamic = true;
            group.add(cyl);
        }
    }

    // Position ruins on the terrain at offset positions
    const spread = 80;
    const angle = (index / totalRuins) * Math.PI * 2;
    group.position.set(
        Math.cos(angle) * spread * 0.5,
        -35,
        Math.sin(angle) * spread * 0.5
    );

    // Scale based on complexity
    const scale = 0.5 + (ruin.complexity / 5) * 0.5;
    group.scale.setScalar(scale);

    return group;
}

/**
 * Animate ruins (subtle floating/pulsing).
 * @param {number} delta - Time delta in seconds.
 * @param {number} time - Total elapsed time.
 */
export function animateRuins(delta, time) {
    if (!ruinGroup) return;

    ruinGroup.children.forEach((child, i) => {
        // Gentle float
        child.position.y = -35 + Math.sin(time * 0.5 + i) * 0.5;
        // Slow rotation
        child.rotation.y += delta * 0.05;
    });
}

/**
 * Remove all ruins from the scene.
 */
export function removeRuins(scene) {
    if (ruinGroup) {
        ruinGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(ruinGroup);
        ruinGroup = null;
    }
}
