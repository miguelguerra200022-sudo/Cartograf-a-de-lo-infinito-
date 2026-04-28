// Ship system — Stats, damage, upgrades, cargo.
// The ship is the player's avatar and investment anchor.

import { showNotification } from './ui.js';

const SHIP_MODULES = {
    hull:    { name: 'Casco',           icon: '🛡️', max: 5, baseStat: 100, perLevel: 50,  costs: [0, 150, 400, 1000, 3000] },
    scanner: { name: 'Scanner',         icon: '📡', max: 5, baseStat: 1,   perLevel: 1,   costs: [0, 200, 600, 1500, 5000] },
    engine:  { name: 'Motor Warp',      icon: '⚡', max: 5, baseStat: 1,   perLevel: 0.15, costs: [0, 250, 700, 2000, 6000] },
    cargo:   { name: 'Bahía de Carga',  icon: '📦', max: 5, baseStat: 10,  perLevel: 10,  costs: [0, 100, 300, 800, 2500] },
    armor:   { name: 'Blindaje',        icon: '🔰', max: 5, baseStat: 0,   perLevel: 5,   costs: [0, 300, 800, 2000, 7000] },
};

// Materials for crafting/upgrades
export const MATERIALS = {
    iron:       { name: 'Hierro Estelar',      icon: '🪨', rarity: 'common' },
    crystal:    { name: 'Cristal de Quásar',    icon: '💎', rarity: 'uncommon' },
    plasma:     { name: 'Plasma Ionizado',      icon: '🔥', rarity: 'uncommon' },
    neutronium: { name: 'Neutronio',            icon: '⚛️', rarity: 'rare' },
    darkMatter: { name: 'Materia Oscura',       icon: '🌑', rarity: 'epic' },
    voidShard:  { name: 'Fragmento del Vacío',  icon: '🔮', rarity: 'legendary' },
};

// Biome → material yield mapping
export const BIOME_YIELDS = {
    Desert:        { primary: 'iron',       secondary: 'crystal',    chance: 0.8 },
    Ocean:         { primary: 'plasma',     secondary: 'iron',       chance: 0.7 },
    Temperate:     { primary: 'iron',       secondary: 'plasma',     chance: 0.9 },
    Frozen:        { primary: 'crystal',    secondary: 'neutronium', chance: 0.6 },
    Volcanic:      { primary: 'plasma',     secondary: 'neutronium', chance: 0.7 },
    Gas:           { primary: 'plasma',     secondary: 'darkMatter', chance: 0.5 },
    Crystalline:   { primary: 'crystal',    secondary: 'voidShard',  chance: 0.4 },
    Biomechanical: { primary: 'neutronium', secondary: 'darkMatter', chance: 0.5 },
    Toxic:         { primary: 'iron',       secondary: 'plasma',     chance: 0.7 },
    Lush:          { primary: 'crystal',    secondary: 'iron',       chance: 0.85 },
};

let shipState = {
    levels: { hull: 1, scanner: 1, engine: 1, cargo: 1, armor: 0 },
    currentHull: 100,
    materials: { iron: 5, crystal: 2, plasma: 1, neutronium: 0, darkMatter: 0, voidShard: 0 },
    cargoItems: [],
    totalMined: 0,
    repairCost: 10, // quarks per 10 hull
};

/**
 * Initialize ship. Load from localStorage if available.
 */
export function initShip() {
    loadShipState();
}

/**
 * Get current ship stats computed from levels.
 */
export function getShipStats() {
    const s = shipState;
    const stats = {};
    for (const [key, mod] of Object.entries(SHIP_MODULES)) {
        const level = s.levels[key] || 0;
        stats[key] = {
            ...mod,
            level,
            value: mod.baseStat + level * mod.perLevel,
            nextCost: level < mod.max ? mod.costs[level] : null,
            isMaxed: level >= mod.max,
        };
    }
    stats.currentHull = s.currentHull;
    stats.maxHull = SHIP_MODULES.hull.baseStat + s.levels.hull * SHIP_MODULES.hull.perLevel;
    stats.hullPercent = Math.round((s.currentHull / stats.maxHull) * 100);
    stats.cargoUsed = s.cargoItems.length;
    stats.cargoMax = SHIP_MODULES.cargo.baseStat + s.levels.cargo * SHIP_MODULES.cargo.perLevel;
    stats.armorValue = s.levels.armor * SHIP_MODULES.armor.perLevel;
    stats.scannerLevel = s.levels.scanner;
    stats.fuelEfficiency = 1 - (s.levels.engine * SHIP_MODULES.engine.perLevel * 0.5); // reduces fuel cost chance
    return stats;
}

/**
 * Get materials inventory.
 */
export function getMaterials() {
    return Object.entries(MATERIALS).map(([id, mat]) => ({
        id,
        ...mat,
        count: shipState.materials[id] || 0,
    }));
}

/**
 * Take hull damage. Returns true if ship is still alive.
 * @param {number} amount - Raw damage before armor.
 */
export function takeDamage(amount) {
    const armor = shipState.levels.armor * SHIP_MODULES.armor.perLevel;
    const mitigated = Math.max(1, amount - armor);
    shipState.currentHull = Math.max(0, shipState.currentHull - mitigated);
    saveShipState();

    if (shipState.currentHull <= 0) {
        // Drop some cargo on "death"
        const lost = Math.floor(shipState.cargoItems.length * 0.3);
        if (lost > 0) {
            shipState.cargoItems.splice(0, lost);
            showNotification('💀 ¡Casco Destruido!', `Perdiste ${lost} items de carga. Reparando...`, 'mythic');
        }
        shipState.currentHull = 20; // Emergency repair
        saveShipState();
        return false;
    }
    return true;
}

/**
 * Repair hull using quarks.
 * @param {number} quarks - Available quarks.
 * @returns {{ quarks: number, repaired: number }}
 */
export function repairHull(quarks) {
    const stats = getShipStats();
    const missing = stats.maxHull - shipState.currentHull;
    if (missing <= 0) return { quarks, repaired: 0 };

    const repairBlocks = Math.ceil(missing / 10);
    const totalCost = repairBlocks * shipState.repairCost;

    if (quarks < shipState.repairCost) {
        showNotification('❌ Sin Quarks', 'Necesitas Quarks para reparar.', '');
        return { quarks, repaired: 0 };
    }

    const affordable = Math.min(repairBlocks, Math.floor(quarks / shipState.repairCost));
    const repaired = affordable * 10;
    const cost = affordable * shipState.repairCost;

    quarks -= cost;
    shipState.currentHull = Math.min(stats.maxHull, shipState.currentHull + repaired);
    saveShipState();

    showNotification('🔧 Reparado', `+${repaired} Hull (-${cost}⚡)`, '');
    return { quarks, repaired };
}

/**
 * Upgrade a ship module.
 * @param {string} moduleId
 * @param {number} quarks
 * @returns {{ quarks: number, success: boolean }}
 */
export function upgradeModule(moduleId, quarks) {
    const mod = SHIP_MODULES[moduleId];
    if (!mod) return { quarks, success: false };

    const currentLevel = shipState.levels[moduleId] || 0;
    if (currentLevel >= mod.max) {
        showNotification('⚠ Máximo', `${mod.name} ya está al máximo.`, '');
        return { quarks, success: false };
    }

    const cost = mod.costs[currentLevel];
    if (quarks < cost) {
        showNotification('❌ Sin Quarks', `Necesitas ${cost}⚡.`, '');
        return { quarks, success: false };
    }

    quarks -= cost;
    shipState.levels[moduleId] = currentLevel + 1;

    // If upgrading hull, increase current hull too
    if (moduleId === 'hull') {
        shipState.currentHull += SHIP_MODULES.hull.perLevel;
    }

    saveShipState();
    showNotification('⬆️ ¡Mejora!', `${mod.name} Nivel ${currentLevel + 1}`, 'rare');
    return { quarks, success: true };
}

/**
 * Mine a planet. Returns materials gained.
 * @param {object} planet - Planet data from WASM.
 * @returns {{ materials: object, success: boolean }}
 */
export function minePlanet(planet) {
    const biome = planet.biome;
    const yields = BIOME_YIELDS[biome];
    if (!yields) return { materials: {}, success: false };

    const stats = getShipStats();
    if (stats.cargoUsed >= stats.cargoMax) {
        showNotification('📦 Carga Llena', 'Mejora tu Bahía de Carga.', '');
        return { materials: {}, success: false };
    }

    const gained = {};
    const scannerBonus = stats.scannerLevel * 0.1;

    // Primary material (guaranteed)
    const primaryAmount = 1 + Math.floor(Math.random() * stats.scannerLevel);
    gained[yields.primary] = primaryAmount;
    shipState.materials[yields.primary] = (shipState.materials[yields.primary] || 0) + primaryAmount;

    // Secondary material (chance-based)
    if (Math.random() < yields.chance * (1 + scannerBonus)) {
        const secAmount = 1 + Math.floor(Math.random() * Math.max(1, stats.scannerLevel - 1));
        gained[yields.secondary] = secAmount;
        shipState.materials[yields.secondary] = (shipState.materials[yields.secondary] || 0) + secAmount;
    }

    shipState.totalMined++;
    shipState.cargoItems.push({ biome, time: Date.now() });
    saveShipState();

    return { materials: gained, success: true };
}

/**
 * Check if scanner reveals sector rarity preview.
 */
export function canPreviewRarity() {
    return shipState.levels.scanner >= 3;
}

/**
 * Check fuel efficiency (chance to not consume fuel).
 */
export function checkFuelSave() {
    const efficiency = shipState.levels.engine * 0.12;
    return Math.random() < efficiency;
}

// ─── Persistence ───

function saveShipState() {
    try {
        localStorage.setItem('cartografia_ship', JSON.stringify(shipState));
    } catch (e) { /* silent */ }
}

function loadShipState() {
    try {
        const raw = localStorage.getItem('cartografia_ship');
        if (raw) {
            const data = JSON.parse(raw);
            shipState = { ...shipState, ...data };
        }
    } catch (e) { /* fresh start */ }
}
