// Main application orchestrator — ties ALL systems together.
// WASM + Three.js + UI + Audio + Ship + Encounters + Gameplay

import { initScene, renderFrame, getScene, getCamera, getRenderer, clearDynamicObjects, animateCamera, setQuality, addOutpost, setPlanetPostProcessing } from './scene.js';
import { createTerrain } from './terrain.js';
import { createPlanetSystem, animatePlanets } from './planets.js';
import { createRuins, animateRuins } from './ruins.js';
import { createNebula, animateNebula, triggerWarp, triggerDiscoveryBurst, isWarping, triggerShake, triggerConfetti } from './effects.js';
import { initUI, showHUD, updateCoordinates, updateSectorInfo, updateResources, showNotification, updateEventHUD } from './ui.js';
import { initAudio, playAmbient, playScanSound, playDiscoverySound, toggleMute, stopAmbient, getMuteState } from './audio.js';
import { initGameplay, recordScan, claimSector, isSectorClaimed, shopPurchase, openModal, showLootReveal } from './gameplay.js';
import { initShip, getShipStats, getMaterials, minePlanet, upgradeModule, repairHull, takeDamage, checkFuelSave, MATERIALS, BIOME_YIELDS } from './ship.js';
import { initEncounters, rollEncounter, resolveChoice, getDailyStatus, claimDailyReward } from './encounters.js';
import { initCrafting, RECIPES, EXPEDITION_TEMPLATES, canCraft, craft, startExpedition, collectExpeditions, getActiveExpeditions, isFeatureUnlocked } from './crafting.js';
import { initAddiction, gachaPull, gachaMultiPull, getGachaState, GACHA_COST, GACHA_MULTI_COST, doPrestige, calculatePrestigeReward, buyPrestigePerk, getPrestigeState, hasPrestigePerk, calculateOfflineProgress, touchOnlineTime, getLeaderboard, getCurrentEvent, getEventTimeRemaining, PRESTIGE_PERKS } from './addiction.js';
import { initCollection, recordDiscovery, recordMining, recordCraft, recordExpedition, recordGachaPulls, getCollectionStats, getBestiary, getExplorerTitle } from './collection.js';
import { initMarket, tickMarket, getMarketData, sellMaterial, buyMaterial, getPrice, getTrendIndicator, recordMining as recordMarketMining } from './market.js';
import { initBeacons, leaveBeacon, getBeacon, rateBeacon, getPresetMessages, createBeaconMesh, animateBeacon } from './beacons.js';
import { initOutpostLogistics, registerOutpost, tickOutposts, collectOutpostProduction, getOutpostRegistry, getActiveOutpostCount } from './outpost.js';
import { initInput, InputState } from './input.js';
import { initSettings } from './settings.js';
import { updateControls } from './controls.js';
import { initPlanetSurface, enterPlanet, leavePlanet, updatePlanetSurface, getGameMode, getAltitude, getCurrentPlanetData } from './planet_surface.js';
import { initMining, updateMining, cleanupMining, fireMiningLaser } from './mining.js';
import { initFPSController, updateFPSController, enableFPS, disableFPS, isFPSActive } from './fps_controller.js';

import * as THREE from 'three';
import { store } from './store.js';

// ─── State ───
let wasmModule = null;

// ─── Lifecycle ───

export async function boot() {
    updateLoadingStatus('Cargando motor WASM...');
    setLoadingProgress(10);

    try {
        const wasm = await import('../procedural_engine/pkg/procedural_engine.js');
        await wasm.default();
        wasmModule = wasm;
        updateLoadingStatus('Motor WASM inicializado ✓');
        setLoadingProgress(40);
    } catch (err) {
        updateLoadingStatus(`Error WASM: ${err.message}`);
        console.error('[BOOT] WASM init failed:', err);
        return;
    }

    updateLoadingStatus('Inicializando escena 3D (auto-detect)...');
    setLoadingProgress(60);

    const container = document.getElementById('canvas-container');
    initScene(container, 'auto');
    setLoadingProgress(80);

    initUI();
    initGameplay();
    initShip();
    initEncounters();
    initCrafting();
    initAddiction();
    initCollection();
    initMarket();
    initBeacons();
    initOutpostLogistics();
    initInput();
    initSettings();
    initPlanetSurface(getScene(), getCamera(), getRenderer());
    initMining(getScene(), getCamera());
    initFPSController(getCamera());
    
    // Load persistent stats
    try {
        const stats = JSON.parse(localStorage.getItem('cartografia_stats') || '{}');
        store.dispatch({ type: 'OVERRIDE_STATE', payload: { totalQuarksEarned: stats.totalQuarksEarned || 0 } });
        store.dispatch({ type: 'OVERRIDE_STATE', payload: { sectorsExplored: stats.sectorsExplored || 0 } });
    } catch(e) {}
    
    updateResources(store.getState().quarks, store.getState().fuel);
    updateHullDisplay();
    setLoadingProgress(90);

    createNebula(getScene());
    bindEvents();

    updateLoadingStatus('Escaneando sector inicial...');
    setLoadingProgress(95);
    await generateSector(1500, -450, 0, false);

    setLoadingProgress(100);
    updateLoadingStatus('Bienvenido, Explorador.');

    // Check daily reward on boot
    setTimeout(() => {
        const daily = getDailyStatus();
        if (daily.available) {
            showNotification('📅 ¡Recompensa Diaria!', 'Toca 📅 para reclamar.', 'uncommon');
        }
    }, 2000);

    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        showHUD();

        // Check offline progress
        const offline = calculateOfflineProgress();
        if (offline) {
            store.dispatch({ type: 'ADD_QUARKS', payload: offline.quarks });
            store.dispatch({ type: 'ADD_FUEL', payload: offline.fuel });
            updateResources(store.getState().quarks, store.getState().fuel);
            showOfflineModal(offline);
        }

        // Start event banner timer
        setInterval(() => {
            const eventInfo = getEventTimeRemaining();
            updateEventHUD(eventInfo);
        }, 1000);
        updateEventHUD(getEventTimeRemaining());
        
        // Show current explorer level
        updateXPDisplay();
    }, 800);

    let lastTime = performance.now();
    let totalTime = 0;

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        totalTime += delta;

        const currentMode = getGameMode();

        // Planet surface mode — update chunks and terrain
        if (currentMode !== 'SPACE') {
            if (InputState.fire) {
                fireMiningLaser();
            }
            updatePlanetSurface(delta);
            updateMining(delta);
            
            // Update planet HUD
            const altEl = document.getElementById('planet-altitude');
            if (altEl) {
                const alt = getAltitude(getCamera());
                altEl.textContent = `${Math.round(alt)}m`;
            }
        }

        if (!isWarping() && currentMode === 'SPACE') {
            animatePlanets(delta);
            animateRuins(delta, totalTime);
            animateNebula(delta);

            // Animate beacons in the scene
            const scene = getScene();
            if (scene) {
                scene.traverse((child) => {
                    if (child.userData && child.userData.isBeacon) {
                        animateBeacon(child, delta);
                    }
                    // Rotate outposts slowly
                    if (child.userData && child.userData.isOutpost) {
                        child.rotation.y += delta * 0.1;
                    }
                });
            }
        }
        
        // Update controls based on current mode
        const isFPS = isFPSActive();
        if (currentMode !== 'SPACE' && isFPS) {
            updateFPSController(delta);
        } else {
            updateControls(delta);
        }
        
        renderFrame(delta);
    }
    animate();

    console.log('[BOOT] Cartografía de lo Infinito — Online');
}

// ─── Sector Generation ───

async function generateSector(x, y, z, useWarp = true) {
    if (store.getState().isGenerating || !wasmModule) return;
    store.dispatch({ type: 'SET_GENERATING', payload: true });

    if (store.getState().fuel <= 0 && useWarp) {
        showNotification('⛽ Sin Combustible', 'Usa la Tienda para recargar.', '');
        store.dispatch({ type: 'SET_GENERATING', payload: false });
        return;
    }

    // Check store.getState().fuel efficiency (engine upgrade can save store.getState().fuel)
    if (useWarp) {
        if (checkFuelSave()) {
            showNotification('⚡ Motor Eficiente', '¡Salto sin gastar combustible!', '');
        } else {
            store.dispatch({ type: 'SPEND_FUEL', payload: 1 });
        }
        updateResources(store.getState().quarks, store.getState().fuel);
    }

    store.dispatch({ type: 'SET_COORDS', payload: {x,y,z} });
    store.getState().miningCooldowns = {}; // Reset mining for new sector
    const scene = getScene();
    const camera = getCamera();

    const doGeneration = () => {
        clearDynamicObjects();

        const startTime = performance.now();
        const jsonStr = wasmModule.get_sector_data(BigInt(x), BigInt(y), BigInt(z));
        const elapsed = (performance.now() - startTime).toFixed(1);
        console.log(`[ENGINE] Sector (${x},${y},${z}) in ${elapsed}ms`);

        const data = JSON.parse(jsonStr);
        store.dispatch({ type: 'SET_SECTOR', payload: data });

        updateCoordinates(x, y, z, data.sector_hash);

        let dominantBiome = 'Temperate';
        if (data.star_system && data.star_system.planets.length > 0) {
            dominantBiome = data.star_system.planets[0].biome;
        }

        createTerrain(scene, data.terrain_heightmap, dominantBiome, 32);
        createPlanetSystem(scene, data.star_system);
        createRuins(scene, data.ruins);
        createNebula(scene);

        const rarity = updateSectorInfo(data, { x, y, z });

        animateCamera(
            new THREE.Vector3(0, 80, 200),
            new THREE.Vector3(0, 0, 0),
            1000
        );

        // Claim button
        const claimBtn = document.getElementById('claim-btn');
        if (claimBtn) {
            claimBtn.style.display = 'block';
            if (isSectorClaimed(x, y, z)) {
                claimBtn.textContent = '✅ Sector Reclamado';
                claimBtn.className = 'btn-claim claimed';
                
                // Render Outpost!
                const seed = Math.abs((x * 73856093) ^ (y * 19349663) ^ (z * 83492791));
                addOutpost(seed, 15);
            } else {
                claimBtn.textContent = '🏴 Reclamar Sector (100⚡)';
                claimBtn.className = 'btn-claim';
            }
        }

        // Warp damage (dangerous sectors)
        if (useWarp && data.sector_class === 'Anomalous') {
            const damage = 10 + Math.floor(Math.random() * 20);
            takeDamage(damage);
            showNotification('⚠ Daño Anómalo', `La anomalía daña tu casco (-${damage})`, '');
            updateHullDisplay();
        }

        // Record scan for gameplay
        const { loot } = recordScan(data, rarity);
        
        // Record for bestiary + XP
        recordDiscovery(data);

        // Tick the Galactic Market on each scan
        tickMarket();

        // Check for a beacon at this sector
        const existingBeacon = getBeacon(x, y, z);
        if (existingBeacon) {
            showNotification('📡 Baliza Detectada', `"${existingBeacon.message}" — ${existingBeacon.author}`, 'uncommon');
            const beaconMesh = createBeaconMesh(existingBeacon);
            scene.add(beaconMesh);
        }

        // Discovery feedback
        if (rarity !== 'common') {
            triggerDiscoveryBurst(scene, rarity);
            playDiscoverySound(rarity);

            const msgs = {
                uncommon: ['Sistema Interesante', 'Algo inusual aquí...'],
                rare: ['¡Descubrimiento Raro!', 'Sector con presencia precursora.'],
                epic: ['¡¡DESCUBRIMIENTO ÉPICO!!', 'Anomalía cósmica detectada.'],
                legendary: ['★ HALLAZGO LEGENDARIO ★', '¡Combinación de una en un millón!'],
            };
            const [title, desc] = msgs[rarity] || msgs.uncommon;
            showNotification(title, desc, rarity);

            if (loot && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary')) {
                setTimeout(() => {
                    showLootReveal(loot);
                    store.dispatch({ type: 'ADD_QUARKS', payload: loot.value });
                    updateResources(store.getState().quarks, store.getState().fuel);
                }, 1800);
            }
        }

        document.getElementById('coord-x').value = x;
        document.getElementById('coord-y').value = y;
        document.getElementById('coord-z').value = z;

        trackSector();
        store.dispatch({ type: 'SET_GENERATING', payload: false });
    };

    if (useWarp) {
        playScanSound();

        // Roll for encounter BEFORE warp
        const stats = getShipStats();
        const encounter = rollEncounter(stats.scannerLevel);

        if (encounter) {
            // Show encounter, then warp on resolution
            showEncounterModal(encounter, () => {
                triggerWarp(scene, camera, doGeneration);
            });
        } else {
            triggerWarp(scene, camera, doGeneration);
        }
    } else {
        doGeneration();
    }
}

// ─── Encounter UI ───

function showEncounterModal(encounter, onComplete) {
    const modal = document.getElementById('modal-encounter');
    const title = document.getElementById('encounter-title');
    const content = document.getElementById('encounter-content');
    if (!modal || !content) { onComplete(); return; }

    title.textContent = encounter.title;

    content.innerHTML = `
        <p style="color:var(--text-secondary);line-height:1.7;margin-bottom:24px;font-size:0.85rem;">${encounter.text}</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${encounter.choices.map((c, i) => `
                <button class="encounter-choice-btn" data-choice="${i}" style="
                    padding:14px 20px;background:rgba(10,10,25,0.7);border:1px solid rgba(102,126,234,0.3);
                    border-radius:10px;color:var(--text-primary);font-family:var(--font-body);font-size:0.85rem;
                    cursor:pointer;transition:all 0.25s;text-align:left;
                ">${c.label}</button>
            `).join('')}
        </div>
    `;

    modal.classList.add('active');

    // Bind choice clicks
    content.querySelectorAll('.encounter-choice-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = 'var(--color-primary)';
            btn.style.transform = 'translateX(6px)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = 'rgba(102,126,234,0.3)';
            btn.style.transform = 'translateX(0)';
        });
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.choice);
            const outcome = resolveChoice(encounter, idx);

            // Apply outcome
            if (outcome.quarks) { store.dispatch({ type: 'ADD_QUARKS', payload: outcome.quarks }); }
            if (outcome.fuel) { store.dispatch({ type: 'ADD_FUEL', payload: outcome.fuel }); }
            if (outcome.damage) {
                takeDamage(outcome.damage);
                updateHullDisplay();
            }
            if (outcome.material && outcome.materialAmt) {
                // Add materials via ship state (direct localStorage update)
                try {
                    const raw = localStorage.getItem('cartografia_ship');
                    if (raw) {
                        const state = JSON.parse(raw);
                        state.materials[outcome.material] = (state.materials[outcome.material] || 0) + outcome.materialAmt;
                        localStorage.setItem('cartografia_ship', JSON.stringify(state));
                    }
                } catch (e) { /* ok */ }
            }

            updateResources(store.getState().quarks, store.getState().fuel);

            // Show outcome
            const typeEmoji = { reward: '✅', damage: '❌', mixed: '⚠', neutral: '➡️' };
            content.innerHTML = `
                <div style="text-align:center;padding:20px 0;">
                    <div style="font-size:2.5rem;margin-bottom:16px;">${typeEmoji[outcome.type] || '➡️'}</div>
                    <p style="color:var(--text-primary);font-size:0.9rem;line-height:1.7;margin-bottom:20px;">${outcome.text}</p>
                    ${outcome.quarks ? `<div style="font-family:var(--font-mono);color:var(--color-energy);font-size:0.85rem;">${outcome.quarks > 0 ? '+' : ''}${outcome.quarks} ⚡ Quarks</div>` : ''}
                    ${outcome.damage ? `<div style="font-family:var(--font-mono);color:var(--color-danger);font-size:0.85rem;">-${outcome.damage} 🛡️ Hull</div>` : ''}
                    ${outcome.material ? `<div style="font-family:var(--font-mono);color:var(--rarity-uncommon);font-size:0.85rem;">+${outcome.materialAmt} ${MATERIALS[outcome.material]?.icon || ''} ${MATERIALS[outcome.material]?.name || outcome.material}</div>` : ''}
                    ${outcome.fuel ? `<div style="font-family:var(--font-mono);color:var(--color-energy);font-size:0.85rem;">${outcome.fuel > 0 ? '+' : ''}${outcome.fuel} 🚀 Combustible</div>` : ''}
                    <button id="encounter-continue" style="
                        margin-top:24px;padding:10px 32px;background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));
                        border:none;border-radius:8px;color:#fff;font-family:var(--font-display);font-size:0.7rem;
                        font-weight:700;letter-spacing:2px;cursor:pointer;
                    ">CONTINUAR</button>
                </div>
            `;

            document.getElementById('encounter-continue').addEventListener('click', () => {
                modal.classList.remove('active');
                onComplete();
            });
        });
    });
}

// ─── Ship UI ───

function renderShipModal() {
    const container = document.getElementById('ship-content');
    if (!container) return;

    const stats = getShipStats();
    const materials = getMaterials();

    // Hull bar
    const hullColor = stats.hullPercent > 60 ? 'var(--color-success)' : stats.hullPercent > 25 ? 'var(--color-warning)' : 'var(--color-danger)';

    let html = `
        <div style="margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-family:var(--font-display);font-size:0.6rem;letter-spacing:2px;color:var(--text-secondary);">INTEGRIDAD DEL CASCO</span>
                <span style="font-family:var(--font-mono);color:${hullColor};font-weight:700;">${stats.currentHull}/${stats.maxHull}</span>
            </div>
            <div style="height:10px;background:rgba(102,126,234,0.1);border-radius:5px;overflow:hidden;">
                <div style="height:100%;width:${stats.hullPercent}%;background:${hullColor};border-radius:5px;transition:width 0.5s;"></div>
            </div>
            <button id="repair-btn" style="
                margin-top:8px;padding:6px 16px;background:rgba(12,206,107,0.15);border:1px solid rgba(12,206,107,0.3);
                border-radius:6px;color:var(--color-success);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;
            ">🔧 Reparar (10⚡/bloque)</button>
        </div>
    `;

    // Modules
    html += `<div style="font-family:var(--font-display);font-size:0.6rem;letter-spacing:3px;color:var(--color-primary);margin-bottom:12px;">MÓDULOS</div>`;
    for (const [key, stat] of Object.entries(stats)) {
        if (!stat.name) continue; // Skip non-module entries
        const barPct = (stat.level / stat.max) * 100;
        html += `
            <div style="display:flex;align-items:center;gap:12px;padding:10px;background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:8px;margin-bottom:6px;">
                <span style="font-size:1.3rem;min-width:32px;text-align:center;">${stat.icon}</span>
                <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-primary);">${stat.name}</span>
                        <span style="font-family:var(--font-mono);font-size:0.65rem;color:var(--color-energy);">Lv.${stat.level}/${stat.max}</span>
                    </div>
                    <div style="height:4px;background:rgba(102,126,234,0.1);border-radius:2px;margin-top:4px;">
                        <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,var(--color-primary),var(--color-energy));border-radius:2px;"></div>
                    </div>
                </div>
                ${stat.isMaxed ? `<span style="font-size:0.6rem;color:var(--rarity-legendary);">MAX</span>` :
                    `<button class="upgrade-btn" data-module="${key}" style="
                        padding:4px 10px;background:rgba(102,126,234,0.15);border:1px solid rgba(102,126,234,0.3);
                        border-radius:6px;color:var(--color-primary);font-family:var(--font-mono);font-size:0.6rem;cursor:pointer;white-space:nowrap;
                    ">⬆ ${stat.nextCost}⚡</button>`
                }
            </div>
        `;
    }

    // Materials
    html += `<div style="font-family:var(--font-display);font-size:0.6rem;letter-spacing:3px;color:var(--color-primary);margin:16px 0 12px;">MATERIALES</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">`;
    for (const mat of materials) {
        html += `
            <div style="padding:8px;background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:8px;text-align:center;">
                <div style="font-size:1.3rem;">${mat.icon}</div>
                <div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-primary);margin-top:2px;">${mat.name}</div>
                <div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--color-energy);font-weight:700;">×${mat.count}</div>
            </div>
        `;
    }
    html += `</div>`;

    container.innerHTML = html;

    // Bind repair
    document.getElementById('repair-btn')?.addEventListener('click', () => {
        const result = repairHull(store.getState().quarks);
        store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
        updateResources(store.getState().quarks, store.getState().fuel);
        updateHullDisplay();
        renderShipModal(); // Refresh
    });

    // Bind upgrades
    container.querySelectorAll('.upgrade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const result = upgradeModule(btn.dataset.module, store.getState().quarks);
            if (result.success) {
                store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
                updateResources(store.getState().quarks, store.getState().fuel);
                updateHullDisplay();
                renderShipModal(); // Refresh
            }
        });
    });
}

// ─── Mining ───

function doMine(planetIndex) {
    if (!store.getState().currentSector || !store.getState().currentSector.star_system) return;
    const planet = store.getState().currentSector.star_system.planets[planetIndex];
    if (!planet) return;

    // Cooldown check (30s per planet)
    const now = Date.now();
    const lastMine = store.getState().miningCooldowns[planetIndex] || 0;
    if (now - lastMine < 30000) {
        const remaining = Math.ceil((30000 - (now - lastMine)) / 1000);
        showNotification('⏳ Enfriamiento', `Espera ${remaining}s para minar este planeta.`, '');
        return;
    }

    const result = minePlanet(planet);
    if (!result.success) return;

    store.getState().miningCooldowns[planetIndex] = now;

    // --- GAME FEEL: Sensory Juice ---
    triggerShake(1.5, 0.4);
    playScanSound();
    // --------------------------------

    // Show mining result
    const modal = document.getElementById('modal-mining');
    const content = document.getElementById('mining-reveal-content');
    if (modal && content) {
        let matHtml = '';
        for (const [matId, amt] of Object.entries(result.materials)) {
            const mat = MATERIALS[matId];
            if (mat) {
                matHtml += `<div style="font-size:1.1rem;margin:4px 0;">${mat.icon} +${amt} ${mat.name}</div>`;
            }
        }

        content.innerHTML = `
            <div class="loot-box uncommon" style="padding:32px 48px;">
                <div style="font-size:2.5rem;margin-bottom:12px;">⛏️</div>
                <div class="loot-name" style="color:var(--color-energy);">EXTRACCIÓN EXITOSA</div>
                <div style="color:var(--text-secondary);font-size:0.7rem;margin-bottom:16px;">${planet.name} · ${planet.biome}</div>
                <div style="font-family:var(--font-mono);">${matHtml}</div>
                <div class="loot-tap-hint">Toca para continuar</div>
            </div>
        `;

        modal.style.display = 'flex';
        const dismiss = () => { modal.style.display = 'none'; modal.removeEventListener('click', dismiss); };
        setTimeout(() => modal.addEventListener('click', dismiss), 400);
    }
}

// ─── Daily Rewards UI ───

function renderDailyModal() {
    const container = document.getElementById('daily-content');
    if (!container) return;

    const status = getDailyStatus();

    let html = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--color-energy);">
                🔥 Racha: ${status.streak} día${status.streak !== 1 ? 's' : ''}
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:20px;">
    `;

    for (const day of status.calendar) {
        const isCurrent = day.day === status.day && status.available;
        const isPast = day.day < status.day || (day.day === status.day && !status.available);
        const borderColor = isCurrent ? 'var(--rarity-legendary)' : isPast ? 'var(--color-success)' : 'rgba(102,126,234,0.2)';
        const bg = isCurrent ? 'rgba(255,215,0,0.08)' : isPast ? 'rgba(12,206,107,0.08)' : 'rgba(10,10,25,0.5)';

        html += `
            <div style="padding:8px 4px;background:${bg};border:1px solid ${borderColor};border-radius:8px;text-align:center;">
                <div style="font-size:0.5rem;color:var(--text-dim);font-family:var(--font-display);letter-spacing:1px;">DÍA ${day.day}</div>
                <div style="font-size:1.5rem;margin:4px 0;">${day.icon}</div>
                <div style="font-size:0.5rem;color:var(--text-secondary);font-family:var(--font-mono);">${day.label.split(' ').slice(0,2).join(' ')}</div>
                ${isPast ? '<div style="color:var(--color-success);font-size:0.7rem;">✓</div>' : ''}
            </div>
        `;
    }

    html += `</div>`;

    if (status.available) {
        html += `
            <div style="text-align:center;">
                <button id="claim-daily-btn" style="
                    padding:12px 40px;background:linear-gradient(135deg,var(--rarity-legendary),var(--color-warning));
                    border:none;border-radius:10px;color:#000;font-family:var(--font-display);font-size:0.75rem;
                    font-weight:900;letter-spacing:2px;cursor:pointer;animation:pulse 2s infinite;
                ">🎁 RECLAMAR DÍA ${status.day}</button>
            </div>
        `;
    } else {
        html += `
            <div style="text-align:center;color:var(--text-dim);font-family:var(--font-mono);font-size:0.8rem;">
                ✅ Ya reclamaste hoy. ¡Vuelve mañana!
            </div>
        `;
    }

    container.innerHTML = html;

    document.getElementById('claim-daily-btn')?.addEventListener('click', () => {
        const reward = claimDailyReward();
        if (reward) {
            if (reward.reward === 'quarks') { store.dispatch({ type: 'ADD_QUARKS', payload: reward.amount }); }
            if (reward.reward === 'fuel') { store.dispatch({ type: 'ADD_FUEL', payload: reward.amount }); }
            // Materials handled by encounter state
            if (reward.reward === 'material') {
                try {
                    const raw = localStorage.getItem('cartografia_ship');
                    if (raw) {
                        const state = JSON.parse(raw);
                        state.materials[reward.material] = (state.materials[reward.material] || 0) + reward.amount;
                        localStorage.setItem('cartografia_ship', JSON.stringify(state));
                    }
                } catch (e) { /* ok */ }
            }

            updateResources(store.getState().quarks, store.getState().fuel);
            showNotification('🎁 ¡Recompensa!', reward.label, 'legendary');

            // Update badge
            const badge = document.getElementById('daily-badge');
            if (badge) badge.style.display = 'none';

            renderDailyModal(); // Refresh
        }
    });
}

// ─── Hull Display ───

function updateHullDisplay() {
    const stats = getShipStats();
    const hullEl = document.getElementById('hull-value');
    const hullBar = document.getElementById('hull-bar-fill');
    if (hullEl) hullEl.textContent = `${stats.hullPercent}%`;
    if (hullBar) {
        hullBar.style.width = `${stats.hullPercent}%`;
        hullBar.style.background = stats.hullPercent > 60 ? 'var(--color-success)' : stats.hullPercent > 25 ? 'var(--color-warning)' : 'var(--color-danger)';
    }
}

// ─── Event Binding ───

function bindEvents() {
    // Action bar
    const actionScan = document.getElementById('action-scan');
    const coordBar = document.getElementById('coord-bar');
    const closeCoordBtn = document.getElementById('close-coord-btn');

    if (actionScan && coordBar) {
        actionScan.addEventListener('click', () => {
            coordBar.style.display = coordBar.style.display === 'none' ? 'flex' : 'none';
        });
    }
    if (closeCoordBtn && coordBar) {
        closeCoordBtn.addEventListener('click', () => coordBar.style.display = 'none');
    }

    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            const x = parseInt(document.getElementById('coord-x').value) || 0;
            const y = parseInt(document.getElementById('coord-y').value) || 0;
            const z = parseInt(document.getElementById('coord-z').value) || 0;
            coordBar.style.display = 'none';
            generateSector(x, y, z, true);
        });
    }

    // Random
    document.getElementById('action-random')?.addEventListener('click', () => {
        const rx = Math.floor(Math.random() * 20000 - 10000);
        const ry = Math.floor(Math.random() * 20000 - 10000);
        const rz = Math.floor(Math.random() * 2000 - 1000);
        document.getElementById('coord-x').value = rx;
        document.getElementById('coord-y').value = ry;
        document.getElementById('coord-z').value = rz;
        generateSector(rx, ry, rz, true);
    });

    // Ship
    document.getElementById('action-ship')?.addEventListener('click', () => {
        renderShipModal();
        document.getElementById('modal-ship').classList.add('active');
    });

    // Claim
    function doClaim() {
        const { x, y, z } = store.getState().currentCoords;
        const result = claimSector(x, y, z, store.getState().quarks);
        if (result.success) {
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
            updateResources(store.getState().quarks, store.getState().fuel);
            const claimBtn = document.getElementById('claim-btn');
            if (claimBtn) {
                claimBtn.textContent = '✅ Sector Reclamado';
                claimBtn.className = 'btn-claim claimed';
            }
            
            // Render Outpost immediately upon claiming
            const seed = Math.abs((x * 73856093) ^ (y * 19349663) ^ (z * 83492791));
            addOutpost(seed, 15);

            // Register in logistics system
            const state = store.getState();
            const dominantBiome = state.currentSector?.star_system?.planets?.[0]?.biome || 'Temperate';
            registerOutpost(x, y, z, dominantBiome);

            // Tick outposts and show alerts
            const { alerts } = tickOutposts();
            alerts.forEach(a => showNotification('⚠️ Alerta Logística', a, ''));

            showNotification('🏗️ Estación Construida', `Tu estación minera ya está operando en este sector. Produce y consume recursos.`, 'legendary');
        }
    }
    document.getElementById('action-claim')?.addEventListener('click', doClaim);
    document.getElementById('claim-btn')?.addEventListener('click', doClaim);

    // Codex, Missions, Shop, Achievements
    document.getElementById('action-codex')?.addEventListener('click', () => openModal('modal-codex'));
    document.getElementById('action-missions')?.addEventListener('click', () => openModal('modal-missions'));
    document.getElementById('action-shop')?.addEventListener('click', () => openModal('modal-shop'));
    document.getElementById('action-achievements')?.addEventListener('click', () => openModal('modal-achievements'));

    // Daily
    document.getElementById('action-daily')?.addEventListener('click', () => {
        renderDailyModal();
        document.getElementById('modal-daily').classList.add('active');
    });

    // Crafting
    document.getElementById('action-craft')?.addEventListener('click', () => {
        renderCraftModal();
        document.getElementById('modal-craft').classList.add('active');
    });

    // Expeditions
    document.getElementById('action-expeditions')?.addEventListener('click', () => {
        renderExpeditionsModal();
        document.getElementById('modal-expeditions').classList.add('active');
    });

    // Gacha
    document.getElementById('action-gacha')?.addEventListener('click', () => {
        renderGachaModal();
        document.getElementById('modal-gacha').classList.add('active');
    });

    // Ranking
    document.getElementById('action-ranking')?.addEventListener('click', () => {
        renderRankingModal();
        document.getElementById('modal-ranking').classList.add('active');
    });

    // Prestige
    document.getElementById('action-prestige')?.addEventListener('click', () => {
        renderPrestigeModal();
        document.getElementById('modal-prestige').classList.add('active');
    });

    // Galactic Market
    document.getElementById('action-market')?.addEventListener('click', () => {
        renderMarketModal();
        document.getElementById('modal-market').classList.add('active');
    });

    // Beacon
    document.getElementById('action-beacon')?.addEventListener('click', () => {
        renderBeaconModal();
        document.getElementById('modal-beacon').classList.add('active');
    });

    // Shop purchase event
    document.addEventListener('shop-purchase', (e) => {
        const result = shopPurchase(e.detail.itemId, store.getState().quarks, store.getState().fuel);
        store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
        store.dispatch({ type: 'OVERRIDE_STATE', payload: { fuel: result.fuel } });
        updateResources(store.getState().quarks, store.getState().fuel);
    });

    // Planet mining — delegate to planet cards
    document.addEventListener('click', (e) => {
        const planetCard = e.target.closest('.planet-card[data-planet-index]');
        if (planetCard) {
            const idx = parseInt(planetCard.dataset.planetIndex);
            // If they clicked the land button specifically, enter the planet
            if (e.target.closest('.btn-land-planet')) {
                const sectorData = store.getState().currentSector;
                if (sectorData && sectorData.star_system && sectorData.star_system.planets[idx]) {
                    const planet = sectorData.star_system.planets[idx];
                    const { x, y, z } = store.getState().currentCoords;
                    enterPlanet({
                        biome: planet.biome,
                        name: planet.name || `Planeta ${idx + 1}`,
                        seed: Math.abs((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (idx * 12345)),
                        radius: planet.radius || 5,
                        index: idx,
                    });
                }
            } else {
                doMine(idx);
            }
        }
    });

    // Listen for planet mode changes to toggle HUD
    window.addEventListener('planet-mode', (e) => {
        const { type } = e.detail;
        const spaceHud = document.getElementById('hud-bar');
        const planetHud = document.getElementById('planet-hud');
        const crosshair = document.getElementById('crosshair');
        
        if (type === 'enter') {
            if (spaceHud) spaceHud.style.opacity = '0.3';
            if (planetHud) planetHud.style.display = 'flex';
            if (crosshair) crosshair.style.display = 'block';
            const biomeLabel = document.getElementById('planet-biome-label');
            if (biomeLabel && e.detail.data) biomeLabel.textContent = e.detail.data.biome;
            showNotification('🌍 Entrada Atmosférica', `Descendiendo a la superficie de ${e.detail.data?.name || 'planeta desconocido'}...`, 'legendary');
        } else if (type === 'leave') {
            if (spaceHud) spaceHud.style.opacity = '1';
            if (planetHud) planetHud.style.display = 'none';
            if (crosshair) crosshair.style.display = 'none';
            showNotification('🚀 Órbita Alcanzada', `Regresando al sistema estelar`, '');
        }
    });

    // Enter key in coords
    document.querySelectorAll('.nav-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const x = parseInt(document.getElementById('coord-x').value) || 0;
                const y = parseInt(document.getElementById('coord-y').value) || 0;
                const z = parseInt(document.getElementById('coord-z').value) || 0;
                coordBar.style.display = 'none';
                generateSector(x, y, z, true);
            }
        });
    });

    // Quality
    const qualityBtn = document.getElementById('quality-btn');
    if (qualityBtn) {
        const levels = ['low', 'medium', 'high'];
        let idx = 2;
        qualityBtn.addEventListener('click', () => {
            idx = (idx + 1) % levels.length;
            setQuality(levels[idx]);
            qualityBtn.textContent = `⚙ ${levels[idx].toUpperCase()}`;
        });
    }

    // Volume
    document.getElementById('volume-btn')?.addEventListener('click', () => {
        initAudio();
        const muted = toggleMute();
        document.getElementById('volume-btn').textContent = muted ? '🔇' : '🔊';
        if (!muted) playAmbient();
    });

    // Audio activation
    document.addEventListener('click', function start() {
        initAudio();
        playAmbient();
        document.removeEventListener('click', start);
    }, { once: true });

    // Modal close buttons (including new modals)
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById(btn.dataset.close);
            if (modal) modal.classList.remove('active');
        });
    });

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

// ─── Utilities ───

function detectQuality() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 'low';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
            if (renderer.includes('intel') || renderer.includes('mesa') || renderer.includes('swiftshader')) return 'medium';
        }
        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (maxTex < 4096) return 'low';
        if (maxTex < 8192) return 'medium';
        return 'high';
    } catch (e) { return 'medium'; }
}

function updateLoadingStatus(msg) {
    const el = document.querySelector('.loading-status');
    if (el) el.textContent = msg;
}

function setLoadingProgress(pct) {
    const el = document.querySelector('.loading-bar-fill');
    if (el) el.style.width = pct + '%';
}

// ─── Crafting Modal ───

function renderCraftModal() {
    const container = document.getElementById('craft-content');
    if (!container) return;

    const materials = getMaterials();
    const matMap = {};
    materials.forEach(m => matMap[m.id] = m.count);

    let html = `
        <div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--text-dim);margin-bottom:12px;">MATERIALES DISPONIBLES</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
            ${materials.map(m => `
                <span style="padding:3px 8px;background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:6px;font-family:var(--font-mono);font-size:0.6rem;color:${m.count > 0 ? 'var(--color-energy)' : 'var(--text-dim)'};">
                    ${m.icon} ×${m.count}
                </span>
            `).join('')}
        </div>
        <div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--color-primary);margin-bottom:12px;">RECETAS</div>
    `;

    for (const [id, recipe] of Object.entries(RECIPES)) {
        const craftable = canCraft(id, matMap);
        const borderColor = craftable ? `var(--rarity-${recipe.rarity})` : 'rgba(102,126,234,0.1)';
        const opacity = craftable ? '1' : '0.5';

        html += `
            <div style="display:flex;align-items:center;gap:12px;padding:10px;background:rgba(10,10,25,0.5);border:1px solid ${borderColor};border-radius:8px;margin-bottom:6px;opacity:${opacity};">
                <span style="font-size:1.5rem;min-width:36px;text-align:center;">${recipe.icon}</span>
                <div style="flex:1;">
                    <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-primary);">${recipe.name}</div>
                    <div style="font-size:0.6rem;color:var(--text-secondary);margin-top:2px;">${recipe.desc}</div>
                    <div style="font-size:0.55rem;color:var(--text-dim);margin-top:4px;">
                        ${Object.entries(recipe.materials).map(([mat, amt]) => {
                            const have = matMap[mat] || 0;
                            const color = have >= amt ? 'var(--color-success)' : 'var(--color-danger)';
                            return `<span style="color:${color};">${MATERIALS[mat]?.icon || ''} ${have}/${amt}</span>`;
                        }).join(' · ')}
                    </div>
                </div>
                ${craftable ? `<button class="craft-btn" data-recipe="${id}" style="
                    padding:6px 14px;background:rgba(102,126,234,0.15);border:1px solid var(--color-primary);
                    border-radius:6px;color:var(--color-primary);font-family:var(--font-mono);font-size:0.6rem;cursor:pointer;white-space:nowrap;
                ">⚒ CRAFT</button>` : ''}
            </div>
        `;
    }

    container.innerHTML = html;

    // Bind craft buttons
    container.querySelectorAll('.craft-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const shipRaw = localStorage.getItem('cartografia_ship');
            if (!shipRaw) return;
            const shipState = JSON.parse(shipRaw);
            const result = craft(btn.dataset.recipe, shipState.materials);
            if (result) {
                localStorage.setItem('cartografia_ship', JSON.stringify(shipState));
                // Apply result
                if (result.result.type === 'fuel') { store.dispatch({ type: 'ADD_FUEL', payload: result.result.amount }); }
                if (result.result.type === 'repair') {
                    shipState.currentHull = 999; // Max repair, will clamp
                    localStorage.setItem('cartografia_ship', JSON.stringify(shipState));
                }
                if (result.result.quarks) { store.dispatch({ type: 'ADD_QUARKS', payload: result.result.quarks }); }
                updateResources(store.getState().quarks, store.getState().fuel);
                updateHullDisplay();
                renderCraftModal(); // Refresh
            }
        });
    });
}

// ─── Expeditions Modal ───

function renderExpeditionsModal() {
    const container = document.getElementById('expeditions-content');
    if (!container) return;

    // Collect completed first
    const completed = collectExpeditions();
    if (completed.length > 0) {
        completed.forEach(c => {
            store.dispatch({ type: 'ADD_QUARKS', payload: c.quarks });
            // Add materials
            try {
                const raw = localStorage.getItem('cartografia_ship');
                if (raw) {
                    const state = JSON.parse(raw);
                    for (const [mat, amt] of Object.entries(c.materials)) {
                        state.materials[mat] = (state.materials[mat] || 0) + amt;
                    }
                    localStorage.setItem('cartografia_ship', JSON.stringify(state));
                }
            } catch (e) { /* ok */ }
            showNotification('🛰️ Expedición Completa', `${c.template.icon} +${c.quarks}⚡`, 'uncommon');
        });
        updateResources(store.getState().quarks, store.getState().fuel);
    }

    const active = getActiveExpeditions();

    let html = '';

    // Active expeditions
    if (active.length > 0) {
        html += `<div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--color-energy);margin-bottom:10px;">EXPEDICIONES ACTIVAS (${active.length}/3)</div>`;
        active.forEach(exp => {
            const pct = (exp.progress * 100).toFixed(0);
            const mins = Math.floor(exp.remaining / 60000);
            const secs = Math.floor((exp.remaining % 60000) / 1000);
            html += `
                <div style="padding:10px;background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.2);border-radius:8px;margin-bottom:6px;">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:var(--font-mono);font-size:0.7rem;">${exp.template.icon} ${exp.template.name}</span>
                        <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--color-energy);">${mins}:${secs.toString().padStart(2,'0')}</span>
                    </div>
                    <div style="height:4px;background:rgba(102,126,234,0.1);border-radius:2px;margin-top:6px;">
                        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--color-primary),var(--color-energy));border-radius:2px;transition:width 1s;"></div>
                    </div>
                </div>
            `;
        });
        html += `<hr style="border:none;border-top:1px solid rgba(102,126,234,0.1);margin:14px 0;">`;
    }

    // Available expeditions
    html += `<div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--color-primary);margin-bottom:10px;">MISIONES DISPONIBLES</div>`;

    EXPEDITION_TEMPLATES.forEach(template => {
        const locked = template.requiresUnlock && !isFeatureUnlocked(template.requiresUnlock);
        const canAfford = store.getState().fuel >= template.cost.fuel;
        const canStart = !locked && canAfford && active.length < 3;
        const borderColor = canStart ? `var(--rarity-${template.rarity})` : 'rgba(102,126,234,0.1)';
        const durationMin = Math.floor(template.duration / 60);
        const durationSec = template.duration % 60;

        html += `
            <div style="padding:10px;background:rgba(10,10,25,0.5);border:1px solid ${borderColor};border-radius:8px;margin-bottom:6px;${locked ? 'opacity:0.4;' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-primary);">
                            ${locked ? '🔒 ' : ''}${template.icon} ${template.name}
                        </div>
                        <div style="font-size:0.6rem;color:var(--text-secondary);margin-top:2px;">${template.desc}</div>
                        <div style="font-size:0.55rem;color:var(--text-dim);margin-top:4px;">
                            ⏱ ${durationMin > 0 ? durationMin + 'm' : ''}${durationSec > 0 ? durationSec + 's' : ''} · ⛽ ${template.cost.fuel}
                        </div>
                    </div>
                    ${canStart ? `<button class="expedition-btn" data-template="${template.id}" style="
                        padding:6px 14px;background:rgba(102,126,234,0.15);border:1px solid var(--color-primary);
                        border-radius:6px;color:var(--color-primary);font-family:var(--font-mono);font-size:0.6rem;cursor:pointer;white-space:nowrap;
                    ">🚀 ENVIAR</button>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind expedition buttons
    container.querySelectorAll('.expedition-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const result = startExpedition(btn.dataset.template, store.getState().fuel);
            if (result.success) {
                store.dispatch({ type: 'OVERRIDE_STATE', payload: { fuel: result.fuel } });
                updateResources(store.getState().quarks, store.getState().fuel);
                renderExpeditionsModal(); // Refresh
            }
        });
    });
}

// Expedition check timer — updates badge when expeditions complete
setInterval(() => {
    const active = getActiveExpeditions();
    const badge = document.getElementById('expeditions-badge');
    const hasCompleted = active.some(e => e.progress >= 1);
    if (badge) badge.style.display = hasCompleted ? '' : 'none';
}, 30000);

// ─── Track Stats ───

function trackQuarks(amount) {
    // The store's ADD_QUARKS reducer already increments totalQuarksEarned
    // saveStats is handled by the store's auto-persist
    saveStats();
}

function trackSector() {
    store.dispatch({ type: 'INCREMENT_EXPLORED' });
    saveStats();
    touchOnlineTime();
    updateXPDisplay();
}

function updateXPDisplay() {
    const stats = getCollectionStats();
    const icon = document.getElementById('xp-title-icon');
    const text = document.getElementById('xp-title-text');
    const bar = document.getElementById('xp-bar-fill');
    if (icon) icon.textContent = stats.titleIcon;
    if (text) text.textContent = `${stats.title} Lv.${stats.level}`;
    if (bar) bar.style.width = `${(stats.xpProgress * 100).toFixed(0)}%`;
}

function saveStats() {
    try {
        localStorage.setItem('cartografia_stats', JSON.stringify({ totalQuarksEarned: store.getState().totalQuarksEarned, sectorsExplored: store.getState().sectorsExplored }));
    } catch(e) {}
}

// ─── Gacha Modal ───

function renderGachaModal() {
    const container = document.getElementById('gacha-content');
    if (!container) return;

    const state = getGachaState();
    const event = getCurrentEvent();
    const discount = event?.effects?.gachaDiscount || 0;
    const cost1 = Math.floor(GACHA_COST * (1 - discount));
    const cost5 = Math.floor(GACHA_MULTI_COST * (1 - discount));

    let html = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2rem;margin-bottom:8px;">🎰</div>
            <div style="font-family:var(--font-display);font-size:0.8rem;color:var(--text-primary);">BANNER ESTELAR</div>
            <div style="font-size:0.6rem;color:var(--text-secondary);margin-top:4px;">Gasta Quarks por recompensas aleatorias</div>
            ${discount > 0 ? `<div style="font-size:0.6rem;color:var(--color-warning);margin-top:4px;">🎉 ¡${(discount*100).toFixed(0)}% DESCUENTO ACTIVO!</div>` : ''}
        </div>

        <!-- Pity counter -->
        <div style="background:rgba(10,10,25,0.5);border:var(--border-subtle);border-radius:8px;padding:8px 12px;margin-bottom:14px;text-align:center;">
            <div style="font-size:0.55rem;color:var(--text-dim);letter-spacing:1px;">PITY: ÉPICO+ GARANTIZADO</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                <div style="flex:1;height:6px;background:rgba(102,126,234,0.1);border-radius:3px;">
                    <div style="height:100%;width:${(state.pityCounter / state.pityThreshold * 100).toFixed(0)}%;background:linear-gradient(90deg,var(--rarity-rare),var(--rarity-epic));border-radius:3px;transition:width 0.5s;"></div>
                </div>
                <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--color-energy);">${state.pityCounter}/${state.pityThreshold}</span>
            </div>
        </div>

        <!-- Pull buttons -->
        <div style="display:flex;gap:10px;margin-bottom:16px;">
            <button id="gacha-pull-1" style="
                flex:1;padding:12px;background:linear-gradient(135deg,rgba(102,126,234,0.2),rgba(118,75,162,0.2));
                border:1px solid var(--color-primary);border-radius:10px;color:var(--text-primary);
                font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;text-align:center;
            ">
                <div style="font-size:1.2rem;">🎲</div>
                <div>×1 Pull</div>
                <div style="font-size:0.6rem;color:var(--color-energy);margin-top:4px;">${cost1}⚡</div>
            </button>
            <button id="gacha-pull-5" style="
                flex:1;padding:12px;background:linear-gradient(135deg,rgba(199,146,234,0.2),rgba(255,215,0,0.1));
                border:1px solid var(--rarity-epic);border-radius:10px;color:var(--text-primary);
                font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;text-align:center;
            ">
                <div style="font-size:1.2rem;">✨</div>
                <div>×5 Pull</div>
                <div style="font-size:0.6rem;color:var(--color-energy);margin-top:4px;">${cost5}⚡ <span style="color:var(--color-success);font-size:0.5rem;">(AHORRA ${cost1*5 - cost5})</span></div>
            </button>
        </div>

        <!-- Rate info -->
        <div style="font-size:0.5rem;color:var(--text-dim);text-align:center;margin-bottom:14px;">
            ⚡ Common 60% · 💎 Uncommon 25% · ⚛️ Raro 10% · 🌑 Épico 4% · 👑 Legendario 1%
        </div>

        <!-- History -->
        <div style="font-family:var(--font-display);font-size:0.5rem;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px;">HISTORIAL (${state.totalPulls} pulls totales)</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${(state.history || []).slice(0, 15).map(item => `
                <span style="padding:2px 6px;background:rgba(10,10,25,0.5);border:1px solid var(--rarity-${item.rarity});border-radius:4px;font-size:0.55rem;">
                    ${item.icon}
                </span>
            `).join('')}
        </div>
    `;

    container.innerHTML = html;

    // Bind pull buttons
    document.getElementById('gacha-pull-1')?.addEventListener('click', () => {
        const result = gachaPull(store.getState().quarks);
        if (result.item) {
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
            updateResources(store.getState().quarks, store.getState().fuel);
            applyGachaReward(result.item);
            showGachaReveal([result.item]);
        } else {
            showNotification('❌ Quarks insuficientes', `Necesitas ${cost1}⚡`, '');
        }
    });

    document.getElementById('gacha-pull-5')?.addEventListener('click', () => {
        const result = gachaMultiPull(store.getState().quarks);
        if (result.items) {
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: result.quarks } });
            updateResources(store.getState().quarks, store.getState().fuel);
            result.items.forEach(item => applyGachaReward(item));
            showGachaReveal(result.items);
        } else {
            showNotification('❌ Quarks insuficientes', `Necesitas ${cost5}⚡`, '');
        }
    });
}

function applyGachaReward(item) {
    if (item.reward.quarks) {
        store.dispatch({ type: 'ADD_QUARKS', payload: item.reward.quarks });
        trackQuarks(item.reward.quarks);
    }
    if (item.reward.fuel) store.dispatch({ type: 'ADD_FUEL', payload: item.reward.fuel });
    if (item.reward.material) {
        try {
            const raw = localStorage.getItem('cartografia_ship');
            if (raw) {
                const state = JSON.parse(raw);
                state.materials[item.reward.material] = (state.materials[item.reward.material] || 0) + item.reward.amount;
                localStorage.setItem('cartografia_ship', JSON.stringify(state));
            }
        } catch(e) {}
    }
    if (item.reward.hullBoost) {
        try {
            const raw = localStorage.getItem('cartografia_ship');
            if (raw) {
                const state = JSON.parse(raw);
                state.maxHull = (state.maxHull || 100) + item.reward.hullBoost;
                localStorage.setItem('cartografia_ship', JSON.stringify(state));
            }
        } catch(e) {}
    }
    updateResources(store.getState().quarks, store.getState().fuel);
}

function showGachaReveal(items) {
    const overlay = document.getElementById('modal-gacha-reveal');
    const content = document.getElementById('gacha-reveal-content');
    if (!overlay || !content) return;

    const bestRarity = items.reduce((best, item) => {
        const order = ['common','uncommon','rare','epic','legendary','mythic'];
        return order.indexOf(item.rarity) > order.indexOf(best) ? item.rarity : best;
    }, 'common');

    // --- GAME FEEL: Sensory Juice ---
    triggerConfetti(bestRarity);
    playDiscoverySound(bestRarity);
    // --------------------------------

    content.innerHTML = `
        <div style="text-align:center;animation:fadeInUp 0.6s ease;">
            <div style="font-size:0.6rem;color:var(--text-dim);letter-spacing:2px;margin-bottom:12px;">RESULTADOS</div>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-bottom:20px;">
                ${items.map(item => `
                    <div style="padding:12px;background:rgba(10,10,25,0.7);border:2px solid var(--rarity-${item.rarity});border-radius:10px;min-width:70px;text-align:center;animation:bounceIn 0.5s ease ${Math.random()*0.3}s both;">
                        <div style="font-size:1.8rem;">${item.icon}</div>
                        <div style="font-family:var(--font-mono);font-size:0.55rem;color:var(--rarity-${item.rarity});margin-top:4px;">${item.name}</div>
                        <div style="font-size:0.45rem;text-transform:uppercase;color:var(--rarity-${item.rarity});margin-top:2px;">${item.rarity}</div>
                    </div>
                `).join('')}
            </div>
            <button id="gacha-reveal-close" style="
                padding:10px 30px;background:rgba(102,126,234,0.2);border:1px solid var(--color-primary);
                border-radius:8px;color:var(--color-primary);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;
            ">CONTINUAR</button>
        </div>
    `;

    overlay.style.display = 'flex';
    overlay.classList.add('active');

    document.getElementById('gacha-reveal-close')?.addEventListener('click', () => {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
        renderGachaModal(); // Refresh main modal
    });
}

// ─── Ranking Modal ───

function renderRankingModal() {
    const container = document.getElementById('ranking-content');
    if (!container) return;

    const board = getLeaderboard('TÚ', store.getState().sectorsExplored, store.getState().totalQuarksEarned);

    let html = `
        <div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--color-primary);margin-bottom:12px;text-align:center;">RANKING GLOBAL DE EXPLORADORES</div>
    `;

    board.forEach(entry => {
        const isMe = entry.isPlayer;
        const bg = isMe ? 'rgba(102,126,234,0.15)' : 'rgba(10,10,25,0.5)';
        const border = isMe ? 'var(--color-primary)' : 'rgba(102,126,234,0.1)';
        const medals = ['🥇','🥈','🥉'];
        const medal = entry.rank <= 3 ? medals[entry.rank-1] : `#${entry.rank}`;

        html += `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:${bg};border:1px solid ${border};border-radius:8px;margin-bottom:4px;${isMe ? 'box-shadow:0 0 10px rgba(102,126,234,0.3);' : ''}">
                <span style="font-size:${entry.rank <= 3 ? '1.2rem' : '0.7rem'};min-width:30px;text-align:center;font-family:var(--font-mono);color:var(--text-dim);">${medal}</span>
                <span style="font-size:0.8rem;min-width:20px;">${entry.flag}</span>
                <div style="flex:1;">
                    <div style="font-family:var(--font-mono);font-size:0.7rem;color:${isMe ? 'var(--color-energy)' : 'var(--text-primary)'};">${entry.name}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-secondary);">${entry.sectors} sectores</div>
                    <div style="font-family:var(--font-mono);font-size:0.5rem;color:var(--text-dim);">${(entry.quarks/1000).toFixed(1)}K⚡</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ─── Prestige Modal ───

function renderPrestigeModal() {
    const container = document.getElementById('prestige-content');
    if (!container) return;

    const state = getPrestigeState();
    const previewReward = calculatePrestigeReward(store.getState().totalQuarksEarned, store.getState().sectorsExplored);

    let html = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:2rem;">✨</div>
            <div style="font-family:var(--font-display);font-size:0.8rem;color:var(--rarity-legendary);">ASCENSIÓN Lv.${state.level}</div>
            <div style="font-size:0.6rem;color:var(--text-secondary);margin-top:4px;">Reinicia tu progreso. Conserva Stardust y mejoras permanentes.</div>
            <div style="font-family:var(--font-mono);font-size:0.9rem;color:var(--color-energy);margin-top:8px;">✦ ${state.stardust} Stardust</div>
            <div style="font-size:0.55rem;color:var(--rarity-epic);margin-top:4px;">Multiplicador Global: x${state.multiplier.toFixed(2)}</div>
        </div>

        <!-- Ascend Button -->
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:0.55rem;color:var(--text-dim);margin-bottom:6px;">Ascender ahora ganaría:</div>
            <div style="font-family:var(--font-mono);font-size:1rem;color:var(--rarity-legendary);">+${previewReward} ✦</div>
            <button id="prestige-ascend" style="
                margin-top:10px;padding:10px 30px;background:linear-gradient(135deg,rgba(255,215,0,0.2),rgba(199,146,234,0.2));
                border:1px solid var(--rarity-legendary);border-radius:10px;color:var(--rarity-legendary);
                font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;
            ">⚡ ASCENDER</button>
            <div style="font-size:0.45rem;color:var(--color-danger);margin-top:6px;">⚠ Pierdes Quarks, Combustible y Materiales</div>
        </div>

        <hr style="border:none;border-top:1px solid rgba(102,126,234,0.1);margin:14px 0;">

        <!-- Perks -->
        <div style="font-family:var(--font-display);font-size:0.55rem;letter-spacing:2px;color:var(--color-primary);margin-bottom:10px;">MEJORAS PERMANENTES</div>
    `;

    state.availablePerks.forEach(perk => {
        const canBuy = !perk.owned && state.stardust >= perk.cost;
        const border = perk.owned ? 'var(--color-success)' : canBuy ? 'var(--rarity-epic)' : 'rgba(102,126,234,0.1)';

        html += `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(10,10,25,0.5);border:1px solid ${border};border-radius:8px;margin-bottom:4px;${perk.owned ? 'opacity:0.6;' : ''}">
                <span style="font-size:1.3rem;">${perk.icon}</span>
                <div style="flex:1;">
                    <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-primary);">${perk.name}</div>
                    <div style="font-size:0.55rem;color:var(--text-secondary);">${perk.desc}</div>
                </div>
                ${perk.owned ? '<span style="font-size:0.55rem;color:var(--color-success);">✓ ACTIVO</span>' :
                  canBuy ? `<button class="perk-buy-btn" data-perk="${perk.id}" style="
                    padding:4px 10px;background:rgba(199,146,234,0.15);border:1px solid var(--rarity-epic);
                    border-radius:6px;color:var(--rarity-epic);font-family:var(--font-mono);font-size:0.55rem;cursor:pointer;
                ">${perk.cost}✦</button>` :
                  `<span style="font-size:0.55rem;color:var(--text-dim);">${perk.cost}✦</span>`}
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind ascend
    document.getElementById('prestige-ascend')?.addEventListener('click', () => {
        if (confirm('⚠ ¿ASCENDER?\n\nPerderás TODO tu progreso actual.\nGanarás +' + previewReward + ' Stardust y un multiplicador permanente.')) {
            const result = doPrestige(store.getState().totalQuarksEarned, store.getState().sectorsExplored);
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { quarks: hasPrestigePerk('mega_start') ? 1000 : 500 } });
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { fuel: hasPrestigePerk('mega_start') ? 50 : 20 } });
            store.dispatch({ type: 'OVERRIDE_STATE', payload: { totalQuarksEarned: 0 } });
            // Reset ship
            localStorage.removeItem('cartografia_ship');
            initShip();
            updateResources(store.getState().quarks, store.getState().fuel);
            updateHullDisplay();
            saveStats();
            showNotification('✨ ¡ASCENSIÓN!', `Nivel ${result.newLevel} · +${result.stardustGained}✦ · x${result.multiplier.toFixed(2)}`, 'legendary');
            renderPrestigeModal();
        }
    });

    // Bind perk purchases
    container.querySelectorAll('.perk-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (buyPrestigePerk(btn.dataset.perk)) {
                renderPrestigeModal();
            }
        });
    });
}

// ─── Offline Progress Modal ───

function showOfflineModal(offline) {
    const overlay = document.getElementById('modal-offline');
    const content = document.getElementById('offline-content');
    if (!overlay || !content) return;

    content.innerHTML = `
        <div style="text-align:center;animation:fadeInUp 0.6s ease;">
            <div style="font-size:2.5rem;margin-bottom:10px;">🌙</div>
            <div style="font-family:var(--font-display);font-size:0.8rem;color:var(--text-primary);margin-bottom:4px;">¡BIENVENIDO DE VUELTA!</div>
            <div style="font-size:0.6rem;color:var(--text-secondary);margin-bottom:16px;">Estuviste ausente ${offline.elapsed} minutes</div>

            <div style="display:flex;justify-content:center;gap:16px;margin-bottom:20px;">
                ${offline.quarks > 0 ? `<div style="text-align:center;">
                    <div style="font-size:1.5rem;">⚡</div>
                    <div style="font-family:var(--font-mono);font-size:1rem;color:var(--color-energy);">+${offline.quarks}</div>
                    <div style="font-size:0.5rem;color:var(--text-dim);">QUARKS</div>
                </div>` : ''}
                ${offline.fuel > 0 ? `<div style="text-align:center;">
                    <div style="font-size:1.5rem;">🚀</div>
                    <div style="font-family:var(--font-mono);font-size:1rem;color:var(--color-success);">+${offline.fuel}</div>
                    <div style="font-size:0.5rem;color:var(--text-dim);">COMBUSTIBLE</div>
                </div>` : ''}
            </div>

            <button id="offline-close" style="
                padding:10px 30px;background:rgba(102,126,234,0.2);border:1px solid var(--color-primary);
                border-radius:8px;color:var(--color-primary);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;
            ">RECLAMAR</button>
        </div>
    `;

    overlay.style.display = 'flex';
    overlay.classList.add('active');

    document.getElementById('offline-close')?.addEventListener('click', () => {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
    });
}

// ─── Event Banner ───
// (Replaced by updateEventHUD in ui.js)

// ─── Market Modal Renderer ───

function renderMarketModal() {
    const el = document.getElementById('market-content');
    if (!el) return;

    const data = getMarketData();
    const materials = getMaterials();

    let html = `<div style="margin-bottom:12px;font-size:0.7rem;color:var(--text-secondary);font-family:var(--font-mono);">
        Los precios fluctúan según la actividad de minería global. ¡Compra barato, vende caro!
    </div>`;

    html += `<div style="display:grid;gap:8px;">`;

    for (const [id, mat] of Object.entries(data)) {
        const trend = getTrendIndicator(id);
        const owned = materials.find(m => m.id === id)?.count || 0;
        const sparkline = mat.history.length > 3 ? createSparkline(mat.history) : '';

        html += `
            <div class="glass-panel" style="padding:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="flex:0 0 30px;font-size:1.2rem;">${mat.icon}</div>
                <div style="flex:1;min-width:100px;">
                    <div style="font-weight:600;font-size:0.75rem;">${mat.name}</div>
                    <div style="font-size:0.65rem;color:var(--text-secondary);">
                        Tienes: <span style="color:var(--color-primary);">${owned}</span>
                    </div>
                </div>
                <div style="text-align:center;flex:0 0 70px;">
                    <div style="font-size:0.65rem;color:var(--text-secondary);">Venta</div>
                    <div style="font-weight:700;font-size:0.85rem;">${mat.sellPrice.toFixed(1)}⚡</div>
                </div>
                <div style="text-align:center;flex:0 0 40px;">
                    <span class="${trend.class}" style="font-size:0.7rem;">${trend.emoji} ${trend.text}</span>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="btn-sell-market" data-mat="${id}" style="
                        padding:4px 8px;background:rgba(255,80,80,0.2);border:1px solid rgba(255,80,80,0.4);
                        border-radius:4px;color:#ff8888;font-size:0.6rem;cursor:pointer;font-family:var(--font-mono);
                    ">VENDER</button>
                    <button class="btn-buy-market" data-mat="${id}" style="
                        padding:4px 8px;background:rgba(80,200,80,0.2);border:1px solid rgba(80,200,80,0.4);
                        border-radius:4px;color:#88ff88;font-size:0.6rem;cursor:pointer;font-family:var(--font-mono);
                    ">COMPRAR</button>
                </div>
            </div>
        `;
    }
    html += `</div>`;

    el.innerHTML = html;

    // Bind sell/buy buttons
    el.querySelectorAll('.btn-sell-market').forEach(btn => {
        btn.addEventListener('click', () => {
            const matId = btn.dataset.mat;
            const shipMats = {};
            getMaterials().forEach(m => { shipMats[m.id] = m.count; });
            const result = sellMaterial(matId, 1, shipMats);
            if (result.success) {
                store.dispatch({ type: 'ADD_QUARKS', payload: result.quarksGained });
                updateResources(store.getState().quarks, store.getState().fuel);
                renderMarketModal(); // Refresh
            }
        });
    });

    el.querySelectorAll('.btn-buy-market').forEach(btn => {
        btn.addEventListener('click', () => {
            const matId = btn.dataset.mat;
            const shipMats = {};
            getMaterials().forEach(m => { shipMats[m.id] = m.count; });
            const result = buyMaterial(matId, 1, store.getState().quarks, shipMats);
            if (result.success) {
                store.dispatch({ type: 'ADD_QUARKS', payload: -result.quarksSpent });
                updateResources(store.getState().quarks, store.getState().fuel);
                renderMarketModal(); // Refresh
            }
        });
    });
}

function createSparkline(data) {
    // Simple text sparkline
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const chars = '▁▂▃▄▅▆▇█';
    return data.slice(-8).map(v => {
        const idx = Math.floor(((v - min) / range) * (chars.length - 1));
        return chars[idx];
    }).join('');
}

// ─── Beacon Modal Renderer ───

function renderBeaconModal() {
    const el = document.getElementById('beacon-content');
    if (!el) return;

    const { x, y, z } = store.getState().currentCoords;
    const existing = getBeacon(x, y, z);
    const presets = getPresetMessages();

    let html = '';

    if (existing) {
        html += `
            <div class="glass-panel" style="padding:12px;margin-bottom:12px;">
                <div style="font-size:0.7rem;color:var(--color-primary);margin-bottom:4px;">📡 Baliza existente en este sector:</div>
                <div style="font-size:0.85rem;font-style:italic;margin-bottom:6px;">"${existing.message}"</div>
                <div style="font-size:0.6rem;color:var(--text-secondary);">— ${existing.author} | 👍 ${existing.rating}</div>
                <button id="rate-beacon-btn" style="
                    margin-top:8px;padding:4px 12px;background:rgba(102,126,234,0.2);
                    border:1px solid var(--color-primary);border-radius:4px;color:var(--color-primary);
                    font-size:0.65rem;cursor:pointer;font-family:var(--font-mono);
                ">👍 ÚTIL</button>
            </div>
        `;
    }

    html += `
        <div style="margin-bottom:10px;font-size:0.7rem;color:var(--text-secondary);">
            Deja un mensaje holográfico para futuros exploradores en <strong>[${x}, ${y}, ${z}]</strong>:
        </div>
        <div style="margin-bottom:10px;">
            <textarea id="beacon-message" maxlength="80" placeholder="Escribe tu mensaje..." style="
                width:100%;height:60px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
                border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:0.7rem;
                padding:8px;resize:none;
            "></textarea>
        </div>
        <div style="font-size:0.65rem;color:var(--text-secondary);margin-bottom:6px;">Mensajes rápidos:</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
            ${presets.map(p => `
                <button class="preset-msg" style="
                    padding:3px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
                    border-radius:12px;color:var(--text-secondary);font-size:0.55rem;cursor:pointer;
                    font-family:var(--font-mono);
                ">${p}</button>
            `).join('')}
        </div>
        <button id="leave-beacon-btn" style="
            width:100%;padding:10px;background:linear-gradient(135deg,rgba(0,170,255,0.3),rgba(0,255,204,0.3));
            border:1px solid rgba(0,255,204,0.4);border-radius:8px;color:#00ffcc;
            font-family:var(--font-mono);font-size:0.75rem;cursor:pointer;font-weight:700;
        ">📡 DEJAR BALIZA</button>
    `;

    el.innerHTML = html;

    // Preset click → fill textarea
    el.querySelectorAll('.preset-msg').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('beacon-message').value = btn.textContent.trim();
        });
    });

    // Leave beacon
    document.getElementById('leave-beacon-btn')?.addEventListener('click', () => {
        const msg = document.getElementById('beacon-message')?.value?.trim();
        if (!msg) {
            showNotification('❌ Vacío', 'Escribe un mensaje primero.', '');
            return;
        }
        const success = leaveBeacon(x, y, z, msg, getExplorerTitle());
        if (success) {
            showNotification('📡 Baliza Instalada', `Tu mensaje resuena en [${x},${y},${z}].`, 'rare');
            // Add 3D beacon to scene
            const beaconMesh = createBeaconMesh({ message: msg, author: getExplorerTitle() });
            getScene().add(beaconMesh);
            document.getElementById('modal-beacon').classList.remove('active');
        }
    });

    // Rate beacon
    document.getElementById('rate-beacon-btn')?.addEventListener('click', () => {
        rateBeacon(x, y, z);
        showNotification('👍 Valorada', 'Has valorado esta baliza.', '');
        renderBeaconModal();
    });
}
