// HUD and UI controller — Manages all DOM-based interface elements.
// Handles sector info display, notifications, discovery log, and resource tracking.

let discoveryLog = [];
let stats = { sectorsExplored: 0, planetsFound: 0, ruinsFound: 0, anomalies: 0 };

/**
 * Initialize UI event listeners and state.
 */
export function initUI() {
    stats = { sectorsExplored: 0, planetsFound: 0, ruinsFound: 0, anomalies: 0 };
    discoveryLog = [];
}

/**
 * Show the HUD layer.
 */
export function showHUD() {
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('active');
}

/**
 * Update the coordinate display.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} hash - Sector hash hex string.
 */
export function updateCoordinates(x, y, z, hash) {
    const el = (id) => document.getElementById(id);
    el('display-x').textContent = x;
    el('display-y').textContent = y;
    el('display-z').textContent = z;
    el('display-hash').textContent = hash ? hash.substring(0, 16) + '...' : '—';
}

/**
 * Update sector info panel with generated data.
 * @param {object} data - Parsed sector JSON data.
 */
export function updateSectorInfo(data) {
    const panel = document.getElementById('sector-info-content');
    if (!panel) return;

    // Update stats
    stats.sectorsExplored++;
    const planetCount = data.star_system?.planets?.length || 0;
    stats.planetsFound += planetCount;
    stats.ruinsFound += (data.ruins?.length || 0);
    if (data.sector_class === 'Anomalous') stats.anomalies++;

    // Build panel content
    let html = '';

    // Sector class badge
    const classLower = data.sector_class.toLowerCase();
    html += `<div style="margin-bottom:12px;"><span class="sector-badge ${classLower}">${data.sector_class}</span></div>`;

    // Star info
    if (data.star_system) {
        const star = data.star_system;
        html += `<div class="panel-header"><span class="icon">⭐</span> Sistema Estelar</div>`;
        html += `<div class="info-row"><span class="info-label">Tipo</span><span class="info-value">${formatStarType(star.star_type)}</span></div>`;
        html += `<div class="info-row"><span class="info-label">Temp.</span><span class="info-value">${star.temperature_kelvin.toLocaleString()}K</span></div>`;
        html += `<div class="info-row"><span class="info-label">Luminosidad</span><span class="info-value">${star.luminosity.toFixed(2)}L☉</span></div>`;
        html += `<div class="info-row"><span class="info-label">Planetas</span><span class="info-value">${star.planets.length}</span></div>`;
        html += `<hr class="section-divider">`;

        // Planet cards — interactive (tap to mine)
        if (star.planets.length > 0) {
            html += `<div class="panel-header"><span class="icon">🪐</span> Planetas <span style="font-size:0.55rem;color:var(--text-dim);margin-left:6px;">TAP = MINAR</span></div>`;
            star.planets.forEach((p, i) => {
                html += `
                    <div class="planet-card" data-planet-index="${i}" style="cursor:pointer;position:relative;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div class="planet-name">${p.name}</div>
                            <span style="font-size:0.9rem;opacity:0.5;" title="Minar">⛏️</span>
                        </div>
                        <div class="planet-biome">${p.biome} · ${p.mass_earth.toFixed(1)}M⊕ · ${p.moons} lunas</div>
                        <div class="planet-biome">${p.has_atmosphere ? '🌫 Atmósfera' : '☠ Sin atmósfera'} · ${p.surface_temperature_k.toFixed(0)}K</div>
                    </div>
                `;
            });
            html += `<hr class="section-divider">`;
        }
    } else {
        html += `<div class="panel-header"><span class="icon">🕳️</span> Sector Vacío</div>`;
        html += `<div class="info-row"><span class="info-label">Estado</span><span class="info-value">Sin sistema estelar</span></div>`;
        html += `<hr class="section-divider">`;
    }

    // Ruins
    if (data.ruins && data.ruins.length > 0) {
        html += `<div class="panel-header"><span class="icon">🏛️</span> Ruinas Precursoras</div>`;
        data.ruins.forEach((r) => {
            html += `
                <div class="ruin-card">
                    <div class="ruin-type">${formatRuinType(r.ruin_type)}</div>
                    <div class="ruin-age">Complejidad: ${r.complexity} · Edad: ${r.age_megayears.toFixed(0)}M años</div>
                </div>
            `;
        });
    }

    panel.innerHTML = html;

    // Update stat pills
    updateStatPills();

    // Determine rarity and add discovery
    const rarity = determineSectorRarity(data);
    addDiscovery(data, rarity);

    return rarity;
}

/**
 * Update the resource display.
 * @param {number} quarks
 * @param {number} fuel
 */
export function updateResources(quarks, fuel) {
    const qEl = document.getElementById('quark-count');
    const fEl = document.getElementById('fuel-count');
    if (qEl) qEl.textContent = quarks.toLocaleString();
    if (fEl) fEl.textContent = fuel;
}

/**
 * Show a center-screen notification.
 * @param {string} title
 * @param {string} desc
 * @param {string} rarity - For styling.
 */
export function showNotification(title, desc, rarity = '') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `notification-toast ${rarity}`;
    toast.innerHTML = `
        <div class="notif-title">${title}</div>
        <div class="notif-desc">${desc}</div>
    `;

    container.appendChild(toast);

    // Remove after animation
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
}

function addDiscovery(data, rarity) {
    const container = document.getElementById('discovery-log');
    if (!container) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

    let title = '';
    let desc = '';

    if (data.sector_class === 'Anomalous') {
        title = '⚠ Anomalía Detectada';
        desc = `${data.ruins.length} ruina(s) encontrada(s)`;
    } else if (data.star_system) {
        const pCount = data.star_system.planets.length;
        title = `${formatStarType(data.star_system.star_type)}`;
        desc = `${pCount} planeta(s)`;
    } else {
        title = 'Sector Vacío';
        desc = 'Sin actividad estelar';
    }

    const entry = document.createElement('div');
    entry.className = `discovery-entry ${rarity}`;
    entry.innerHTML = `
        <div class="discovery-title">${title}</div>
        <div class="discovery-desc">${desc}</div>
        <div class="discovery-time">${timeStr} · (${data.coordinates.x}, ${data.coordinates.y}, ${data.coordinates.z})</div>
    `;

    container.insertBefore(entry, container.firstChild);

    // Keep max 50 entries
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

function updateStatPills() {
    const el = (id) => document.getElementById(id);
    el('stat-sectors').textContent = stats.sectorsExplored;
    el('stat-planets-total').textContent = stats.planetsFound;
    el('stat-ruins-total').textContent = stats.ruinsFound;
    el('stat-anomalies').textContent = stats.anomalies;
}

/**
 * Determine sector rarity based on contents.
 * @param {object} data
 * @returns {string} 'common'|'uncommon'|'rare'|'epic'|'legendary'
 */
function determineSectorRarity(data) {
    if (!data.star_system) return 'common';

    const star = data.star_system;
    const ruins = data.ruins || [];
    const planets = star.planets || [];

    // Black hole or Neutron star = epic or legendary
    if (star.star_type === 'BlackHole') {
        return ruins.length > 0 ? 'legendary' : 'epic';
    }
    if (star.star_type === 'Neutron') {
        return ruins.length > 0 ? 'epic' : 'rare';
    }

    // Has ruins = at least rare
    if (ruins.length > 0) {
        if (ruins.some(r => r.complexity >= 4)) return 'epic';
        return 'rare';
    }

    // Dense system (many planets)
    if (planets.length > 5) return 'uncommon';

    // Has exotic biomes
    const exoticBiomes = ['Crystalline', 'Biomechanical'];
    if (planets.some(p => exoticBiomes.includes(p.biome))) return 'uncommon';

    return 'common';
}

function formatStarType(type) {
    const map = {
        RedDwarf: '🔴 Enana Roja',
        YellowMain: '🟡 Secuencia Principal',
        BlueGiant: '🔵 Gigante Azul',
        WhiteDwarf: '⚪ Enana Blanca',
        Neutron: '💠 Estrella de Neutrones',
        BlackHole: '🕳️ Agujero Negro',
    };
    return map[type] || type;
}

function formatRuinType(type) {
    const map = {
        PrecursorMonolith: '🗿 Monolito Precursor',
        BiomechanicalHive: '🦠 Colmena Biomecánica',
        CrystallineArchive: '💎 Archivo Cristalino',
        VoidGateway: '🌀 Portal del Vacío',
        QuantumRelay: '⚡ Relé Cuántico',
    };
    return map[type] || type;
}

/**
 * Get exploration stats.
 */
export function getStats() {
    return { ...stats };
}
