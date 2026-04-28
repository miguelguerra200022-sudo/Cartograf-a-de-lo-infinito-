// Encounters system — Random narrative events during warp jumps.
// Each event has choices with risk/reward. Creates emotional investment.

import { showNotification } from './ui.js';

const ENCOUNTER_POOL = [
    {
        id: 'distress_signal',
        title: '📻 Señal de Socorro',
        text: 'Tu scanner detecta una señal de socorro desde un carguero averiado. Podría ser una trampa...',
        choices: [
            {
                label: '🤝 Investigar',
                outcomes: [
                    { weight: 55, type: 'reward', text: '¡Era un comerciante! Te recompensa generosamente.', quarks: 200, material: 'crystal', materialAmt: 3 },
                    { weight: 30, type: 'reward', text: 'Encuentras supervivientes con datos estelares valiosos.', quarks: 100, material: 'plasma', materialAmt: 2 },
                    { weight: 15, type: 'damage', text: '¡Era una trampa pirata! Tu casco sufre daños.', damage: 30, quarks: -50 },
                ],
            },
            {
                label: '🚀 Ignorar y seguir',
                outcomes: [
                    { weight: 100, type: 'neutral', text: 'Continúas tu viaje. A veces la prudencia es sabiduría.', quarks: 0 },
                ],
            },
        ],
    },
    {
        id: 'asteroid_field',
        title: '☄️ Campo de Asteroides',
        text: 'Un denso campo de asteroides bloquea tu ruta. Contiene minerales valiosos pero es peligroso.',
        choices: [
            {
                label: '⛏️ Atravesar minando',
                outcomes: [
                    { weight: 40, type: 'reward', text: '¡Extracción exitosa! Consigues minerales raros.', material: 'neutronium', materialAmt: 2, quarks: 50 },
                    { weight: 35, type: 'mixed', text: 'Consigues minerales pero sufres impactos.', material: 'iron', materialAmt: 4, damage: 20 },
                    { weight: 25, type: 'damage', text: '¡Colisión severa! Los minerales no valieron la pena.', damage: 45 },
                ],
            },
            {
                label: '↩️ Rodear el campo',
                outcomes: [
                    { weight: 70, type: 'neutral', text: 'Ruta segura pero gastaste combustible extra.', fuel: -1 },
                    { weight: 30, type: 'reward', text: 'Al rodear encuentras un satélite abandonado con datos.', quarks: 75 },
                ],
            },
        ],
    },
    {
        id: 'derelict_ship',
        title: '🛸 Nave Abandonada',
        text: 'Los restos de una nave de origen desconocido flotan en tu trayectoria. Los escáneres detectan energía residual.',
        choices: [
            {
                label: '🔦 Explorar el interior',
                outcomes: [
                    { weight: 35, type: 'reward', text: '¡Cofre de materiales intacto! Una mina de recursos.', material: 'darkMatter', materialAmt: 1, quarks: 300 },
                    { weight: 35, type: 'reward', text: 'Encuentras un diario de navegación con coordenadas secretas.', quarks: 150, material: 'crystal', materialAmt: 2 },
                    { weight: 20, type: 'damage', text: 'El reactor explota al acercarte. ¡Daños al casco!', damage: 35 },
                    { weight: 10, type: 'reward', text: '¡Increíble! Un Fragmento del Vacío entre los restos.', material: 'voidShard', materialAmt: 1, quarks: 500 },
                ],
            },
            {
                label: '📡 Escanear a distancia',
                outcomes: [
                    { weight: 60, type: 'reward', text: 'El scanner captura datos útiles de la estructura.', quarks: 50 },
                    { weight: 40, type: 'neutral', text: 'Demasiada interferencia. No puedes leer nada.', quarks: 0 },
                ],
            },
        ],
    },
    {
        id: 'wormhole',
        title: '🌀 Anomalía Wormhole',
        text: 'Un agujero de gusano inestable aparece frente a tu nave. Podría llevarte a un sector inexplorado... o destruirte.',
        choices: [
            {
                label: '🌀 Entrar al wormhole',
                outcomes: [
                    { weight: 40, type: 'reward', text: '¡Sales en un sector lleno de recursos! Materia oscura por todas partes.', material: 'darkMatter', materialAmt: 2, quarks: 400 },
                    { weight: 30, type: 'reward', text: 'El viaje es turbulento pero descubres un atajo cósmico.', quarks: 200, fuel: 3 },
                    { weight: 20, type: 'damage', text: 'La inestabilidad daña severamente tu nave.', damage: 50 },
                    { weight: 10, type: 'reward', text: '¡¡JACKPOT!! El wormhole contenía un Fragmento del Vacío cristalizado.', material: 'voidShard', materialAmt: 2, quarks: 1000 },
                ],
            },
            {
                label: '🚫 Mantener distancia',
                outcomes: [
                    { weight: 100, type: 'neutral', text: 'El wormhole colapsa en minutos. Decisión sabia... o cobarde.', quarks: 0 },
                ],
            },
        ],
    },
    {
        id: 'alien_broadcast',
        title: '👽 Transmisión Alienígena',
        text: 'Una transmisión en frecuencia desconocida inunda tus comunicaciones. Parece un código repetitivo.',
        choices: [
            {
                label: '🔓 Decodificar',
                outcomes: [
                    { weight: 45, type: 'reward', text: '¡Es un mapa estelar precursor! Datos invaluables.', quarks: 250, material: 'neutronium', materialAmt: 2 },
                    { weight: 30, type: 'reward', text: 'Coordenadas de un depósito de recursos oculto.', material: 'crystal', materialAmt: 3, quarks: 100 },
                    { weight: 25, type: 'damage', text: 'El código era un virus. Tus sistemas se sobrecargan.', damage: 25 },
                ],
            },
            {
                label: '📴 Bloquear señal',
                outcomes: [
                    { weight: 100, type: 'neutral', text: 'Silencio. Quién sabe lo que te perdiste.', quarks: 10 },
                ],
            },
        ],
    },
    {
        id: 'space_storm',
        title: '⚡ Tormenta de Iones',
        text: 'Una masiva tormenta electromagnética se forma en tu ruta. Tu escudo apenas aguanta.',
        choices: [
            {
                label: '💨 Atravesar rápido',
                outcomes: [
                    { weight: 30, type: 'reward', text: 'La tormenta carga tus sistemas. ¡Bonus de energía!', fuel: 5, quarks: 100 },
                    { weight: 40, type: 'damage', text: 'Impactos eléctricos dañan el casco.', damage: 30 },
                    { weight: 30, type: 'mixed', text: 'Daño moderado pero la tormenta magnetizó cristales en tu casco.', damage: 15, material: 'crystal', materialAmt: 2 },
                ],
            },
            {
                label: '🛑 Esperar',
                outcomes: [
                    { weight: 70, type: 'neutral', text: 'La tormenta pasa en horas. Pierdes tiempo pero no integridad.', fuel: -1 },
                    { weight: 30, type: 'reward', text: 'Mientras esperas detectas una señal enterrada. ¡Datos valiosos!', quarks: 80 },
                ],
            },
        ],
    },
    {
        id: 'trader_convoy',
        title: '🚢 Convoy Comercial',
        text: 'Un convoy de comerciantes interestelares está de paso. Ofrecen tratos interesantes.',
        choices: [
            {
                label: '💰 Comerciar (50⚡)',
                outcomes: [
                    { weight: 50, type: 'reward', text: '¡Gran trato! Obtuviste materiales raros a buen precio.', quarks: -50, material: 'neutronium', materialAmt: 3 },
                    { weight: 30, type: 'reward', text: 'El comerciante tenía Plasma Ionizado premium.', quarks: -50, material: 'plasma', materialAmt: 5 },
                    { weight: 20, type: 'reward', text: '¡Liquidación! Un lote de Materia Oscura a precio de ganga.', quarks: -50, material: 'darkMatter', materialAmt: 1 },
                ],
            },
            {
                label: '👋 Saludar y seguir',
                outcomes: [
                    { weight: 70, type: 'neutral', text: 'Se despiden amablemente. Otro día será.', quarks: 0 },
                    { weight: 30, type: 'reward', text: '¡Te lanzan una muestra gratis! "¡Vuelve pronto!"', material: 'iron', materialAmt: 3, quarks: 25 },
                ],
            },
        ],
    },
];

// Daily rewards calendar
const DAILY_REWARDS = [
    { day: 1, reward: 'quarks', amount: 50,  label: '50 ⚡ Quarks', icon: '⚡' },
    { day: 2, reward: 'fuel',   amount: 5,   label: '5 🚀 Combustible', icon: '🚀' },
    { day: 3, reward: 'quarks', amount: 100, label: '100 ⚡ Quarks', icon: '⚡' },
    { day: 4, reward: 'material', material: 'crystal', amount: 3, label: '3 💎 Cristales', icon: '💎' },
    { day: 5, reward: 'fuel',   amount: 10,  label: '10 🚀 Combustible', icon: '🚀' },
    { day: 6, reward: 'material', material: 'neutronium', amount: 2, label: '2 ⚛️ Neutronio', icon: '⚛️' },
    { day: 7, reward: 'quarks', amount: 500, label: '500 ⚡ + 💎 MEGA PACK', icon: '👑' },
];

let encounterState = {
    lastDailyClaimDate: null,
    currentStreak: 0,
    totalEncounters: 0,
};

export function initEncounters() {
    try {
        const raw = localStorage.getItem('cartografia_encounters');
        if (raw) encounterState = { ...encounterState, ...JSON.parse(raw) };
    } catch (e) { /* fresh */ }
}

/**
 * Roll for a random encounter during warp.
 * @param {number} scannerLevel - Higher = more encounters.
 * @returns {object|null} Encounter data or null.
 */
export function rollEncounter(scannerLevel) {
    const baseChance = 0.28;
    const chance = baseChance + (scannerLevel * 0.04);

    if (Math.random() > chance) return null;

    const encounter = ENCOUNTER_POOL[Math.floor(Math.random() * ENCOUNTER_POOL.length)];
    encounterState.totalEncounters++;
    saveEncounterState();

    return { ...encounter };
}

/**
 * Resolve a player's choice in an encounter.
 * @param {object} encounter
 * @param {number} choiceIndex
 * @returns {object} The outcome with effects to apply.
 */
export function resolveChoice(encounter, choiceIndex) {
    const choice = encounter.choices[choiceIndex];
    if (!choice) return null;

    // Weighted random selection
    const totalWeight = choice.outcomes.reduce((sum, o) => sum + o.weight, 0);
    let roll = Math.random() * totalWeight;
    let selected = choice.outcomes[0];

    for (const outcome of choice.outcomes) {
        roll -= outcome.weight;
        if (roll <= 0) {
            selected = outcome;
            break;
        }
    }

    return { ...selected };
}

/**
 * Check and get daily reward status.
 * @returns {{ available: boolean, day: number, reward: object, streak: number }}
 */
export function getDailyStatus() {
    const today = new Date().toDateString();
    const lastClaim = encounterState.lastDailyClaimDate;

    if (lastClaim === today) {
        return {
            available: false,
            day: encounterState.currentStreak,
            reward: DAILY_REWARDS[(encounterState.currentStreak - 1) % 7],
            streak: encounterState.currentStreak,
            calendar: DAILY_REWARDS,
        };
    }

    // Check if streak is broken
    if (lastClaim) {
        const lastDate = new Date(lastClaim);
        const todayDate = new Date(today);
        const diff = (todayDate - lastDate) / (1000 * 60 * 60 * 24);
        if (diff > 1.5) {
            encounterState.currentStreak = 0; // Streak broken!
        }
    }

    const nextDay = (encounterState.currentStreak % 7);
    return {
        available: true,
        day: nextDay + 1,
        reward: DAILY_REWARDS[nextDay],
        streak: encounterState.currentStreak,
        calendar: DAILY_REWARDS,
    };
}

/**
 * Claim daily reward.
 * @returns {object} The reward claimed.
 */
export function claimDailyReward() {
    const status = getDailyStatus();
    if (!status.available) return null;

    encounterState.currentStreak++;
    encounterState.lastDailyClaimDate = new Date().toDateString();
    saveEncounterState();

    return status.reward;
}

function saveEncounterState() {
    try {
        localStorage.setItem('cartografia_encounters', JSON.stringify(encounterState));
    } catch (e) { /* silent */ }
}
