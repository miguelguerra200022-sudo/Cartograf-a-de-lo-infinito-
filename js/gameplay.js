// Gameplay module — Codex, Missions, Achievements, Shop, Loot, Claim.
// Client-side progression system. Works offline; syncs with backend when available.

import { showNotification, updateResources } from './ui.js';

// ─── Codex (Collection tracker) ───
const CODEX_DATA = {
    stars: [
        { id: 'RedDwarf', emoji: '🔴', name: 'Enana Roja' },
        { id: 'YellowMain', emoji: '🟡', name: 'Secuencia Principal' },
        { id: 'BlueGiant', emoji: '🔵', name: 'Gigante Azul' },
        { id: 'WhiteDwarf', emoji: '⚪', name: 'Enana Blanca' },
        { id: 'Neutron', emoji: '💠', name: 'Estrella de Neutrones' },
        { id: 'BlackHole', emoji: '🕳️', name: 'Agujero Negro' },
    ],
    biomes: [
        { id: 'Desert', emoji: '🏜️', name: 'Desierto' },
        { id: 'Ocean', emoji: '🌊', name: 'Océano' },
        { id: 'Temperate', emoji: '🌿', name: 'Templado' },
        { id: 'Frozen', emoji: '🧊', name: 'Congelado' },
        { id: 'Volcanic', emoji: '🌋', name: 'Volcánico' },
        { id: 'Gas', emoji: '💨', name: 'Gaseoso' },
        { id: 'Crystalline', emoji: '💎', name: 'Cristalino' },
        { id: 'Biomechanical', emoji: '🦠', name: 'Biomecánico' },
        { id: 'Toxic', emoji: '☢️', name: 'Tóxico' },
        { id: 'Lush', emoji: '🌺', name: 'Exuberante' },
    ],
    ruins: [
        { id: 'PrecursorMonolith', emoji: '🗿', name: 'Monolito Precursor' },
        { id: 'BiomechanicalHive', emoji: '🦠', name: 'Colmena Biomecánica' },
        { id: 'CrystallineArchive', emoji: '💎', name: 'Archivo Cristalino' },
        { id: 'VoidGateway', emoji: '🌀', name: 'Portal del Vacío' },
        { id: 'QuantumRelay', emoji: '⚡', name: 'Relé Cuántico' },
    ],
};

// ─── Achievements ───
const ACHIEVEMENTS = [
    { id: 'first_scan', icon: '🔭', name: 'Primer Contacto', desc: 'Escanea tu primer sector', reward: 50, check: (s) => s.sectorsExplored >= 1 },
    { id: 'explorer_10', icon: '🧭', name: 'Navegante', desc: 'Escanea 10 sectores', reward: 100, check: (s) => s.sectorsExplored >= 10 },
    { id: 'explorer_50', icon: '🚀', name: 'Pionero Cósmico', desc: 'Escanea 50 sectores', reward: 500, check: (s) => s.sectorsExplored >= 50 },
    { id: 'explorer_100', icon: '⭐', name: 'Leyenda Galáctica', desc: 'Escanea 100 sectores', reward: 2000, check: (s) => s.sectorsExplored >= 100 },
    { id: 'find_rare', icon: '💠', name: 'Ojo de Halcón', desc: 'Encuentra un sector raro', reward: 150, check: (s) => s.raresFound >= 1 },
    { id: 'find_epic', icon: '🌟', name: 'Cazador de Anomalías', desc: 'Encuentra un sector épico', reward: 500, check: (s) => s.epicsFound >= 1 },
    { id: 'find_legendary', icon: '👑', name: 'El Elegido', desc: 'Encuentra un sector legendario', reward: 2500, check: (s) => s.legendariesFound >= 1 },
    { id: 'claim_1', icon: '🏴', name: 'Terrateniente', desc: 'Reclama tu primer sector', reward: 100, check: (s) => s.sectorsClaimed >= 1 },
    { id: 'claim_10', icon: '🏰', name: 'Señor del Espacio', desc: 'Reclama 10 sectores', reward: 1000, check: (s) => s.sectorsClaimed >= 10 },
    { id: 'codex_stars', icon: '📖', name: 'Astrónomo', desc: 'Descubre los 6 tipos de estrella', reward: 300, check: (s) => s.uniqueStars >= 6 },
    { id: 'codex_biomes', icon: '🌍', name: 'Biólogo Galáctico', desc: 'Descubre los 10 biomas', reward: 800, check: (s) => s.uniqueBiomes >= 10 },
    { id: 'codex_ruins', icon: '🏛️', name: 'Arqueólogo', desc: 'Descubre las 5 ruinas', reward: 500, check: (s) => s.uniqueRuins >= 5 },
    { id: 'black_hole', icon: '🕳️', name: 'Horizonte de Eventos', desc: 'Visita un Agujero Negro', reward: 400, check: (s) => s.blackHolesFound >= 1 },
    { id: 'rich', icon: '💰', name: 'Magnate de Quarks', desc: 'Acumula 5000 Quarks', reward: 0, check: (s) => s.peakQuarks >= 5000 },
];

// ─── Missions ───
function generateMissions(stats) {
    const base = [
        { id: 'daily_scan', title: '🔭 Exploración Diaria', desc: 'Escanea 5 sectores', target: 5, current: Math.min(stats.sessionsScans || 0, 5), reward: 75, type: 'scan' },
        { id: 'daily_rare', title: '💎 Hallazgo Especial', desc: 'Encuentra 1 sector raro o superior', target: 1, current: Math.min(stats.sessionRares || 0, 1), reward: 150, type: 'rare' },
        { id: 'daily_claim', title: '🏴 Expansión Territorial', desc: 'Reclama 2 sectores', target: 2, current: Math.min(stats.sessionClaims || 0, 2), reward: 100, type: 'claim' },
        { id: 'weekly_explore', title: '🧭 Viaje Profundo', desc: 'Escanea 25 sectores', target: 25, current: Math.min(stats.sessionsScans || 0, 25), reward: 500, type: 'scan' },
        { id: 'weekly_codex', title: '📖 Coleccionista', desc: 'Descubre 3 biomas diferentes', target: 3, current: Math.min(stats.sessionBiomes || 0, 3), reward: 250, type: 'biome' },
    ];
    return base;
}

// ─── State ───
let gameState = {
    codex: { stars: {}, biomes: {}, ruins: {} },
    achievements: {},
    stats: {
        sectorsExplored: 0,
        sectorsClaimed: 0,
        raresFound: 0,
        epicsFound: 0,
        legendariesFound: 0,
        blackHolesFound: 0,
        uniqueStars: 0,
        uniqueBiomes: 0,
        uniqueRuins: 0,
        peakQuarks: 500,
        sessionsScans: 0,
        sessionRares: 0,
        sessionClaims: 0,
        sessionBiomes: 0,
    },
    quarks: 500,
    fuel: 20,
    claimedSectors: new Set(),
    dailyClaimUsed: false,
};

/**
 * Initialize gameplay systems. Load from localStorage if available.
 */
export function initGameplay() {
    loadState();
    bindGameplayEvents();
    updateMissionsBadge();
}

/**
 * Record a sector scan for gameplay progression.
 * @param {object} sectorData - The parsed sector JSON.
 * @param {string} rarity - Determined rarity.
 * @returns {{ loot: object|null }} Loot info if applicable.
 */
export function recordScan(sectorData, rarity) {
    const s = gameState.stats;
    s.sectorsExplored++;
    s.sessionsScans++;

    // Track codex discoveries
    if (sectorData.star_system) {
        const starType = sectorData.star_system.star_type;
        if (!gameState.codex.stars[starType]) {
            gameState.codex.stars[starType] = 0;
            showNotification('📖 Códex Actualizado', `Nuevo tipo estelar: ${starType}`, '');
        }
        gameState.codex.stars[starType]++;

        if (starType === 'BlackHole') s.blackHolesFound++;

        // Track biomes
        for (const planet of sectorData.star_system.planets) {
            if (!gameState.codex.biomes[planet.biome]) {
                gameState.codex.biomes[planet.biome] = 0;
                s.sessionBiomes++;
                showNotification('📖 Códex Actualizado', `Nuevo bioma: ${planet.biome}`, '');
            }
            gameState.codex.biomes[planet.biome]++;
        }
    }

    // Track ruins
    if (sectorData.ruins) {
        for (const ruin of sectorData.ruins) {
            if (!gameState.codex.ruins[ruin.ruin_type]) {
                gameState.codex.ruins[ruin.ruin_type] = 0;
                showNotification('📖 Códex Actualizado', `Nueva ruina: ${ruin.ruin_type}`, '');
            }
            gameState.codex.ruins[ruin.ruin_type]++;
        }
    }

    // Track rarity stats
    if (rarity === 'rare') { s.raresFound++; s.sessionRares++; }
    if (rarity === 'epic') { s.epicsFound++; s.sessionRares++; }
    if (rarity === 'legendary') { s.legendariesFound++; s.sessionRares++; }

    // Update unique counts
    s.uniqueStars = Object.keys(gameState.codex.stars).length;
    s.uniqueBiomes = Object.keys(gameState.codex.biomes).length;
    s.uniqueRuins = Object.keys(gameState.codex.ruins).length;

    // Check achievements
    checkAchievements();

    // Auto-generate loot for rare+ sectors
    let loot = null;
    if (rarity !== 'common') {
        loot = generateLoot(rarity, sectorData);
    }

    saveState();
    updateMissionsBadge();

    return { loot };
}

/**
 * Attempt to claim the current sector.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} quarks - Current quark balance.
 * @returns {{ success: boolean, quarks: number }}
 */
export function claimSector(x, y, z, quarks) {
    const key = `${x},${y},${z}`;
    const cost = 100;

    if (gameState.claimedSectors.has(key)) {
        showNotification('⚠ Ya Reclamado', 'Este sector ya es tuyo.', '');
        return { success: false, quarks };
    }

    if (quarks < cost) {
        showNotification('❌ Sin Quarks', `Necesitas ${cost} Quarks para reclamar.`, '');
        return { success: false, quarks };
    }

    quarks -= cost;
    gameState.claimedSectors.add(key);
    gameState.stats.sectorsClaimed++;
    gameState.stats.sessionClaims++;
    gameState.quarks = quarks;

    showNotification('🏴 Sector Reclamado', `(${x}, ${y}, ${z}) es tuyo.`, 'uncommon');
    checkAchievements();
    saveState();
    updateMissionsBadge();

    return { success: true, quarks };
}

/**
 * Check if a sector is claimed.
 */
export function isSectorClaimed(x, y, z) {
    return gameState.claimedSectors.has(`${x},${y},${z}`);
}

/**
 * Process a shop purchase.
 * @param {string} itemId
 * @param {number} quarks
 * @param {number} fuel
 * @returns {{ quarks: number, fuel: number }}
 */
export function shopPurchase(itemId, quarks, fuel) {
    const actions = {
        'fuel-5': { cost: 25, fuelGain: 5, msg: '+5 Combustible' },
        'fuel-20': { cost: 80, fuelGain: 20, msg: '+20 Combustible' },
        'fuel-100': { cost: 350, fuelGain: 100, msg: '+100 Combustible' },
        'quarks-starter': { cost: 0, quarkGain: 100, msg: '+100 Quarks (Diario)', daily: true },
        'quarks-explorer': { cost: 0, quarkGain: 500, msg: '+500 Quarks', requireScans: 10 },
        'quarks-admiral': { cost: 0, quarkGain: 2000, msg: '+2000 Quarks', requireEpics: 1 },
    };

    const action = actions[itemId];
    if (!action) return { quarks, fuel };

    // Daily claim check
    if (action.daily) {
        if (gameState.dailyClaimUsed) {
            showNotification('⏳ Espera', 'Ya reclamaste tu pack diario.', '');
            return { quarks, fuel };
        }
        gameState.dailyClaimUsed = true;
    }

    // Requirement checks
    if (action.requireScans && gameState.stats.sectorsExplored < action.requireScans) {
        showNotification('❌ Requisito', `Necesitas escanear ${action.requireScans} sectores.`, '');
        return { quarks, fuel };
    }
    if (action.requireEpics && gameState.stats.epicsFound < action.requireEpics) {
        showNotification('❌ Requisito', `Necesitas encontrar ${action.requireEpics} sector(es) épico(s).`, '');
        return { quarks, fuel };
    }

    // Cost check
    if (action.cost > 0 && quarks < action.cost) {
        showNotification('❌ Sin Quarks', `Necesitas ${action.cost} Quarks.`, '');
        return { quarks, fuel };
    }

    // Apply
    quarks -= (action.cost || 0);
    quarks += (action.quarkGain || 0);
    fuel += (action.fuelGain || 0);

    gameState.quarks = quarks;
    gameState.fuel = fuel;

    showNotification('🛒 Compra Exitosa', action.msg, 'uncommon');
    saveState();

    return { quarks, fuel };
}

/**
 * Get formatted codex data for the modal.
 */
export function getCodexData(tab) {
    const items = CODEX_DATA[tab] || [];
    const discovered = gameState.codex[tab] || {};

    return items.map(item => ({
        ...item,
        discovered: !!discovered[item.id],
        count: discovered[item.id] || 0,
    }));
}

/**
 * Get missions for display.
 */
export function getMissions() {
    return generateMissions(gameState.stats);
}

/**
 * Get achievements for display.
 */
export function getAchievements() {
    return ACHIEVEMENTS.map(a => ({
        ...a,
        unlocked: !!gameState.achievements[a.id],
    }));
}

/**
 * Get current game stats.
 */
export function getGameStats() {
    return { ...gameState.stats };
}

// ─── Internal ───

function generateLoot(rarity, sectorData) {
    const lootEmojis = { uncommon: '📦', rare: '💎', epic: '🌟', legendary: '👑', mythic: '🔮' };
    const lootNames = {
        uncommon: ['Fragmento Mineral', 'Cristal Común', 'Dato Estelar'],
        rare: ['Cristal de Neutrones', 'Plasma Solidificado', 'Clave Precursora'],
        epic: ['Núcleo Dimensional', 'Orbe de Antigravedad', 'Esquema Cuántico'],
        legendary: ['Lente Temporal', 'Llave Maestra Precursora', 'Fragmento de Coordenada Oculta'],
    };

    const names = lootNames[rarity] || lootNames.uncommon;
    const name = names[Math.floor(Math.random() * names.length)];
    const values = { uncommon: 50, rare: 200, epic: 1000, legendary: 5000 };
    const value = Math.floor((values[rarity] || 50) * (0.8 + Math.random() * 0.4));

    return {
        emoji: lootEmojis[rarity] || '📦',
        name,
        rarity,
        value,
    };
}

function checkAchievements() {
    const s = gameState.stats;
    s.peakQuarks = Math.max(s.peakQuarks, gameState.quarks);

    for (const ach of ACHIEVEMENTS) {
        if (!gameState.achievements[ach.id] && ach.check(s)) {
            gameState.achievements[ach.id] = true;

            // Award quarks
            if (ach.reward > 0) {
                gameState.quarks += ach.reward;
            }

            showNotification('🏆 ¡Logro Desbloqueado!', `${ach.name} (+${ach.reward} ⚡)`, 'legendary');
        }
    }
}

function updateMissionsBadge() {
    const missions = generateMissions(gameState.stats);
    const incomplete = missions.some(m => m.current < m.target);
    const badge = document.getElementById('missions-badge');
    if (badge) badge.style.display = incomplete ? 'block' : 'none';
}

function bindGameplayEvents() {
    // Modal open/close
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.close;
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.remove('active');
        });
    });

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Codex tabs
    document.querySelectorAll('.codex-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.codex-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderCodex(tab.dataset.tab);
        });
    });

    // Shop cards
    document.querySelectorAll('.shop-card').forEach(card => {
        card.addEventListener('click', () => {
            const itemId = card.dataset.buy;
            if (itemId) {
                // This will be called from app.js
                const event = new CustomEvent('shop-purchase', { detail: { itemId } });
                document.dispatchEvent(event);
            }
        });
    });
}

/**
 * Open a modal by ID.
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Pre-render content
    if (modalId === 'modal-codex') renderCodex('stars');
    if (modalId === 'modal-missions') renderMissions();
    if (modalId === 'modal-achievements') renderAchievements();

    modal.classList.add('active');
}

/**
 * Show a loot reveal animation.
 * @param {object} loot
 */
export function showLootReveal(loot) {
    const modal = document.getElementById('modal-loot');
    const content = document.getElementById('loot-reveal-content');
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="loot-box ${loot.rarity}">
            <div class="loot-emoji">${loot.emoji}</div>
            <div class="loot-name">${loot.name}</div>
            <div class="loot-rarity">${loot.rarity.toUpperCase()}</div>
            <div class="loot-value">+${loot.value} ⚡ Quarks</div>
            <div class="loot-tap-hint">Toca para continuar</div>
        </div>
    `;

    modal.style.display = 'flex';

    // Click to dismiss
    const dismiss = () => {
        modal.style.display = 'none';
        modal.removeEventListener('click', dismiss);
    };
    setTimeout(() => modal.addEventListener('click', dismiss), 500);
}

function renderCodex(tab) {
    const container = document.getElementById('codex-content');
    if (!container) return;

    if (tab === 'bestiary') {
        renderBestiaryTab(container);
        return;
    }

    const items = getCodexData(tab);
    container.innerHTML = items.map(item => `
        <div class="codex-card ${item.discovered ? 'discovered' : 'undiscovered'}">
            <div class="codex-emoji">${item.emoji}</div>
            <div class="codex-name">${item.discovered ? item.name : '???'}</div>
            ${item.discovered ? `<div class="codex-count">×${item.count}</div>` : ''}
        </div>
    `).join('');
}

function renderBestiaryTab(container) {
    // Import dynamically to avoid circular deps
    let stats, bestiary;
    try {
        const raw = localStorage.getItem('cartografia_collection');
        const collState = raw ? JSON.parse(raw) : {};
        const level = collState.explorerLevel || 1;
        const xp = collState.explorerXP || 0;
        const biomesDisc = (collState.discoveredBiomes || []).length;
        const starsDisc = (collState.discoveredStars || []).length;
        const scans = collState.totalScans || 0;
        const milestones = collState.unlockedMilestones || [];
        const biomesTotal = 12; // unique biomes
        const starsTotal = 6;

        let html = `
            <div style="text-align:center;margin-bottom:12px;">
                <div style="font-size:1.5rem;">📊</div>
                <div style="font-family:var(--font-display);font-size:0.7rem;color:var(--text-primary);margin-top:4px;">TU CATÁLOGO</div>
                <div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-secondary);margin-top:4px;">
                    Nivel ${level} · ${scans} escaneos totales
                </div>
            </div>

            <!-- Progress bars -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
                <div style="background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:8px;padding:8px;">
                    <div style="font-size:0.5rem;color:var(--text-dim);letter-spacing:1px;margin-bottom:4px;">BIOMAS</div>
                    <div style="height:6px;background:rgba(102,126,234,0.1);border-radius:3px;">
                        <div style="height:100%;width:${(biomesDisc/biomesTotal*100).toFixed(0)}%;background:linear-gradient(90deg,var(--color-success),var(--rarity-rare));border-radius:3px;"></div>
                    </div>
                    <div style="font-family:var(--font-mono);font-size:0.55rem;color:var(--color-success);margin-top:3px;">${biomesDisc}/${biomesTotal}</div>
                </div>
                <div style="background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:8px;padding:8px;">
                    <div style="font-size:0.5rem;color:var(--text-dim);letter-spacing:1px;margin-bottom:4px;">ESTRELLAS</div>
                    <div style="height:6px;background:rgba(102,126,234,0.1);border-radius:3px;">
                        <div style="height:100%;width:${(starsDisc/starsTotal*100).toFixed(0)}%;background:linear-gradient(90deg,var(--rarity-epic),var(--rarity-legendary));border-radius:3px;"></div>
                    </div>
                    <div style="font-family:var(--font-mono);font-size:0.55rem;color:var(--rarity-epic);margin-top:3px;">${starsDisc}/${starsTotal}</div>
                </div>
            </div>

            <!-- Milestones Grid -->
            <div style="font-family:var(--font-display);font-size:0.5rem;letter-spacing:2px;color:var(--color-primary);margin-bottom:8px;">HITOS (${milestones.length}/21)</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:4px;">
        `;

        // Show a grid of milestone icons
        const ALL_MILESTONES = [
            { id: 'first_scan', icon: '🔭' }, { id: 'scan_10', icon: '🗺️' }, { id: 'scan_50', icon: '🧭' },
            { id: 'scan_100', icon: '🌌' }, { id: 'scan_500', icon: '👑' }, { id: 'all_biomes', icon: '🏆' },
            { id: 'all_stars', icon: '⭐' }, { id: 'first_blackhole', icon: '🕳️' }, { id: 'first_neutron', icon: '💫' },
            { id: 'first_crystalline', icon: '💎' }, { id: 'first_biomech', icon: '🦾' }, { id: 'mine_20', icon: '⛏️' },
            { id: 'mine_100', icon: '💰' }, { id: 'craft_5', icon: '🔧' }, { id: 'craft_20', icon: '🔨' },
            { id: 'gacha_10', icon: '🎰' }, { id: 'gacha_100', icon: '🎲' }, { id: 'prestige_1', icon: '✨' },
            { id: 'prestige_5', icon: '🌟' }, { id: 'expedition_10', icon: '🛰️' }, { id: 'daily_7', icon: '📅' },
        ];

        ALL_MILESTONES.forEach(m => {
            const unlocked = milestones.includes(m.id);
            html += `<div style="
                text-align:center;padding:6px;border-radius:6px;font-size:1rem;
                background:${unlocked ? 'rgba(12,206,107,0.1)' : 'rgba(10,10,25,0.5)'};
                border:1px solid ${unlocked ? 'var(--color-success)' : 'rgba(102,126,234,0.1)'};
                ${unlocked ? '' : 'filter:grayscale(1) opacity(0.3);'}
            ">${m.icon}</div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;">Explora para llenar tu catálogo...</div>';
    }
}

function renderMissions() {
    const container = document.getElementById('missions-content');
    if (!container) return;

    const missions = getMissions();
    container.innerHTML = missions.map(m => {
        const pct = Math.min((m.current / m.target) * 100, 100);
        const completed = m.current >= m.target;
        return `
            <div class="mission-card ${completed ? 'completed' : ''}">
                <div class="mission-title">${m.title}</div>
                <div class="mission-desc">${m.desc}</div>
                <div class="mission-progress-bar">
                    <div class="mission-progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="mission-reward">${m.current}/${m.target} · +${m.reward} ⚡</div>
            </div>
        `;
    }).join('');
}

function renderAchievements() {
    const container = document.getElementById('achievements-content');
    if (!container) return;

    const achievements = getAchievements();
    container.innerHTML = achievements.map(a => `
        <div class="achievement-card ${a.unlocked ? 'unlocked' : 'locked'}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-info">
                <div class="ach-name">${a.unlocked ? a.name : '???'}</div>
                <div class="ach-desc">${a.desc}</div>
            </div>
            <div class="ach-reward">${a.unlocked ? '✅' : `+${a.reward} ⚡`}</div>
        </div>
    `).join('');
}

// ─── Persistence ───

function saveState() {
    try {
        const data = {
            ...gameState,
            claimedSectors: Array.from(gameState.claimedSectors),
        };
        localStorage.setItem('cartografia_state', JSON.stringify(data));
    } catch (e) {
        // Silently fail if localStorage unavailable
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem('cartografia_state');
        if (raw) {
            const data = JSON.parse(raw);
            gameState = {
                ...gameState,
                ...data,
                claimedSectors: new Set(data.claimedSectors || []),
            };
        }
    } catch (e) {
        // Start fresh
    }
}
