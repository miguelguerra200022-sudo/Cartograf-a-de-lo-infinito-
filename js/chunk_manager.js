// Chunk Manager v2 — Procedural planet surface with infinite level of detail.
// Orchestrates multi-threaded generation, material LOD, and biome distribution.

import * as THREE from 'three';
import { BIOME_YIELDS } from './ship.js';

// Configuration
const CHUNK_SIZE = 128;
const CHUNK_RESOLUTION = 32; // Vertices per chunk edge
const VISIBLE_RADIUS = 3;    // Radius of chunks to keep loaded
const MAX_CHUNKS = 49;       // (2 * VISIBLE_RADIUS + 1)^2

// State
let scene = null;
let chunks = new Map(); // Key: "x,z", Value: chunk data
let terrainGroup = new THREE.Group();
let terrainWorker = null;
let currentPlanetData = null;
let activeTasks = new Set();
let chunkPool = []; // For recycling geometry

// Materials by biome
const BIOME_MATERIALS = {
    'Temperate': {
        color: 0x3d5a35,
        emissive: 0x051005,
        roughness: 0.9,
        props: ['tree', 'rock']
    },
    'Desert': {
        color: 0xc2a37d,
        emissive: 0x100800,
        roughness: 1.0,
        props: ['cactus', 'rock']
    },
    'Ice': {
        color: 0xdaeef2,
        emissive: 0x001020,
        roughness: 0.3,
        props: ['ice_spike', 'rock']
    },
    'Volcanic': {
        color: 0x221111,
        emissive: 0x330000,
        roughness: 0.8,
        props: ['lava_vent', 'obsidian']
    },
    'Alien': {
        color: 0x442266,
        emissive: 0x220044,
        roughness: 0.7,
        props: ['tentacle', 'crystal']
    }
};

/**
 * Initialize the chunk manager for a specific planet.
 */
export function initChunkManager(sceneRef, planetData) {
    scene = sceneRef;
    currentPlanetData = planetData;
    
    // Setup group
    if (terrainGroup.parent) scene.remove(terrainGroup);
    terrainGroup = new THREE.Group();
    terrainGroup.userData.dynamic = true; // Mark for easy cleanup
    scene.add(terrainGroup);
    
    // Clear state
    chunks.forEach(c => disposeChunk(c));
    chunks.clear();
    activeTasks.clear();
    
    // Setup worker
    if (terrainWorker) terrainWorker.terminate();
    terrainWorker = new Worker(new URL('./terrain_worker.js', import.meta.url), { type: 'module' });
    
    terrainWorker.onmessage = (e) => {
        const { type, x, z, vertices, indices, normals, props, taskId } = e.data;
        if (type === 'CHUNK_DATA') {
            createChunkMesh(x, z, vertices, indices, normals, props);
            activeTasks.delete(taskId);
        }
    };
}

/**
 * Update loaded chunks based on camera position.
 */
export function updateChunks(camera) {
    if (!currentPlanetData || !terrainWorker) return;
    
    const camX = Math.floor(camera.position.x / CHUNK_SIZE);
    const camZ = Math.floor(camera.position.z / CHUNK_SIZE);
    
    const neededChunks = new Set();
    
    // Identify needed chunks
    for (let x = -VISIBLE_RADIUS; x <= VISIBLE_RADIUS; x++) {
        for (let z = -VISIBLE_RADIUS; z <= VISIBLE_RADIUS; z++) {
            const cx = camX + x;
            const cz = camZ + z;
            const key = `${cx},${cz}`;
            neededChunks.add(key);
            
            if (!chunks.has(key) && !activeTasks.has(key)) {
                requestChunk(cx, cz);
            }
        }
    }
    
    // Unload distant chunks
    for (const [key, chunk] of chunks.entries()) {
        if (!neededChunks.has(key)) {
            disposeChunk(chunk);
            chunks.delete(key);
        }
    }
}

/**
 * Request a new chunk from the worker.
 */
function requestChunk(x, z) {
    const key = `${x},${z}`;
    activeTasks.add(key);
    
    terrainWorker.postMessage({
        type: 'GENERATE_CHUNK',
        x, z,
        size: CHUNK_SIZE,
        resolution: CHUNK_RESOLUTION,
        seed: currentPlanetData.seed,
        biome: currentPlanetData.biome,
        taskId: key
    });
}

/**
 * Create the actual Three.js mesh for a chunk.
 */
function createChunkMesh(cx, cz, vertices, indices, normals, props) {
    const biome = currentPlanetData.biome || 'Temperate';
    const config = BIOME_MATERIALS[biome] || BIOME_MATERIALS.Temperate;
    
    let geometry;
    if (chunkPool.length > 0) {
        geometry = chunkPool.pop();
    } else {
        geometry = new THREE.BufferGeometry();
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    const material = new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.emissive,
        roughness: config.roughness,
        flatShading: true
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.receiveShadow = true;
    
    // Add to a sub-group for this chunk
    const chunkGroup = new THREE.Group();
    chunkGroup.add(mesh);
    
    // Process Props (trees, rocks, etc.)
    const instancedMeshes = createProps(props, biome);
    instancedMeshes.forEach(im => chunkGroup.add(im));
    
    terrainGroup.add(chunkGroup);
    
    chunks.set(`${cx},${cz}`, {
        mesh,
        group: chunkGroup,
        geometry,
        material,
        instancedMeshes,
        x: cx,
        z: cz
    });
}

/**
 * Create instanced meshes for props in the chunk.
 */
function createProps(propData, biome) {
    const meshes = [];
    if (!propData || Object.keys(propData).length === 0) return meshes;
    
    for (const [type, instances] of Object.entries(propData)) {
        if (instances.length === 0) continue;
        
        let geometry, material;
        
        // Define simple procedural prop geometries
        if (type === 'tree') {
            geometry = new THREE.ConeGeometry(2, 8, 4);
            material = new THREE.MeshStandardMaterial({ color: 0x2d4c1e });
        } else if (type === 'cactus') {
            geometry = new THREE.CylinderGeometry(0.8, 0.8, 5, 5);
            material = new THREE.MeshStandardMaterial({ color: 0x446622 });
        } else if (type === 'rock') {
            geometry = new THREE.DodecahedronGeometry(2);
            material = new THREE.MeshStandardMaterial({ color: 0x666677 });
        } else if (type === 'crystal') {
            geometry = new THREE.OctahedronGeometry(1.5);
            material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x008888 });
        } else {
            // Fallback
            geometry = new THREE.BoxGeometry(1, 1, 1);
            material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        }
        
        const im = new THREE.InstancedMesh(geometry, material, instances.length);
        const matrix = new THREE.Matrix4();
        
        instances.forEach((inst, i) => {
            matrix.compose(
                new THREE.Vector3(inst.x, inst.y, inst.z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inst.rot, 0)),
                new THREE.Vector3(inst.scale, inst.scale, inst.scale)
            );
            im.setMatrixAt(i, matrix);
        });
        
        im.instanceMatrix.needsUpdate = true;
        meshes.push(im);
    }
    
    return meshes;
}

/**
 * Cleanup memory for a chunk.
 */
function disposeChunk(chunk) {
    terrainGroup.remove(chunk.group);
    
    // Cleanup materials
    chunk.material.dispose();
    chunk.instancedMeshes.forEach(im => {
        im.material.dispose();
        // Don't dispose shared prop geometries here if we want to reuse them
    });
    
    // Reset and pool terrain geometry
    chunk.geometry.dispose(); // For now just dispose, pool is simple
}

/**
 * Get the exact terrain height at a world (x, z) coordinate.
 * Used for physics and camera clamping.
 */
export function getTerrainHeightAt(x, z) {
    // This is a synchronous fallback since workers are async.
    // In a real implementation, we might keep a low-res heightmap cache.
    // For now, let's just return a placeholder or check current chunks.
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = chunks.get(`${cx},${cz}`);
    
    if (chunk) {
        // Raycast down from space to find ground
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(x, 500, z),
            new THREE.Vector3(0, -1, 0)
        );
        const intersects = raycaster.intersectObject(chunk.mesh);
        if (intersects.length > 0) return intersects[0].point.y;
    }
    
    return 0; // Fallback to sea level
}

export function getTerrainGroup() { return terrainGroup; }
export function getChunkConstants() { return { CHUNK_SIZE, CHUNK_RESOLUTION }; }
