/**
 * js/terrain_worker.js
 * Off-thread procedural noise and mesh generation.
 * Uses a deterministic hash based on (seed + coords).
 */

// Simple pseudo-random hash
function hash(x, y, seed) {
    const h = Math.imul(x, 1540483477) ^ Math.imul(y, 2048144781) ^ Math.imul(seed, 3574254919);
    return (h >>> 0) / 4294967296;
}

// Perlin-like 2D value noise
function noise(x, z, seed) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;

    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);

    const a = hash(x0, z0, seed);
    const b = hash(x0 + 1, z0, seed);
    const c = hash(x0, z0 + 1, seed);
    const d = hash(x0 + 1, z0 + 1, seed);

    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function getFractalNoise(x, z, seed, octaves = 4) {
    let total = 0;
    let frequency = 0.02;
    let amplitude = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += noise(x * frequency, z * frequency, seed + i) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return total / maxValue;
}

self.onmessage = (e) => {
    const { type, x, z, size, resolution, seed, biome, taskId } = e.data;

    if (type === 'GENERATE_CHUNK') {
        const vertices = [];
        const indices = [];
        const normals = [];
        const props = { 'tree': [], 'rock': [], 'cactus': [], 'crystal': [] };

        const step = size / (resolution - 1);
        const worldX = x * size;
        const worldZ = z * size;

        // 1. Generate Vertices
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const lx = j * step;
                const lz = i * step;
                const gx = worldX + lx;
                const gz = worldZ + lz;

                // Height calculation based on biome
                let height = getFractalNoise(gx, gz, seed) * 40;
                
                if (biome === 'Volcanic') height *= 1.5;
                if (biome === 'Ice') height = Math.pow(height / 40, 1.2) * 40;
                if (biome === 'Desert') height = Math.sin(gx * 0.01) * Math.cos(gz * 0.01) * 10 + height * 0.2;

                vertices.push(lx, height, lz);
                
                // Prop Generation (deterministic chance)
                if (i > 0 && i < resolution - 1 && j > 0 && j < resolution - 1) {
                    const pHash = hash(gx, gz, seed + 99);
                    if (pHash > 0.985) {
                        const type = biome === 'Desert' ? 'cactus' : biome === 'Alien' ? 'crystal' : pHash > 0.992 ? 'tree' : 'rock';
                        props[type].push({
                            x: lx, y: height, z: lz,
                            rot: pHash * Math.PI * 2,
                            scale: 0.5 + pHash * 1.5
                        });
                    }
                }
            }
        }

        // 2. Generate Indices
        for (let i = 0; i < resolution - 1; i++) {
            for (let j = 0; j < resolution - 1; j++) {
                const a = i * resolution + j;
                const b = i * resolution + (j + 1);
                const c = (i + 1) * resolution + j;
                const d = (i + 1) * resolution + (j + 1);

                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        // 3. Simple Normals (flat-shading style)
        // For performance, we skip exact smooth normals in the worker
        // and let Three.js handle flat shading or compute them simply.
        for (let i = 0; i < vertices.length / 3; i++) {
            normals.push(0, 1, 0);
        }

        self.postMessage({
            type: 'CHUNK_DATA',
            x, z,
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            props,
            taskId
        });
    }
};
