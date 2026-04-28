// Collection & Progression — Bestiary, Explorer XP, Titles, and Achievement tracking.
// The "completionist hook" — drives players to catalog everything and level up.

import { showNotification } from './ui.js';

// ═══════════════════════════════════════════
// 1. BESTIARY — Planet/Star Collection "Pokedex"
// ═══════════════════════════════════════════

const BIOME_CATALOG = {
    Barren:        { icon: '🪨', name: 'Yermo',           desc: 'Superficie desolada sin atmósfera',        xp: 5 },
    Volcanic:      { icon: '🌋', name: 'Volcánico',       desc: 'Lava activa y erupciones constantes',       xp: 8 },
    Frozen:        { icon: '🧊', name: 'Glacial',         desc: 'Capas de hielo milenario',                  xp: 8 },
    Oceanic:       { icon: '🌊', name: 'Oceánico',        desc: 'Planeta cubierto enteramente de agua',      xp: 10 },
    Ocean:         { icon: '🌊', name: 'Oceánico',        desc: 'Planeta cubierto enteramente de agua',      xp: 10 },
    Temperate:     { icon: '🌍', name: 'Templado',        desc: 'Condiciones ideales para la vida',          xp: 6 },
    Jungle:        { icon: '🌴', name: 'Selvático',       desc: 'Vegetación densa y agresiva',               xp: 12 },
    Desert:        { icon: '🏜️', name: 'Desértico',       desc: 'Dunas infinitas y calor extremo',           xp: 7 },
    Toxic:         { icon: '☣️', name: 'Tóxico',          desc: 'Atmósfera corrosiva y letal',               xp: 15 },
    Crystalline:   { icon: '💎', name: 'Cristalino',      desc: 'Formaciones de cristal puro',               xp: 20 },
    Biomechanical: { icon: '🦾', name: 'Biomecánico',     desc: 'Fusión de orgánico y maquinaria',           xp: 25 },
    Lush:          { icon: '🌿', name: 'Exuberante',      desc: 'Vida floreciente en cada rincón',           xp: 10 },
    Gas:           { icon: '🪐', name: 'Gigante Gaseoso', desc: 'Masiva esfera de gases comprimidos',        xp: 15 },
};

const STAR_CATALOG = {
    RedDwarf:    { icon: '🔴', name: 'Enana Roja',     desc: 'Estrella fría y longeva',             xp: 5 },
    YellowMain:  { icon: '🟡', name: 'Secuencia Principal', desc: 'Similar a nuestro Sol',          xp: 3 },
    BlueGiant:   { icon: '🔵', name: 'Gigante Azul',   desc: 'Masiva y extraordinariamente caliente', xp: 20 },
    WhiteDwarf:  { icon: '⚪', name: 'Enana Blanca',   desc: 'Remanente estelar ultra-denso',        xp: 15 },
    Neutron:     { icon: '⭐', name: 'Estrella de Neutrones', desc: 'Pulsar con rotación ultrarrápida', xp: 30 },
    BlackHole:   { icon: '🕳️', name: 'Agujero Negro', desc: 'Singularidad gravitacional absoluta',    xp: 50 },
};

// Special discovery milestones
const DISCOVERY_MILESTONES = [
    { id: 'first_scan',        name: 'Primer Contacto',           icon: '🔭', req: { scans: 1 },      xp: 10,  quarks: 50 },
    { id: 'scan_10',           name: 'Cartógrafo Novato',         icon: '🗺️', req: { scans: 10 },     xp: 25,  quarks: 100 },
    { id: 'scan_50',           name: 'Explorador Veterano',       icon: '🧭', req: { scans: 50 },     xp: 100, quarks: 300 },
    { id: 'scan_100',          name: 'Maestro del Sector',        icon: '🌌', req: { scans: 100 },    xp: 250, quarks: 500 },
    { id: 'scan_500',          name: 'Leyenda Galáctica',         icon: '👑', req: { scans: 500 },    xp: 1000, quarks: 2000 },
    { id: 'all_biomes',        name: 'Completista de Biomas',     icon: '🏆', req: { allBiomes: true }, xp: 500, quarks: 1000 },
    { id: 'all_stars',         name: 'Maestro Estelar',           icon: '⭐', req: { allStars: true }, xp: 300, quarks: 800 },
    { id: 'first_blackhole',   name: 'Más Allá del Horizonte',    icon: '🕳️', req: { star: 'BlackHole' }, xp: 100, quarks: 500 },
    { id: 'first_neutron',     name: 'Pulsar Hunter',             icon: '💫', req: { star: 'Neutron' }, xp: 60, quarks: 200 },
    { id: 'first_crystalline', name: 'El Planeta de Cristal',     icon: '💎', req: { biome: 'Crystalline' }, xp: 50, quarks: 150 },
    { id: 'first_biomech',     name: 'Contacto Biomecánico',      icon: '🦾', req: { biome: 'Biomechanical' }, xp: 80, quarks: 300 },
    { id: 'mine_20',           name: 'Minero Espacial',           icon: '⛏️', req: { mining: 20 },   xp: 50, quarks: 200 },
    { id: 'mine_100',          name: 'Barón del Mineral',         icon: '💰', req: { mining: 100 },  xp: 200, quarks: 500 },
    { id: 'craft_5',           name: 'Ingeniero Novato',          icon: '🔧', req: { crafts: 5 },    xp: 40, quarks: 100 },
    { id: 'craft_20',          name: 'Maestro Artesano',          icon: '🔨', req: { crafts: 20 },   xp: 150, quarks: 400 },
    { id: 'gacha_10',          name: 'Jugador de Fortuna',        icon: '🎰', req: { gachaPulls: 10 }, xp: 30, quarks: 100 },
    { id: 'gacha_100',         name: 'Adicto al Banner',          icon: '🎲', req: { gachaPulls: 100 }, xp: 200, quarks: 500 },
    { id: 'prestige_1',        name: 'Renacimiento',              icon: '✨', req: { ascensions: 1 }, xp: 500, quarks: 0 },
    { id: 'prestige_5',        name: 'Ascendido Supremo',         icon: '🌟', req: { ascensions: 5 }, xp: 2000, quarks: 0 },
    { id: 'expedition_10',     name: 'Director de Sondas',        icon: '🛰️', req: { expeditions: 10 }, xp: 80, quarks: 200 },
    { id: 'daily_7',           name: 'Devoto Semanal',            icon: '📅', req: { dailyStreak: 7 }, xp: 100, quarks: 300 },
];

// ═══════════════════════════════════════════
// 2. EXPLORER XP & LEVEL SYSTEM
// ═══════════════════════════════════════════

const EXPLORER_TITLES = [
    { level: 1,  title: 'Cadete',            icon: '🔰' },
    { level: 3,  title: 'Piloto',            icon: '🎖️' },
    { level: 5,  title: 'Navegante',         icon: '🧭' },
    { level: 8,  title: 'Explorador',        icon: '🔭' },
    { level: 12, title: 'Cartógrafo',        icon: '🗺️' },
    { level: 16, title: 'Científico Estelar', icon: '🔬' },
    { level: 20, title: 'Capitán',           icon: '⚓' },
    { level: 25, title: 'Almirante',         icon: '🎯' },
    { level: 30, title: 'Comandante',        icon: '⭐' },
    { level: 40, title: 'Gran Almirante',    icon: '🌟' },
    { level: 50, title: 'Leyenda Cósmica',   icon: '👑' },
];

function xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.35, level - 1));
}

// ─── State ───

let collectionState = {
    discoveredBiomes: [],
    discoveredStars: [],
    unlockedMilestones: [],
    totalScans: 0,
    totalMining: 0,
    totalCrafts: 0,
    totalExpeditions: 0,
    explorerXP: 0,
    explorerLevel: 1,
};

export function initCollection() {
    try {
        const raw = localStorage.getItem('cartografia_collection');
        if (raw) collectionState = { ...collectionState, ...JSON.parse(raw) };
    } catch(e) {}
}

/**
 * Record a sector discovery for the bestiary.
 * Returns { newBiomes, newStars, xpGained, milestones }
 */
export function recordDiscovery(sectorData) {
    if (!sectorData?.star_system) return { newBiomes: [], newStars: [], xpGained: 0, milestones: [] };

    const newBiomes = [];
    const newStars = [];
    let xpGained = 0;

    collectionState.totalScans++;

    // Record star type
    const starType = sectorData.star_system.star_type;
    if (starType && !collectionState.discoveredStars.includes(starType)) {
        collectionState.discoveredStars.push(starType);
        const starInfo = STAR_CATALOG[starType];
        if (starInfo) {
            xpGained += starInfo.xp;
            newStars.push(starType);
            showNotification('⭐ Nueva Estrella', `${starInfo.icon} ${starInfo.name} catalogada`, 'uncommon');
        }
    }

    // Record planet biomes
    for (const planet of sectorData.star_system.planets) {
        const biome = planet.biome;
        if (biome && !collectionState.discoveredBiomes.includes(biome)) {
            collectionState.discoveredBiomes.push(biome);
            const biomeInfo = BIOME_CATALOG[biome];
            if (biomeInfo) {
                xpGained += biomeInfo.xp;
                newBiomes.push(biome);
                showNotification('🌍 Nuevo Bioma', `${biomeInfo.icon} ${biomeInfo.name} descubierto`, 'uncommon');
            }
        }
    }

    // Base XP for scanning
    xpGained += 3;

    // Check milestones
    const milestones = checkMilestones();
    milestones.forEach(m => { xpGained += m.xp; });

    addXP(xpGained);
    saveCollectionState();

    return { newBiomes, newStars, xpGained, milestones };
}

/**
 * Record a mining action.
 */
export function recordMining() {
    collectionState.totalMining++;
    addXP(2);
    checkMilestones();
    saveCollectionState();
}

/**
 * Record a craft.
 */
export function recordCraft() {
    collectionState.totalCrafts++;
    addXP(5);
    checkMilestones();
    saveCollectionState();
}

/**
 * Record expedition completion.
 */
export function recordExpedition() {
    collectionState.totalExpeditions++;
    addXP(8);
    checkMilestones();
    saveCollectionState();
}

/**
 * Record gacha pulls.
 */
export function recordGachaPulls(count) {
    // No state here, we read from gacha state directly
    addXP(count);
    checkMilestones();
    saveCollectionState();
}

function addXP(amount) {
    collectionState.explorerXP += amount;

    // Check level up
    while (collectionState.explorerXP >= xpForLevel(collectionState.explorerLevel)) {
        collectionState.explorerXP -= xpForLevel(collectionState.explorerLevel);
        collectionState.explorerLevel++;

        const title = getExplorerTitle();
        showNotification('🎖️ ¡NIVEL ' + collectionState.explorerLevel + '!', `Nuevo rango: ${title.icon} ${title.title}`, 'epic');
    }
}

function checkMilestones() {
    const newMilestones = [];
    const gachaRaw = localStorage.getItem('cartografia_gacha');
    const gachaState = gachaRaw ? JSON.parse(gachaRaw) : {};
    const prestigeRaw = localStorage.getItem('cartografia_prestige');
    const prestigeState = prestigeRaw ? JSON.parse(prestigeRaw) : {};
    const dailyRaw = localStorage.getItem('cartografia_daily');
    const dailyState = dailyRaw ? JSON.parse(dailyRaw) : {};

    for (const milestone of DISCOVERY_MILESTONES) {
        if (collectionState.unlockedMilestones.includes(milestone.id)) continue;

        let unlocked = false;
        const req = milestone.req;

        if (req.scans && collectionState.totalScans >= req.scans) unlocked = true;
        if (req.allBiomes && collectionState.discoveredBiomes.length >= Object.keys(BIOME_CATALOG).length - 1) unlocked = true; // -1 for Ocean alias
        if (req.allStars && collectionState.discoveredStars.length >= Object.keys(STAR_CATALOG).length) unlocked = true;
        if (req.star && collectionState.discoveredStars.includes(req.star)) unlocked = true;
        if (req.biome && collectionState.discoveredBiomes.includes(req.biome)) unlocked = true;
        if (req.mining && collectionState.totalMining >= req.mining) unlocked = true;
        if (req.crafts && collectionState.totalCrafts >= req.crafts) unlocked = true;
        if (req.gachaPulls && (gachaState.totalPulls || 0) >= req.gachaPulls) unlocked = true;
        if (req.ascensions && (prestigeState.totalAscensions || 0) >= req.ascensions) unlocked = true;
        if (req.expeditions && collectionState.totalExpeditions >= req.expeditions) unlocked = true;
        if (req.dailyStreak && (dailyState.streak || 0) >= req.dailyStreak) unlocked = true;

        if (unlocked) {
            collectionState.unlockedMilestones.push(milestone.id);
            newMilestones.push(milestone);
            showNotification(`🏆 Logro: ${milestone.name}`, `${milestone.icon} +${milestone.xp} XP${milestone.quarks ? ` · +${milestone.quarks}⚡` : ''}`, 'epic');
        }
    }

    return newMilestones;
}

/**
 * Get current explorer title.
 */
export function getExplorerTitle() {
    let current = EXPLORER_TITLES[0];
    for (const t of EXPLORER_TITLES) {
        if (collectionState.explorerLevel >= t.level) current = t;
    }
    return current;
}

/**
 * Get the bestiary data for display.
 */
export function getBestiary() {
    const biomes = Object.entries(BIOME_CATALOG).map(([id, info]) => ({
        id,
        ...info,
        discovered: collectionState.discoveredBiomes.includes(id),
    }));

    const stars = Object.entries(STAR_CATALOG).map(([id, info]) => ({
        id,
        ...info,
        discovered: collectionState.discoveredStars.includes(id),
    }));

    return { biomes, stars };
}

/**
 * Get collection stats for display.
 */
export function getCollectionStats() {
    const title = getExplorerTitle();
    const nextLevelXP = xpForLevel(collectionState.explorerLevel);

    return {
        level: collectionState.explorerLevel,
        xp: collectionState.explorerXP,
        xpNeeded: nextLevelXP,
        xpProgress: collectionState.explorerXP / nextLevelXP,
        title: title.title,
        titleIcon: title.icon,
        totalScans: collectionState.totalScans,
        biomesDiscovered: collectionState.discoveredBiomes.length,
        biomesTotal: Object.keys(BIOME_CATALOG).length - 1, // -1 for Ocean alias
        starsDiscovered: collectionState.discoveredStars.length,
        starsTotal: Object.keys(STAR_CATALOG).length,
        milestones: DISCOVERY_MILESTONES.map(m => ({
            ...m,
            unlocked: collectionState.unlockedMilestones.includes(m.id),
        })),
        milestonesUnlocked: collectionState.unlockedMilestones.length,
        milestonesTotal: DISCOVERY_MILESTONES.length,
    };
}

/**
 * Get milestone quarks reward that hasn't been collected yet.
 */
export function getMilestoneQuarks() {
    return DISCOVERY_MILESTONES
        .filter(m => collectionState.unlockedMilestones.includes(m.id))
        .reduce((sum, m) => sum + (m.quarks || 0), 0);
}

function saveCollectionState() {
    try {
        localStorage.setItem('cartografia_collection', JSON.stringify(collectionState));
    } catch(e) {}
}

export { BIOME_CATALOG, STAR_CATALOG, DISCOVERY_MILESTONES };
