// Terrain renderer v2 — Cinematic heightmap with vertex displacement,
// enhanced biome coloring, water with animated reflections, and fog edges.

import * as THREE from 'three';

let terrainMesh = null;
let terrainGroup = null;
let waterMesh = null;

const BIOME_PALETTES = {
    Barren:       { low: 0x2a2622, mid: 0x5c564f, high: 0x8a8278, peak: 0xb0a99e, water: null },
    Volcanic:     { low: 0x1a0800, mid: 0x6b1500, high: 0xcc3300, peak: 0xff6600, water: 0xff2200 },
    Frozen:       { low: 0x0a1a2a, mid: 0x4a7a9a, high: 0x9ad4f0, peak: 0xe8f4ff, water: 0x2a5a8a },
    Oceanic:      { low: 0x001020, mid: 0x002244, high: 0x004488, peak: 0x1177bb, water: 0x003366 },
    Ocean:        { low: 0x001020, mid: 0x002244, high: 0x004488, peak: 0x1177bb, water: 0x003366 },
    Temperate:    { low: 0x0a2a12, mid: 0x1a5a2a, high: 0x4a9a4a, peak: 0xccddcc, water: 0x0a4a6a },
    Jungle:       { low: 0x062006, mid: 0x0d3d0d, high: 0x1a6a1a, peak: 0x3a9a3a, water: 0x0a3a2a },
    Desert:       { low: 0x4a2a0a, mid: 0x8a6a2a, high: 0xccaa5a, peak: 0xeedd99, water: null },
    Toxic:        { low: 0x101a06, mid: 0x2a4a0a, high: 0x5a8a0a, peak: 0x99dd00, water: 0x2a3a0a },
    Crystalline:  { low: 0x100830, mid: 0x3a1a6a, high: 0x7a4aaa, peak: 0xbb88ee, water: 0x2a1a4a },
    Biomechanical:{ low: 0x0a0a1a, mid: 0x2a2a4a, high: 0x4a6a7a, peak: 0x7a9aaa, water: 0x1a2a3a },
    Lush:         { low: 0x082a08, mid: 0x1a6a1a, high: 0x55aa44, peak: 0xaaddaa, water: 0x0a5a5a },
    Gas:          { low: 0x3a2a0a, mid: 0x6a4a1a, high: 0xaa7a3a, peak: 0xddaa66, water: null },
};

/**
 * Create a cinematic terrain mesh from heightmap data.
 */
export function createTerrain(scene, heightmap, biome = 'Temperate', gridSize = 32) {
    removeTerrain(scene);

    terrainGroup = new THREE.Group();
    terrainGroup.userData.dynamic = true;

    const size = 160;
    const heightScale = 35;
    const segments = gridSize - 1;

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.Temperate;

    const lowColor = new THREE.Color(palette.low);
    const midColor = new THREE.Color(palette.mid);
    const highColor = new THREE.Color(palette.high);
    const peakColor = new THREE.Color(palette.peak);
    const tempColor = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
        const h = heightmap[i] !== undefined ? heightmap[i] : 0.5;
        positions.setY(i, h * heightScale);

        // Multi-stop gradient for richer terrain
        if (h < 0.2) {
            tempColor.lerpColors(lowColor, midColor, h / 0.2);
        } else if (h < 0.5) {
            tempColor.lerpColors(midColor, highColor, (h - 0.2) / 0.3);
        } else if (h < 0.8) {
            tempColor.lerpColors(highColor, peakColor, (h - 0.5) / 0.3);
        } else {
            tempColor.copy(peakColor);
            // Snow/peak highlights
            tempColor.lerp(new THREE.Color(0xffffff), (h - 0.8) * 1.5);
        }

        // Subtle noise variation
        const noiseVal = Math.sin(i * 0.7) * 0.03;
        colors[i * 3] = Math.min(1, tempColor.r + noiseVal);
        colors[i * 3 + 1] = Math.min(1, tempColor.g + noiseVal);
        colors[i * 3 + 2] = Math.min(1, tempColor.b + noiseVal);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.08,
        flatShading: false,
        side: THREE.DoubleSide,
        envMapIntensity: 0.5,
    });

    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.position.set(0, -45, 0);
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.dynamic = true;
    terrainGroup.add(terrainMesh);

    // Water plane with animation-ready material
    if (palette.water) {
        const waterLevel = 0.28 * heightScale;
        const waterGeo = new THREE.PlaneGeometry(size * 1.4, size * 1.4, 32, 32);
        waterGeo.rotateX(-Math.PI / 2);

        const waterMat = new THREE.MeshStandardMaterial({
            color: palette.water,
            transparent: true,
            opacity: 0.65,
            roughness: 0.05,
            metalness: 0.6,
            side: THREE.DoubleSide,
        });

        waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(0, -45 + waterLevel, 0);
        waterMesh.userData.dynamic = true;
        terrainGroup.add(waterMesh);

        // Foam edge (ring of particles at water level)
        const foamCount = 500;
        const foamPositions = new Float32Array(foamCount * 3);
        for (let i = 0; i < foamCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = size * 0.3 + Math.random() * size * 0.3;
            foamPositions[i * 3] = Math.cos(angle) * dist;
            foamPositions[i * 3 + 1] = -45 + waterLevel + 0.2;
            foamPositions[i * 3 + 2] = Math.sin(angle) * dist;
        }
        const foamGeo = new THREE.BufferGeometry();
        foamGeo.setAttribute('position', new THREE.BufferAttribute(foamPositions, 3));
        const foamMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.8,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const foam = new THREE.Points(foamGeo, foamMat);
        foam.userData.dynamic = true;
        terrainGroup.add(foam);
    }

    // Atmospheric haze at terrain edges
    const hazeGeo = new THREE.PlaneGeometry(size * 2, 40);
    const hazeMat = new THREE.MeshBasicMaterial({
        color: palette.low,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    for (let side = 0; side < 4; side++) {
        const haze = new THREE.Mesh(hazeGeo, hazeMat);
        const angle = (side / 4) * Math.PI * 2;
        haze.position.set(
            Math.cos(angle) * size * 0.6,
            -30,
            Math.sin(angle) * size * 0.6
        );
        haze.rotation.y = angle + Math.PI / 2;
        haze.userData.dynamic = true;
        terrainGroup.add(haze);
    }

    // Scan grid overlay (very subtle)
    const wireGeo = geometry.clone();
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x667eea,
        wireframe: true,
        transparent: true,
        opacity: 0.02,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.position.copy(terrainMesh.position);
    wireMesh.userData.dynamic = true;
    terrainGroup.add(wireMesh);

    scene.add(terrainGroup);
    return terrainMesh;
}

/**
 * Remove terrain from the scene.
 */
export function removeTerrain(scene) {
    if (terrainGroup) {
        terrainGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(terrainGroup);
        terrainGroup = null;
        terrainMesh = null;
        waterMesh = null;
    }
}
