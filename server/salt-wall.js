// The Salt Wall — Server-side rarity and loot determination.
// Uses the same master seed as the Rust WASM engine to derive
// sector properties that the client CANNOT see.
//
// SECURITY: This logic NEVER ships to the client.

const crypto = require('crypto');

const MASTER_SEED = 'MIGUEL_2026';

// Rarity thresholds derived from sector hash
const RARITY_THRESHOLDS = {
    mythic:    0.001,  // 0.1% — Once in a universe
    legendary: 0.01,   // 1%   — Ultra-rare
    epic:      0.05,   // 5%   — Very rare
    rare:      0.15,   // 15%  — Uncommon but notable
    uncommon:  0.35,   // 35%  — Slightly special
    // Everything else = common (65%)
};

const LOOT_TYPES = ['mineral', 'artifact', 'blueprint', 'currency', 'key'];
const LOOT_NAMES = {
    mineral:   ['Cristal de Neutrones', 'Iridio Estelar', 'Plasma Solidificado', 'Fragmento de Quásar'],
    artifact:  ['Clave Precursora', 'Núcleo Dimensional', 'Orbe de Antigravedad', 'Lente Temporal'],
    blueprint: ['Diseño de Hipermotriz', 'Esquema Cuántico', 'Mapa de Anomalía', 'Código Ancestral'],
    currency:  ['Cache de Quarks', 'Bóveda Energética', 'Reserva de Antimateria'],
    key:       ['Llave de Sector Sellado', 'Clave Maestra Precursora', 'Fragmento de Coordenada Oculta'],
};

/**
 * Derive the hidden rarity and loot for a sector.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ rarity: string, lootType: string, lootName: string, lootValue: number }}
 */
function deriveSectorLoot(x, y, z) {
    // Create a deterministic hash using the same seed derivation as Rust
    const hash = crypto.createHash('sha256');
    hash.update(MASTER_SEED);
    hash.update(`+LOOT+X:${x}+Y:${y}+Z:${z}`);
    const digest = hash.digest();

    // Use first 8 bytes as a random float [0, 1)
    const rarityRoll = digest.readUInt32BE(0) / 0xFFFFFFFF;
    const lootRoll = digest.readUInt32BE(4) / 0xFFFFFFFF;
    const valueRoll = digest.readUInt32BE(8) / 0xFFFFFFFF;
    const nameRoll = digest.readUInt32BE(12) / 0xFFFFFFFF;

    // Determine rarity
    let rarity = 'common';
    for (const [level, threshold] of Object.entries(RARITY_THRESHOLDS)) {
        if (rarityRoll < threshold) {
            rarity = level;
            break;
        }
    }

    // Only sectors with rarity > common have loot
    if (rarity === 'common') {
        return { rarity, lootType: null, lootName: null, lootValue: 0 };
    }

    // Determine loot type and name
    const lootType = LOOT_TYPES[Math.floor(lootRoll * LOOT_TYPES.length)];
    const names = LOOT_NAMES[lootType];
    const lootName = names[Math.floor(nameRoll * names.length)];

    // Value scales with rarity
    const baseValues = { uncommon: 50, rare: 200, epic: 1000, legendary: 5000, mythic: 25000 };
    const lootValue = Math.floor((baseValues[rarity] || 50) * (0.8 + valueRoll * 0.4));

    return { rarity, lootType, lootName, lootValue };
}

/**
 * Pre-generate anomalies for a batch of sectors (cronjob style).
 * @param {object} db - SQLite database instance.
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} radius - Sectors in each direction.
 */
function preGenerateAnomalies(db, centerX, centerY, centerZ, radius) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO sector_anomalies (x, y, z, rarity_class, loot_type, loot_value, loot_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const insertMany = db.transaction(() => {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const x = centerX + dx;
                    const y = centerY + dy;
                    const z = centerZ + dz;
                    const loot = deriveSectorLoot(x, y, z);
                    if (loot.rarity !== 'common') {
                        stmt.run(x, y, z, loot.rarity, loot.lootType, loot.lootValue,
                            JSON.stringify({ name: loot.lootName }));
                        count++;
                    }
                }
            }
        }
    });

    insertMany();
    return count;
}

module.exports = { deriveSectorLoot, preGenerateAnomalies };
