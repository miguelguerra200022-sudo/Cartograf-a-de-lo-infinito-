// Addiction Systems — Gacha, Prestige, Offline Progress, Leaderboard, Limited Events.
// Based on Variable-Ratio Reinforcement, Loss Aversion, and Social Proof research.

import { showNotification } from './ui.js';

// ═══════════════════════════════════════════
// 1. GACHA SYSTEM — Variable Reward Banners
// ═══════════════════════════════════════════

const GACHA_ITEMS = [
    // Common (60%)
    { id: 'g_iron_pack',    name: 'Pack de Hierro',        icon: '🪨', rarity: 'common',    weight: 20, reward: { material: 'iron', amount: 5 } },
    { id: 'g_fuel_small',   name: 'Combustible Básico',    icon: '⛽', rarity: 'common',    weight: 20, reward: { fuel: 3 } },
    { id: 'g_quarks_50',    name: '50 Quarks',             icon: '⚡', rarity: 'common',    weight: 20, reward: { quarks: 50 } },
    // Uncommon (25%)
    { id: 'g_crystal_pack', name: 'Cristales de Quásar',   icon: '💎', rarity: 'uncommon',  weight: 10, reward: { material: 'crystal', amount: 4 } },
    { id: 'g_plasma_pack',  name: 'Lote de Plasma',        icon: '🔥', rarity: 'uncommon',  weight: 8,  reward: { material: 'plasma', amount: 4 } },
    { id: 'g_quarks_200',   name: '200 Quarks',            icon: '⚡', rarity: 'uncommon',  weight: 7,  reward: { quarks: 200 } },
    // Rare (10%)
    { id: 'g_neutronium',   name: 'Barra de Neutronio',    icon: '⚛️', rarity: 'rare',      weight: 4,  reward: { material: 'neutronium', amount: 3 } },
    { id: 'g_fuel_mega',    name: 'Mega Combustible',      icon: '🚀', rarity: 'rare',      weight: 4,  reward: { fuel: 15 } },
    { id: 'g_quarks_500',   name: '500 Quarks',            icon: '💰', rarity: 'rare',      weight: 2,  reward: { quarks: 500 } },
    // Epic (4%)
    { id: 'g_darkmatter',   name: 'Materia Oscura',        icon: '🌑', rarity: 'epic',      weight: 2,  reward: { material: 'darkMatter', amount: 2 } },
    { id: 'g_hull_boost',   name: 'Refuerzo de Casco',     icon: '🛡️', rarity: 'epic',      weight: 1.5, reward: { hullBoost: 50 } },
    { id: 'g_quarks_1000',  name: '1000 Quarks',           icon: '🏦', rarity: 'epic',      weight: 0.5, reward: { quarks: 1000 } },
    // Legendary (1%)
    { id: 'g_voidshard',    name: 'Fragmento del Vacío',   icon: '🔮', rarity: 'legendary', weight: 0.7, reward: { material: 'voidShard', amount: 1 } },
    { id: 'g_jackpot',      name: '★ JACKPOT ESTELAR ★',   icon: '👑', rarity: 'legendary', weight: 0.3, reward: { quarks: 5000 } },
];

const GACHA_COST = 80; // quarks per pull
const GACHA_MULTI_COST = 350; // 5 pulls
const PITY_THRESHOLD = 30; // Guaranteed epic+ after 30 pulls without one

let gachaState = {
    totalPulls: 0,
    pullsSinceEpic: 0,
    history: [], // last 20 pulls
};

/**
 * Pull once from the gacha banner.
 * @returns {object|null} The item won, or null if can't afford.
 */
export function gachaPull(quarks) {
    if (quarks < GACHA_COST) return { item: null, quarks };

    quarks -= GACHA_COST;
    gachaState.totalPulls++;
    gachaState.pullsSinceEpic++;

    // Pity system — force epic+ after threshold
    const forcePity = gachaState.pullsSinceEpic >= PITY_THRESHOLD;

    const item = rollGachaItem(forcePity);

    if (item.rarity === 'epic' || item.rarity === 'legendary') {
        gachaState.pullsSinceEpic = 0;
    }

    gachaState.history.unshift(item);
    if (gachaState.history.length > 20) gachaState.history.pop();

    saveGachaState();
    return { item, quarks };
}

/**
 * Pull 5 at once (discounted).
 */
export function gachaMultiPull(quarks) {
    if (quarks < GACHA_MULTI_COST) return { items: null, quarks };

    quarks -= GACHA_MULTI_COST;
    const items = [];

    for (let i = 0; i < 5; i++) {
        gachaState.totalPulls++;
        gachaState.pullsSinceEpic++;
        const forcePity = gachaState.pullsSinceEpic >= PITY_THRESHOLD;
        const item = rollGachaItem(forcePity);
        if (item.rarity === 'epic' || item.rarity === 'legendary') {
            gachaState.pullsSinceEpic = 0;
        }
        items.push(item);
        gachaState.history.unshift(item);
    }

    if (gachaState.history.length > 20) gachaState.history.splice(20);
    saveGachaState();

    return { items, quarks };
}

function rollGachaItem(forcePity) {
    let pool = GACHA_ITEMS;

    if (forcePity) {
        pool = GACHA_ITEMS.filter(i => i.rarity === 'epic' || i.rarity === 'legendary');
    }

    const totalWeight = pool.reduce((s, i) => s + i.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const item of pool) {
        roll -= item.weight;
        if (roll <= 0) return { ...item };
    }
    return { ...pool[pool.length - 1] };
}

export function getGachaState() {
    return {
        ...gachaState,
        cost: GACHA_COST,
        multiCost: GACHA_MULTI_COST,
        pityCounter: gachaState.pullsSinceEpic,
        pityThreshold: PITY_THRESHOLD,
    };
}

// ═══════════════════════════════════════════
// 2. PRESTIGE SYSTEM — "Ascend" for multipliers
// ═══════════════════════════════════════════

let prestigeState = {
    level: 0,
    stardust: 0,       // prestige currency
    totalAscensions: 0,
    multiplier: 1.0,    // All resource gains * this
    perks: [],          // Purchased perks
};

const PRESTIGE_PERKS = [
    { id: 'quark_boost',   name: 'Reactor de Quarks',     icon: '⚡', cost: 5,  desc: '+20% Quarks ganados',     multiplier: { quarks: 0.2 } },
    { id: 'fuel_gen',      name: 'Refinería Estelar',     icon: '⛽', cost: 3,  desc: '+1 Combustible/minuto',    effect: 'fuelRegen' },
    { id: 'scan_luck',     name: 'Scanner Precursor',     icon: '🔮', cost: 8,  desc: '+10% chance sector raro',  effect: 'rarityBoost' },
    { id: 'hull_regen',    name: 'Auto-Reparación',       icon: '🩹', cost: 6,  desc: 'Repara 5 Hull/minuto',     effect: 'hullRegen' },
    { id: 'gacha_luck',    name: 'Estrella de la Suerte', icon: '🍀', cost: 10, desc: '-5 pulls para Pity',       effect: 'pityReduce' },
    { id: 'offline_boost', name: 'Dron Autónomo',         icon: '🤖', cost: 7,  desc: '+50% ganancias offline',   effect: 'offlineBoost' },
    { id: 'double_mine',   name: 'Taladro Cuántico',      icon: '⛏️', cost: 12, desc: 'x2 materiales al minar',   effect: 'doubleMine' },
    { id: 'mega_start',    name: 'Herencia Galáctica',    icon: '👑', cost: 20, desc: 'Empezar con 1000⚡ y 50🚀', effect: 'megaStart' },
];

/**
 * Calculate how much Stardust the player would earn if they prestige now.
 * Based on total quarks earned + sectors explored + achievements.
 */
export function calculatePrestigeReward(totalQuarksEarned, sectorsExplored) {
    // Logarithmic scaling: more earned = diminishing returns per unit but always increasing
    const base = Math.floor(Math.log10(Math.max(1, totalQuarksEarned)) * 2);
    const exploration = Math.floor(sectorsExplored / 10);
    return Math.max(1, base + exploration);
}

/**
 * Execute prestige/ascension. Returns what the player gets to keep.
 */
export function doPrestige(totalQuarksEarned, sectorsExplored) {
    const reward = calculatePrestigeReward(totalQuarksEarned, sectorsExplored);

    prestigeState.stardust += reward;
    prestigeState.level++;
    prestigeState.totalAscensions++;
    prestigeState.multiplier = 1.0 + prestigeState.level * 0.15; // +15% per level

    savePrestigeState();

    return {
        stardustGained: reward,
        totalStardust: prestigeState.stardust,
        newLevel: prestigeState.level,
        multiplier: prestigeState.multiplier,
    };
}

/**
 * Buy a prestige perk.
 */
export function buyPrestigePerk(perkId) {
    const perk = PRESTIGE_PERKS.find(p => p.id === perkId);
    if (!perk) return false;
    if (prestigeState.perks.includes(perkId)) return false;
    if (prestigeState.stardust < perk.cost) return false;

    prestigeState.stardust -= perk.cost;
    prestigeState.perks.push(perkId);
    savePrestigeState();

    showNotification('✨ Mejora Permanente', `${perk.icon} ${perk.name}`, 'legendary');
    return true;
}

export function getPrestigeState() {
    return {
        ...prestigeState,
        perks: [...prestigeState.perks],
        availablePerks: PRESTIGE_PERKS.map(p => ({
            ...p,
            owned: prestigeState.perks.includes(p.id),
        })),
    };
}

export function hasPrestigePerk(perkId) {
    return prestigeState.perks.includes(perkId);
}

// ═══════════════════════════════════════════
// 3. OFFLINE PROGRESS
// ═══════════════════════════════════════════

let offlineState = {
    lastOnlineTime: Date.now(),
};

/**
 * Calculate offline earnings since last play.
 * @returns {{ quarks: number, fuel: number, hull: number, elapsed: number }}
 */
export function calculateOfflineProgress() {
    const now = Date.now();
    const elapsed = now - offlineState.lastOnlineTime;
    const hours = Math.min(elapsed / 3600000, 24); // Cap at 24h

    if (hours < 0.01) return null; // Less than ~36 seconds, skip

    // Base rates per hour
    let quarksPerHour = 20 + (prestigeState.level * 10);
    let fuelPerHour = hasPrestigePerk('fuel_gen') ? 60 : 0;
    let hullPerHour = hasPrestigePerk('hull_regen') ? 300 : 0;

    // Offline boost perk
    const offlineMultiplier = hasPrestigePerk('offline_boost') ? 1.5 : 1.0;

    const quarks = Math.floor(quarksPerHour * hours * offlineMultiplier);
    const fuel = Math.floor(fuelPerHour * hours * offlineMultiplier / 60);
    const hull = Math.floor(hullPerHour * hours * offlineMultiplier / 60);

    offlineState.lastOnlineTime = now;
    saveOfflineState();

    if (quarks === 0 && fuel === 0) return null;

    return { quarks, fuel, hull, elapsed: Math.floor(hours * 60) };
}

/**
 * Update the last-online timestamp (call on every significant action).
 */
export function touchOnlineTime() {
    offlineState.lastOnlineTime = Date.now();
    saveOfflineState();
}

// ═══════════════════════════════════════════
// 4. LEADERBOARD (LOCAL SIMULATED)
// ═══════════════════════════════════════════

const FAKE_EXPLORERS = [
    { name: 'AstroNova_42',     sectors: 847,  quarks: 125000, flag: '🇯🇵' },
    { name: 'CosmicDrifter',    sectors: 612,  quarks: 98000,  flag: '🇺🇸' },
    { name: 'NebulaPilot',      sectors: 534,  quarks: 87000,  flag: '🇩🇪' },
    { name: 'VoidWalker_X',     sectors: 489,  quarks: 72000,  flag: '🇧🇷' },
    { name: 'StarSeeker777',    sectors: 423,  quarks: 65000,  flag: '🇬🇧' },
    { name: 'QuantumExplorer',  sectors: 367,  quarks: 54000,  flag: '🇫🇷' },
    { name: 'DarkMatterHunter', sectors: 312,  quarks: 48000,  flag: '🇰🇷' },
    { name: 'GalacticNomad',    sectors: 256,  quarks: 39000,  flag: '🇪🇸' },
    { name: 'PlanetHopper_99',  sectors: 198,  quarks: 28000,  flag: '🇲🇽' },
    { name: 'OrbitBreaker',     sectors: 145,  quarks: 19000,  flag: '🇦🇷' },
];

/**
 * Get leaderboard with player inserted at correct rank.
 */
export function getLeaderboard(playerName, playerSectors, playerQuarks) {
    const board = FAKE_EXPLORERS.map(e => ({ ...e }));

    // Add slight randomness each time to feel "alive"
    board.forEach(e => {
        e.sectors += Math.floor(Math.random() * 20);
        e.quarks += Math.floor(Math.random() * 3000);
    });

    board.push({
        name: playerName || 'TÚ',
        sectors: playerSectors,
        quarks: playerQuarks,
        flag: '⭐',
        isPlayer: true,
    });

    board.sort((a, b) => b.sectors - a.sectors);

    return board.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ═══════════════════════════════════════════
// 5. LIMITED-TIME EVENTS (FOMO)
// ═══════════════════════════════════════════

function getActiveEvent() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Weekend bonus
    if (day === 0 || day === 6) {
        return {
            id: 'weekend_bonus',
            name: '🎉 FIN DE SEMANA CÓSMICO',
            desc: 'x2 Quarks en descubrimientos + Gacha -30%!',
            effects: { quarkMultiplier: 2, gachaDiscount: 0.3 },
            endsAt: getNextMonday(),
            color: 'var(--rarity-legendary)',
        };
    }

    // Happy hour (20:00-23:00)
    if (hour >= 20 && hour < 23) {
        return {
            id: 'happy_hour',
            name: '⚡ HORA ESTELAR',
            desc: 'x1.5 materiales al minar + Encuentros +50%!',
            effects: { miningMultiplier: 1.5, encounterBoost: 0.5 },
            endsAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0),
            color: 'var(--color-energy)',
        };
    }

    // Morning boost (7:00-10:00)
    if (hour >= 7 && hour < 10) {
        return {
            id: 'morning_boost',
            name: '🌅 DESPERTAR GALÁCTICO',
            desc: '+100 Quarks gratis + Combustible x2!',
            effects: { freeQuarks: 100, fuelMultiplier: 2 },
            endsAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0),
            color: 'var(--color-warning)',
        };
    }

    return null;
}

function getNextMonday() {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getCurrentEvent() {
    return getActiveEvent();
}

export function getEventTimeRemaining() {
    const event = getActiveEvent();
    if (!event) return null;
    const remaining = event.endsAt.getTime() - Date.now();
    if (remaining <= 0) return null;
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    return { event, hours, mins, remaining };
}

// ─── Persistence ───

function saveGachaState() {
    try { localStorage.setItem('cartografia_gacha', JSON.stringify(gachaState)); } catch (e) {}
}
function savePrestigeState() {
    try { localStorage.setItem('cartografia_prestige', JSON.stringify(prestigeState)); } catch (e) {}
}
function saveOfflineState() {
    try { localStorage.setItem('cartografia_offline', JSON.stringify(offlineState)); } catch (e) {}
}

export function initAddiction() {
    try {
        const g = localStorage.getItem('cartografia_gacha');
        if (g) gachaState = { ...gachaState, ...JSON.parse(g) };
        const p = localStorage.getItem('cartografia_prestige');
        if (p) prestigeState = { ...prestigeState, ...JSON.parse(p) };
        const o = localStorage.getItem('cartografia_offline');
        if (o) offlineState = { ...offlineState, ...JSON.parse(o) };
    } catch (e) { /* fresh */ }
}

export { GACHA_COST, GACHA_MULTI_COST, PRESTIGE_PERKS };
