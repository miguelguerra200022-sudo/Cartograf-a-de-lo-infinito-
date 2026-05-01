// audio.js - Refactored using Tone.js for high-quality procedural audio

let isPlaying = false;
let isMuted = false;
let ambientSynth = null;
let discoverySynth = null;
let scanSynth = null;
let ambientFilter = null;
let masterReverb = null;

export async function initAudio() {
    if (typeof Tone === 'undefined') return;
    await Tone.start();
    
    // Set up master effects chain
    masterReverb = new Tone.Reverb({ decay: 4, wet: 0.5 }).toDestination();
    Tone.Destination.volume.value = -12; // Master volume

    // Ambient Drone Synth
    ambientFilter = new Tone.Filter(400, "lowpass").connect(masterReverb);
    ambientSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fmsine", modulationType: "sine", modulationIndex: 3, harmonicity: 0.5 },
        envelope: { attack: 4, decay: 1, sustain: 1, release: 5 }
    }).connect(ambientFilter);

    // Discovery Chime Synth
    discoverySynth = new Tone.PolySynth(Tone.FMSynth, {
        envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 1 },
        modulation: { type: "square" },
        modulationEnvelope: { attack: 0.05, decay: 0.1, sustain: 0, release: 0.5 }
    }).connect(masterReverb);

    // Scan/Mining Sound
    scanSynth = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0, release: 0.2 }
    }).connect(masterReverb);
}

export function playAmbient() {
    if (typeof Tone === 'undefined' || isPlaying || isMuted) return;
    isPlaying = true;
    
    // Deep space chord
    ambientSynth.triggerAttack(["C2", "G2", "C3", "D#3"]);
    
    // Slowly modulate the filter for organic feel
    const lfo = new Tone.LFO("0.1hz", 200, 800).connect(ambientFilter.frequency).start();
}

export function stopAmbient() {
    if (typeof Tone === 'undefined' || !isPlaying) return;
    isPlaying = false;
    if (ambientSynth) ambientSynth.triggerRelease(["C2", "G2", "C3", "D#3"]);
}

export function playScanSound() {
    if (typeof Tone === 'undefined' || isMuted) return;
    if (scanSynth) scanSynth.triggerAttackRelease("16n");
}

export function playDiscoverySound(rarity = 'common') {
    if (typeof Tone === 'undefined' || isMuted) return;
    
    const baseFreqs = {
        common: ["C5", "E5"],
        uncommon: ["C5", "E5", "G5"],
        rare: ["A4", "C#5", "E5", "A5"],
        epic: ["G4", "B4", "D5", "G5", "B5"],
        legendary: ["C4", "E4", "G4", "C5", "E5", "G5", "C6"],
        mythic: ["E4", "G#4", "B4", "E5", "G#5", "B5", "E6"]
    };

    const notes = baseFreqs[rarity] || baseFreqs.common;
    const duration = rarity === 'legendary' || rarity === 'mythic' ? "2n" : "4n";

    // Play chord with slight arpeggiation
    const now = Tone.now();
    notes.forEach((note, index) => {
        discoverySynth.triggerAttackRelease(note, duration, now + (index * 0.05));
    });
}

export function toggleMute() {
    isMuted = !isMuted;
    if (typeof Tone !== 'undefined') {
        Tone.Destination.mute = isMuted;
    }
    return isMuted;
}

export function getMuteState() {
    return isMuted;
}
