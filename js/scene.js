// Three.js scene manager v2 — Cinematic deep space environment.
// Custom star shader with twinkling, volumetric fog, enhanced bloom,
// and procedural space dust clouds.

import * as THREE from 'three';
import { initControls, setPosition } from './controls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { generateOutpost } from './outpost.js';

let renderer, scene, camera, controls, composer;
let starField = null;
let dustClouds = [];
let ghostShips = [];
let qualityLevel = 'high';

const QUALITY = {
    low:    { stars: 3000,  dust: 0,    bloom: false, antialias: false, pixelRatio: 0.6,  bloomStrength: 0,   postProcess: false },
    medium: { stars: 8000,  dust: 1000, bloom: true,  antialias: false, pixelRatio: 0.85, bloomStrength: 0.4, postProcess: true },
    high:   { stars: 20000, dust: 4000, bloom: true,  antialias: true,  pixelRatio: Math.min(window.devicePixelRatio, 2), bloomStrength: 0.8, postProcess: true },
};

/**
 * Auto-detect device performance tier.
 * Uses deviceMemory, hardwareConcurrency, screen size, and pixel ratio.
 */
function autoDetectQuality() {
    const mem = navigator.deviceMemory || 4; // GB, default 4 if unknown
    const cores = navigator.hardwareConcurrency || 4;
    const dpr = window.devicePixelRatio || 1;
    const pixels = window.screen.width * window.screen.height * dpr;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    let score = 0;
    score += mem >= 8 ? 3 : mem >= 4 ? 2 : 1;
    score += cores >= 8 ? 3 : cores >= 4 ? 2 : 1;
    score += pixels > 2000000 ? 1 : pixels > 800000 ? 2 : 3; // Fewer pixels = easier
    if (isMobile) score -= 1;

    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
}

// Custom star vertex shader with size variation and twinkling
const starVertexShader = `
    attribute float size;
    attribute float twinklePhase;
    attribute float twinkleSpeed;
    uniform float time;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        vColor = color;
        
        // Twinkling effect
        float twinkle = sin(time * twinkleSpeed + twinklePhase) * 0.3 + 0.7;
        vAlpha = twinkle;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mvPosition.xyz);
        gl_PointSize = size * (300.0 / dist);
        gl_PointSize = clamp(gl_PointSize, 0.5, 6.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const starFragmentShader = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
        // Circular point with soft edge
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float softness = 1.0 - smoothstep(0.0, 0.5, dist);
        softness = pow(softness, 1.5);
        
        // Core glow
        float core = 1.0 - smoothstep(0.0, 0.15, dist);
        vec3 finalColor = vColor + vec3(core * 0.3);
        
        gl_FragColor = vec4(finalColor, softness * vAlpha * 0.9);
    }
`;

// Film grain/vignette post-processing
const vignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        varying vec2 vUv;
        
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            
            // Cinematic vignette
            vec2 center = vUv - 0.5;
            float vignette = 1.0 - dot(center, center) * 1.2;
            vignette = clamp(vignette, 0.0, 1.0);
            vignette = smoothstep(0.0, 1.0, vignette);
            
            // Very subtle film grain
            float grain = hash(vUv * 500.0 + time) * 0.015;
            
            color.rgb *= vignette;
            color.rgb += grain;
            
            // Slight color grade (cool shadows, warm highlights)
            color.r *= 1.02;
            color.b *= 1.05;
            
            gl_FragColor = color;
        }
    `,
};

let vignettePass = null;
let ssaoPass = null;
let chromaticPass = null;
let shaderTime = 0;

// Chromatic Aberration shader — subtle RGB split for atmospheric distortion
const chromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.002 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;
        void main() {
            vec2 offset = amount * (vUv - 0.5);
            float r = texture2D(tDiffuse, vUv + offset).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offset).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
};

/**
 * Initialize the Three.js scene with cinematic rendering pipeline.
 * If quality is 'auto', it auto-detects the optimal tier.
 */
export function initScene(container, quality = 'auto') {
    if (quality === 'auto') {
        qualityLevel = autoDetectQuality();
        console.log(`[SCENE] Auto-detected quality: ${qualityLevel} (mem=${navigator.deviceMemory||'?'}GB, cores=${navigator.hardwareConcurrency||'?'})`);
    } else {
        qualityLevel = quality;
    }
    const q = QUALITY[qualityLevel];

    // Renderer with optimized settings
    renderer = new THREE.WebGLRenderer({
        antialias: q.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(q.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Scene with deep space background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);
    scene.fog = new THREE.FogExp2(0x020208, 0.0006);

    // Camera
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 12000);
    camera.position.set(0, 80, 200);

    // Free Flight Controls (replaces OrbitControls)
    initControls(camera);
    setPosition(0, 80, 200);

    // Lights
    const ambient = new THREE.AmbientLight(0x0a0a22, 0.5);
    scene.add(ambient);

    // Hemisphere light for subtle gradient
    const hemi = new THREE.HemisphereLight(0x1a1a44, 0x000000, 0.3);
    scene.add(hemi);

    // Create starfield
    createStarfield(q.stars);

    // Create space dust clouds
    if (q.dust > 0) createDustClouds(q.dust);

    // Post-processing pipeline
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    if (q.bloom) {
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            q.bloomStrength * 1.5, // slightly boost strength
            0.6, // radius
            0.9  // high threshold to avoid blurring planets
        );
        composer.addPass(bloomPass);
    }

    // Vignette + film grain pass
    vignettePass = new ShaderPass(vignetteShader);
    composer.addPass(vignettePass);

    // SSAO Pass (disabled by default, enabled on planet surface)
    try {
        ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
        ssaoPass.kernelRadius = 8;
        ssaoPass.minDistance = 0.005;
        ssaoPass.maxDistance = 0.1;
        ssaoPass.output = SSAOPass.OUTPUT.Default;
        ssaoPass.enabled = false; // Disabled in space mode
        composer.addPass(ssaoPass);
    } catch (e) {
        console.warn('[SCENE] SSAO not available:', e.message);
    }

    // Chromatic Aberration Pass (subtle, for planet atmosphere)
    chromaticPass = new ShaderPass(chromaticAberrationShader);
    chromaticPass.enabled = false; // Disabled in space mode
    composer.addPass(chromaticPass);

    window.addEventListener('resize', onResize);

    return { scene, camera, renderer, controls };
}

function createStarfield(count) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const twinklePhases = new Float32Array(count);
    const twinkleSpeeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        // Distribute in nested spherical shells for depth
        const shell = Math.random();
        const radius = shell < 0.3 ? 800 + Math.random() * 1200 :
                       shell < 0.7 ? 2000 + Math.random() * 2000 :
                       4000 + Math.random() * 4000;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        // Realistic stellar color distribution
        const colorRoll = Math.random();
        if (colorRoll < 0.45) {
            // Cool white-blue (most common)
            colors[i * 3] = 0.85 + Math.random() * 0.15;
            colors[i * 3 + 1] = 0.88 + Math.random() * 0.12;
            colors[i * 3 + 2] = 1.0;
        } else if (colorRoll < 0.65) {
            // Warm white
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.95 + Math.random() * 0.05;
            colors[i * 3 + 2] = 0.85 + Math.random() * 0.1;
        } else if (colorRoll < 0.80) {
            // Yellow-orange
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.8 + Math.random() * 0.15;
            colors[i * 3 + 2] = 0.4 + Math.random() * 0.3;
        } else if (colorRoll < 0.92) {
            // Blue
            colors[i * 3] = 0.5 + Math.random() * 0.2;
            colors[i * 3 + 1] = 0.6 + Math.random() * 0.2;
            colors[i * 3 + 2] = 1.0;
        } else {
            // Red
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.3 + Math.random() * 0.2;
            colors[i * 3 + 2] = 0.15 + Math.random() * 0.15;
        }

        // Size: mostly small, few bright ones
        const sizeRoll = Math.random();
        sizes[i] = sizeRoll < 0.8 ? 0.3 + Math.random() * 1.0 :
                   sizeRoll < 0.95 ? 1.5 + Math.random() * 2.0 :
                   3.0 + Math.random() * 3.0;

        twinklePhases[i] = Math.random() * Math.PI * 2;
        twinkleSpeeds[i] = 0.5 + Math.random() * 2.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('twinklePhase', new THREE.BufferAttribute(twinklePhases, 1));
    geometry.setAttribute('twinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));

    const material = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    starField = new THREE.Points(geometry, material);
    scene.add(starField);
}

function createDustClouds(count) {
    // Volumetric dust — large transparent particle clouds
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cloudColors = [
        [0.15, 0.08, 0.25], // Purple
        [0.08, 0.12, 0.28], // Blue
        [0.20, 0.05, 0.15], // Magenta
        [0.05, 0.15, 0.20], // Teal  
        [0.12, 0.04, 0.08], // Dark red
    ];

    for (let i = 0; i < count; i++) {
        const r = 100 + Math.random() * 600;
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 200;
        // Cluster into bands for visual interest
        const band = Math.sin(theta * 3 + y * 0.01) * 0.5 + 0.5;

        positions[i * 3] = Math.cos(theta) * r * (0.7 + band * 0.3);
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(theta) * r * (0.7 + band * 0.3);

        const c = cloudColors[Math.floor(Math.random() * cloudColors.length)];
        const brightness = 0.5 + band * 0.5;
        colors[i * 3] = c[0] * brightness;
        colors[i * 3 + 1] = c[1] * brightness;
        colors[i * 3 + 2] = c[2] * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: 8,
        vertexColors: true,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const dust = new THREE.Points(geo, mat);
    scene.add(dust);
    dustClouds.push(dust);
}

let resizeTimeout = null;
function onResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const q = QUALITY[qualityLevel];
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        renderer.setPixelRatio(q.pixelRatio);
        if (composer) composer.setSize(w, h);
    }, 100); // Debounce 100ms to avoid resize spam
}

// Handle orientation changes on mobile
if (screen.orientation) {
    screen.orientation.addEventListener('change', () => onResize());
}

/**
 * Render one frame with post-processing.
 */
let fpsHistory = [];
let lastAutoDowngrade = 0;

export function renderFrame(delta) {

    shaderTime += delta;

    // Update star twinkling
    if (starField && starField.material.uniforms) {
        starField.material.uniforms.time.value = shaderTime;
    }

    // Slow star parallax
    if (starField) {
        starField.rotation.y += delta * 0.002;
        starField.rotation.x += delta * 0.0005;
    }

    // Rotate dust clouds slowly
    dustClouds.forEach(dust => {
        dust.rotation.y += 0.0002 * delta;
        dust.rotation.z += 0.0001 * delta;
    });

    // Animate ghost ships (MMO feel)
    for (let i = ghostShips.length - 1; i >= 0; i--) {
        const ship = ghostShips[i];
        ship.position.addScaledVector(ship.userData.velocity, delta * 0.1);
        ship.userData.life -= delta;
        if (ship.userData.life <= 0) {
            scene.remove(ship);
            ship.geometry.dispose();
            ship.material.dispose();
            ghostShips.splice(i, 1);
        } else {
            // Fade out
            ship.material.opacity = Math.min(1.0, ship.userData.life * 0.5);
        }
    }

    if (Math.random() < 0.005) { // 0.5% chance per frame to spawn a ghost ship
        spawnGhostShip();
    }

    // Vignette time
    if (vignettePass) {
        vignettePass.uniforms.time.value = shaderTime;
    }

    // Render
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }

    // Dynamic FPS monitoring — auto-downgrade if struggling
    const fps = delta > 0 ? 1 / delta : 60;
    fpsHistory.push(fps);
    if (fpsHistory.length > 90) fpsHistory.shift(); // 1.5s rolling window at 60fps

    const now = performance.now();
    if (fpsHistory.length >= 60 && (now - lastAutoDowngrade) > 10000) {
        const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
        if (avgFps < 20 && qualityLevel !== 'low') {
            const newLevel = qualityLevel === 'high' ? 'medium' : 'low';
            console.warn(`[SCENE] FPS too low (avg ${avgFps.toFixed(1)}), downgrading ${qualityLevel} → ${newLevel}`);
            setQuality(newLevel);
            lastAutoDowngrade = now;
            fpsHistory = [];
        }
    }
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }

export function setQuality(level) {
    qualityLevel = level;
    const q = QUALITY[level];
    renderer.setPixelRatio(q.pixelRatio);

    if (starField) {
        scene.remove(starField);
        starField.geometry.dispose();
        starField.material.dispose();
    }
    createStarfield(q.stars);

    // Rebuild composer
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    if (q.bloom) {
        composer.addPass(new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            q.bloomStrength, 0.4, 0.75
        ));
    }

    vignettePass = new ShaderPass(vignetteShader);
    composer.addPass(vignettePass);
}

/**
 * Spawn a "Ghost Ship" passing by to simulate other players (MMO feel)
 */
function spawnGhostShip() {
    if (!scene || ghostShips.length > 5) return;
    
    const start = new THREE.Vector3(
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 100 + 50,
        (Math.random() - 0.5) * 600
    );
    
    const target = new THREE.Vector3(
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 600
    );
    
    const direction = new THREE.Vector3().subVectors(target, start).normalize();
    const speed = 200 + Math.random() * 400; // warp speed
    
    // Create a stretched glowing trail
    const length = 40;
    const geo = new THREE.CylinderGeometry(0.2, 0.2, length, 8);
    geo.rotateX(Math.PI / 2); // align along Z
    
    const colors = [0x00ffff, 0xff00ff, 0xffaa00, 0x00ffaa];
    const mat = new THREE.MeshBasicMaterial({ 
        color: colors[Math.floor(Math.random() * colors.length)], 
        transparent: true, 
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start);
    // Point the cylinder in the direction of travel
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    
    mesh.userData = {
        velocity: direction.multiplyScalar(speed),
        life: 4.0 + Math.random() * 2.0 // lives for 4-6 seconds
    };
    
    scene.add(mesh);
    ghostShips.push(mesh);
}

/**
 * Smoothly move camera with easing.
 */
export function animateCamera(position, lookAtTarget, duration = 1500) {
    const startPos = camera.position.clone();
    const startQuat = camera.quaternion.clone();
    
    // Calculate final quaternion looking at the target
    const dummyCamera = camera.clone();
    dummyCamera.position.copy(position);
    dummyCamera.lookAt(lookAtTarget);
    const endQuat = dummyCamera.quaternion.clone();
    
    const startTime = performance.now();

    function update() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        camera.position.lerpVectors(startPos, position, ease);
        camera.quaternion.slerpQuaternions(startQuat, endQuat, ease);

        if (t < 1) {
            requestAnimationFrame(update);
        } else {
            // Sync the flight controller's internal rotation target
            import('./controls.js').then(module => {
                module.setPosition(position.x, position.y, position.z);
                module.lookAt(lookAtTarget);
            });
        }
    }
    update();
}

/**
 * Clear all dynamic objects (keep starfield, lights, dust).
 */
export function clearDynamicObjects() {
    const toRemove = [];
    scene.traverse((child) => {
        if (child.userData && child.userData.dynamic) {
            toRemove.push(child);
        }
    });
    toRemove.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
    });
}

/**
 * Adds an outpost to the current scene.
 */
export function addOutpost(seed, complexity) {
    if (!scene) return;
    const outpost = generateOutpost(seed, complexity);
    scene.add(outpost);
    return outpost;
}

/**
 * Enable or disable planet-specific post-processing effects.
 * Call with `true` when entering a planet, `false` when leaving.
 * @param {boolean} enabled
 */
export function setPlanetPostProcessing(enabled) {
    if (ssaoPass) ssaoPass.enabled = enabled;
    if (chromaticPass) chromaticPass.enabled = enabled;
    console.log(`[SCENE] Planet post-processing: ${enabled ? 'ON' : 'OFF'}`);
}
