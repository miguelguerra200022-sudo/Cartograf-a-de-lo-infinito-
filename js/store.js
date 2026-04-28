// Global State Store — Pub/Sub pattern (Redux-like, zero dependencies)
// Centralized state management for Cartografía de lo Infinito.
//
// Usage:
//   import { store } from './store.js';
//   store.dispatch({ type: 'ADD_QUARKS', payload: 100 });
//   store.subscribe('quarks', (state) => updateUI(state.quarks));
//   const { quarks, fuel } = store.getState();

const INITIAL_STATE = {
    // Resources
    quarks: 500,
    fuel: 20,
    totalQuarksEarned: 0,
    sectorsExplored: 0,

    // Navigation
    currentCoords: { x: 0, y: 0, z: 0 },
    currentSector: null,
    isGenerating: false,

    // Mining
    miningCooldowns: {},
};

// Internal state — cloned from initial to avoid mutation
let state = JSON.parse(JSON.stringify(INITIAL_STATE));

// Subscribers map: { 'eventKey': [callback, ...] }
const subscribers = {};

// Wildcard subscribers (listen to ALL changes)
const globalSubscribers = [];

/**
 * The reducer processes dispatched actions and returns a new state.
 * Every action must have { type: string, payload?: any }.
 */
function reducer(currentState, action) {
    const { type, payload } = action;

    switch (type) {
        case 'ADD_QUARKS':
            return {
                ...currentState,
                quarks: currentState.quarks + payload,
                totalQuarksEarned: currentState.totalQuarksEarned + (payload > 0 ? payload : 0),
            };

        case 'SPEND_QUARKS':
            return {
                ...currentState,
                quarks: Math.max(0, currentState.quarks - payload),
            };

        case 'ADD_FUEL':
            return {
                ...currentState,
                fuel: currentState.fuel + payload,
            };

        case 'SPEND_FUEL':
            return {
                ...currentState,
                fuel: Math.max(0, currentState.fuel - payload),
            };

        case 'SET_COORDS':
            return {
                ...currentState,
                currentCoords: { ...payload },
            };

        case 'SET_SECTOR':
            return {
                ...currentState,
                currentSector: payload,
            };

        case 'SET_GENERATING':
            return {
                ...currentState,
                isGenerating: payload,
            };

        case 'INCREMENT_EXPLORED':
            return {
                ...currentState,
                sectorsExplored: currentState.sectorsExplored + 1,
            };

        case 'OVERRIDE_STATE':
            // Merge arbitrary keys (used for bulk updates, persistence restore)
            return {
                ...currentState,
                ...payload,
            };

        case 'RESET':
            // Full reset to initial (used on Prestige)
            return {
                ...JSON.parse(JSON.stringify(INITIAL_STATE)),
                ...payload, // Allow overrides on reset (e.g. mega_start bonuses)
            };

        default:
            console.warn(`[STORE] Unknown action type: ${type}`);
            return currentState;
    }
}

/**
 * Detect which state keys changed between old and new state.
 */
function getChangedKeys(oldState, newState) {
    const changed = [];
    for (const key of Object.keys(newState)) {
        if (oldState[key] !== newState[key]) {
            changed.push(key);
        }
    }
    return changed;
}

/**
 * The store singleton.
 */
export const store = {
    /**
     * Get a snapshot of the current state (shallow copy).
     */
    getState() {
        return state;
    },

    /**
     * Dispatch an action to update the state.
     * @param {{ type: string, payload?: any }} action
     */
    dispatch(action) {
        const prevState = state;
        state = reducer(state, action);

        // Notify targeted subscribers
        const changedKeys = getChangedKeys(prevState, state);
        for (const key of changedKeys) {
            if (subscribers[key]) {
                for (const cb of subscribers[key]) {
                    try { cb(state); } catch (e) { console.error(`[STORE] Subscriber error (${key}):`, e); }
                }
            }
        }

        // Notify global (wildcard) subscribers
        if (changedKeys.length > 0) {
            for (const cb of globalSubscribers) {
                try { cb(state, changedKeys); } catch (e) { console.error('[STORE] Global subscriber error:', e); }
            }
        }

        // Auto-persist critical state to localStorage
        if (changedKeys.some(k => ['quarks', 'fuel', 'totalQuarksEarned', 'sectorsExplored'].includes(k))) {
            try {
                localStorage.setItem('cartografia_stats', JSON.stringify({
                    quarks: state.quarks,
                    fuel: state.fuel,
                    totalQuarksEarned: state.totalQuarksEarned,
                    sectorsExplored: state.sectorsExplored,
                }));
            } catch (e) { /* localStorage full or disabled */ }
        }
    },

    /**
     * Subscribe to changes on a specific state key.
     * @param {string} key — State property name (e.g. 'quarks', 'fuel', 'currentSector')
     * @param {function} callback — Called with the full state when that key changes
     * @returns {function} unsubscribe function
     */
    subscribe(key, callback) {
        if (!subscribers[key]) subscribers[key] = [];
        subscribers[key].push(callback);

        return () => {
            subscribers[key] = subscribers[key].filter(cb => cb !== callback);
        };
    },

    /**
     * Subscribe to ALL state changes.
     * @param {function} callback — Called with (state, changedKeys[])
     * @returns {function} unsubscribe function
     */
    subscribeAll(callback) {
        globalSubscribers.push(callback);
        return () => {
            const idx = globalSubscribers.indexOf(callback);
            if (idx !== -1) globalSubscribers.splice(idx, 1);
        };
    },
};

console.log('[STORE] Initialized with state:', { ...state });
