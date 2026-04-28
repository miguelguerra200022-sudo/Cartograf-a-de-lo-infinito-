// Crafting & Expeditions — Late-game progression systems.
// Crafting: combine materials into blueprints for ship modules and cosmetics.
// Expeditions: send probes on timed missions for passive resource income.

import { showNotification } from './ui.js';

// ─── Crafting Recipes ───
export const RECIPES = {
    warpCoil: {
        name: 'Bobina Warp',
        icon: '🌀',
        desc: 'Mejora: +15% eficiencia del motor',
        materials: { iron: 5, plasma: 3 },
        result: { type: 'upgrade', target: 'engine', bonus: 0.15 },
        rarity: 'uncommon',
    },
    shieldMatrix: {
        name: 'Matriz de Escudo',
        icon: '🛡️',
        desc: 'Mejora: +25 Hull máximo',
        materials: { iron: 8, crystal: 4 },
        result: { type: 'upgrade', target: 'hull', bonus: 25 },
        rarity: 'uncommon',
    },
    quantumLens: {
        name: 'Lente Cuántico',
        icon: '🔭',
        desc: 'Mejora: Scanner detecta materiales raros',
        materials: { crystal: 6, neutronium: 2 },
        result: { type: 'upgrade', target: 'scanner', bonus: 1 },
        rarity: 'rare',
    },
    voidHarness: {
        name: 'Arnés del Vacío',
        icon: '🔮',
        desc: '+500 Quarks + Cargo expandido',
        materials: { darkMatter: 3, voidShard: 1 },
        result: { type: 'combo', quarks: 500, target: 'cargo', bonus: 5 },
        rarity: 'epic',
    },
    stellarBeacon: {
        name: 'Faro Estelar',
        icon: '⭐',
        desc: 'Desbloquea expediciones legendarias',
        materials: { neutronium: 5, darkMatter: 2, voidShard: 1 },
        result: { type: 'unlock', feature: 'legendaryExpeditions' },
        rarity: 'legendary',
    },
    fuelSynthesizer: {
        name: 'Sintetizador de Combustible',
        icon: '⛽',
        desc: '+10 Combustible gratis',
        materials: { iron: 3, plasma: 2 },
        result: { type: 'fuel', amount: 10 },
        rarity: 'common',
    },
    emergencyKit: {
        name: 'Kit de Emergencia',
        icon: '🩹',
        desc: 'Reparación completa del casco',
        materials: { iron: 4, crystal: 2 },
        result: { type: 'repair', amount: 999 },
        rarity: 'common',
    },
};

// ─── Expeditions ───
export const EXPEDITION_TEMPLATES = [
    {
        id: 'scout_nearby',
        name: 'Reconocimiento Local',
        icon: '📡',
        desc: 'Envía una sonda al sector vecino.',
        duration: 120, // seconds
        cost: { fuel: 2 },
        rewards: { quarks: [30, 80], materials: { iron: [1, 3] } },
        rarity: 'common',
    },
    {
        id: 'deep_scan',
        name: 'Escaneo Profundo',
        icon: '🔬',
        desc: 'Analiza las capas geológicas de un asteroide.',
        duration: 300,
        cost: { fuel: 3 },
        rewards: { quarks: [50, 150], materials: { crystal: [1, 3], iron: [2, 5] } },
        rarity: 'uncommon',
    },
    {
        id: 'nebula_harvest',
        name: 'Cosecha de Nebulosa',
        icon: '☁️',
        desc: 'Recolecta plasma ionizado de una nebulosa cercana.',
        duration: 600,
        cost: { fuel: 5 },
        rewards: { quarks: [100, 300], materials: { plasma: [2, 5], neutronium: [0, 1] } },
        rarity: 'rare',
    },
    {
        id: 'ruin_expedition',
        name: 'Expedición a Ruinas',
        icon: '🏛️',
        desc: 'Investiga una señal precursora lejana.',
        duration: 1200,
        cost: { fuel: 8 },
        rewards: { quarks: [200, 500], materials: { neutronium: [1, 3], darkMatter: [0, 1] } },
        rarity: 'epic',
    },
    {
        id: 'void_dive',
        name: 'Inmersión al Vacío',
        icon: '🌑',
        desc: 'Envía una sonda al borde del agujero negro más cercano.',
        duration: 2400,
        cost: { fuel: 15 },
        rewards: { quarks: [500, 1500], materials: { darkMatter: [1, 3], voidShard: [0, 1] } },
        rarity: 'legendary',
        requiresUnlock: 'legendaryExpeditions',
    },
];

let craftState = {
    crafted: {},         // recipe_id -> count
    unlockedFeatures: [],
    activeExpeditions: [], // { id, templateId, startTime, duration }
    completedExpeditions: 0,
};

export function initCrafting() {
    loadCraftState();
}

/**
 * Check if a recipe can be crafted with current materials.
 */
export function canCraft(recipeId, materials) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return false;

    for (const [mat, needed] of Object.entries(recipe.materials)) {
        if ((materials[mat] || 0) < needed) return false;
    }
    return true;
}

/**
 * Execute a crafting recipe. Returns materials consumed and result.
 */
export function craft(recipeId, materials) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return null;

    if (!canCraft(recipeId, materials)) {
        showNotification('❌ Materiales insuficientes', 'Necesitas más recursos.', '');
        return null;
    }

    // Consume materials
    const consumed = {};
    for (const [mat, needed] of Object.entries(recipe.materials)) {
        materials[mat] -= needed;
        consumed[mat] = needed;
    }

    // Track
    craftState.crafted[recipeId] = (craftState.crafted[recipeId] || 0) + 1;

    // Handle unlock
    if (recipe.result.type === 'unlock') {
        if (!craftState.unlockedFeatures.includes(recipe.result.feature)) {
            craftState.unlockedFeatures.push(recipe.result.feature);
        }
    }

    saveCraftState();
    showNotification(`🔨 ¡Crafteado!`, `${recipe.icon} ${recipe.name}`, recipe.rarity);

    return { consumed, result: recipe.result, recipe };
}

/**
 * Start an expedition.
 */
export function startExpedition(templateId, fuel) {
    const template = EXPEDITION_TEMPLATES.find(t => t.id === templateId);
    if (!template) return { success: false, fuel };

    if (template.requiresUnlock && !craftState.unlockedFeatures.includes(template.requiresUnlock)) {
        showNotification('🔒 Bloqueado', 'Necesitas craftear el Faro Estelar.', '');
        return { success: false, fuel };
    }

    // Check active limit (max 3)
    if (craftState.activeExpeditions.length >= 3) {
        showNotification('⚠ Límite', 'Máximo 3 expediciones simultáneas.', '');
        return { success: false, fuel };
    }

    if (fuel < template.cost.fuel) {
        showNotification('⛽ Sin Combustible', `Necesitas ${template.cost.fuel} combustible.`, '');
        return { success: false, fuel };
    }

    fuel -= template.cost.fuel;

    craftState.activeExpeditions.push({
        id: Date.now().toString(),
        templateId,
        startTime: Date.now(),
        duration: template.duration * 1000,
    });

    saveCraftState();
    showNotification('🚀 Expedición Enviada', `${template.icon} ${template.name}`, '');

    return { success: true, fuel };
}

/**
 * Check and collect completed expeditions.
 * @returns {Array} Array of completed expedition rewards.
 */
export function collectExpeditions() {
    const now = Date.now();
    const completed = [];
    const remaining = [];

    for (const exp of craftState.activeExpeditions) {
        if (now - exp.startTime >= exp.duration) {
            const template = EXPEDITION_TEMPLATES.find(t => t.id === exp.templateId);
            if (template) {
                // Generate random rewards
                const quarks = randomRange(template.rewards.quarks[0], template.rewards.quarks[1]);
                const materials = {};
                for (const [mat, range] of Object.entries(template.rewards.materials)) {
                    const amt = randomRange(range[0], range[1]);
                    if (amt > 0) materials[mat] = amt;
                }
                completed.push({ template, quarks, materials, expId: exp.id });
            }
            craftState.completedExpeditions++;
        } else {
            remaining.push(exp);
        }
    }

    craftState.activeExpeditions = remaining;
    saveCraftState();
    return completed;
}

/**
 * Get active expeditions with progress data.
 */
export function getActiveExpeditions() {
    const now = Date.now();
    return craftState.activeExpeditions.map(exp => {
        const template = EXPEDITION_TEMPLATES.find(t => t.id === exp.templateId);
        const elapsed = now - exp.startTime;
        const progress = Math.min(1, elapsed / exp.duration);
        const remaining = Math.max(0, exp.duration - elapsed);
        return { ...exp, template, progress, remaining };
    });
}

/**
 * Check if a feature is unlocked.
 */
export function isFeatureUnlocked(feature) {
    return craftState.unlockedFeatures.includes(feature);
}

function randomRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function saveCraftState() {
    try {
        localStorage.setItem('cartografia_crafting', JSON.stringify(craftState));
    } catch (e) { /* silent */ }
}

function loadCraftState() {
    try {
        const raw = localStorage.getItem('cartografia_crafting');
        if (raw) craftState = { ...craftState, ...JSON.parse(raw) };
    } catch (e) { /* fresh */ }
}
