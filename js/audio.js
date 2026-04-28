// Procedural ambient audio engine using Web Audio API.
// Generates atmospheric space drones and discovery sound effects
// entirely from oscillators — no audio files needed.

let audioCtx = null;
let masterGain = null;
let droneNodes = [];
let isPlaying = false;
let isMuted = false;

/**
 * Initialize the Web Audio API context.
 * Must be called from a user gesture (click).
 */
export function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.15;
    masterGain.connect(audioCtx.destination);
}

/**
 * Start the ambient space drone.
 * Layers multiple detuned oscillators with slow LFO modulation.
 */
export function playAmbient() {
    if (!audioCtx || isPlaying) return;
    isPlaying = true;

    // Base drone layer — deep sine
    const drone1 = createDroneLayer(55, 'sine', 0.08);
    // Harmonic layer — soft triangle
    const drone2 = createDroneLayer(82.5, 'triangle', 0.04);
    // High shimmer — barely audible
    const drone3 = createDroneLayer(220, 'sine', 0.015);
    // Sub-bass rumble
    const drone4 = createDroneLayer(36, 'sine', 0.05);

    droneNodes.push(drone1, drone2, drone3, drone4);
}

function createDroneLayer(freq, type, volume) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = type;
    osc.frequency.value = freq;

    // Slow detuning for organic feel
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05 + Math.random() * 0.1;
    lfoGain.gain.value = freq * 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 1;

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start();

    return { osc, gain, lfo, lfoGain, filter };
}

/**
 * Stop ambient drone with fade-out.
 */
export function stopAmbient() {
    if (!audioCtx || !isPlaying) return;
    isPlaying = false;

    const fadeTime = audioCtx.currentTime + 1;
    droneNodes.forEach(node => {
        node.gain.gain.linearRampToValueAtTime(0, fadeTime);
        setTimeout(() => {
            try { node.osc.stop(); node.lfo.stop(); } catch (e) { /* already stopped */ }
        }, 1200);
    });
    droneNodes = [];
}

/**
 * Play a scanning/warp sound effect.
 * Rising pitch sweep with noise burst.
 */
export function playScanSound() {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    osc.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.8);

    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 5;

    gain.gain.value = 0.08;
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.0);
}

/**
 * Play a discovery chime — shimmering bell-like tone.
 * @param {string} rarity - 'common'|'uncommon'|'rare'|'epic'|'legendary'
 */
export function playDiscoverySound(rarity = 'common') {
    if (!audioCtx) return;

    const baseFreqs = {
        common: [523, 659],
        uncommon: [523, 659, 784],
        rare: [440, 554, 659, 880],
        epic: [392, 494, 587, 784, 988],
        legendary: [261, 330, 392, 523, 659, 784, 1047],
    };

    const freqs = baseFreqs[rarity] || baseFreqs.common;
    const duration = rarity === 'legendary' ? 2.5 : rarity === 'epic' ? 1.8 : 1.2;

    freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        const startTime = audioCtx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.06, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + duration);
    });
}

/**
 * Toggle mute state.
 */
export function toggleMute() {
    if (!audioCtx) return false;
    isMuted = !isMuted;
    masterGain.gain.linearRampToValueAtTime(
        isMuted ? 0 : 0.15,
        audioCtx.currentTime + 0.3
    );
    return isMuted;
}

/**
 * Get current mute state.
 */
export function getMuteState() {
    return isMuted;
}
