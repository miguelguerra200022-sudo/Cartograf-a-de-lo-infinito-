// Visual effects v2 — Cinematic warp, volumetric nebula, discovery VFX.
// Enhanced particle systems with GPU-friendly shaders.

import * as THREE from 'three';

let nebulaParticles = null;
let nebulaParticles2 = null;
let warpParticles = null;
let warpRings = [];
let discoveryParticles = null;
let warpActive = false;

/**
 * Create multi-layer ambient nebula.
 */
export function createNebula(scene) {
    removeNebula(scene);

    // Layer 1: Dense inner nebula
    nebulaParticles = createNebulaLayer(scene, 2500, 200, 0.12, [
        [0.35, 0.15, 0.55],
        [0.15, 0.25, 0.60],
        [0.50, 0.15, 0.40],
        [0.10, 0.30, 0.50],
    ]);

    // Layer 2: Sparse outer haze
    nebulaParticles2 = createNebulaLayer(scene, 1500, 400, 0.05, [
        [0.20, 0.10, 0.35],
        [0.10, 0.15, 0.40],
        [0.30, 0.08, 0.20],
    ]);
}

function createNebulaLayer(scene, count, spread, opacity, colorPalette) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const r = 20 + Math.random() * spread;
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * spread * 0.4;

        // Spiral arm structure
        const spiral = theta + r * 0.02;
        positions[i * 3] = Math.cos(spiral) * r;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(spiral) * r;

        const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        const brightness = 0.6 + Math.random() * 0.4;
        colors[i * 3] = c[0] * brightness;
        colors[i * 3 + 1] = c[1] * brightness;
        colors[i * 3 + 2] = c[2] * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    });

    const particles = new THREE.Points(geo, mat);
    particles.userData.dynamic = true;
    scene.add(particles);
    return particles;
}

/**
 * Animate nebula with gentle rotation + breathing effect.
 */
export function animateNebula(delta) {
    if (nebulaParticles) {
        nebulaParticles.rotation.y += delta * 0.008;
        nebulaParticles.rotation.x += delta * 0.002;
    }
    if (nebulaParticles2) {
        nebulaParticles2.rotation.y -= delta * 0.005;
        nebulaParticles2.rotation.z += delta * 0.001;
    }
}

export function removeNebula(scene) {
    [nebulaParticles, nebulaParticles2].forEach(p => {
        if (p) {
            p.geometry.dispose();
            p.material.dispose();
            scene.remove(p);
        }
    });
    nebulaParticles = null;
    nebulaParticles2 = null;
}

/**
 * Cinematic warp transition with speed tunnel and shockwave rings.
 */
export function triggerWarp(scene, camera, onComplete) {
    if (warpActive) return;
    warpActive = true;

    const overlay = document.getElementById('warp-overlay');
    if (overlay) overlay.classList.add('active');

    // Speed lines (stretched stars)
    const lineCount = 500;
    const positions = new Float32Array(lineCount * 6);
    const colors = new Float32Array(lineCount * 6);

    for (let i = 0; i < lineCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r1 = 30 + Math.random() * 20;
        const r2 = 150 + Math.random() * 350;

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);

        positions[i * 6] = x * r1;
        positions[i * 6 + 1] = y * r1;
        positions[i * 6 + 2] = z * r1;
        positions[i * 6 + 3] = x * r2;
        positions[i * 6 + 4] = y * r2;
        positions[i * 6 + 5] = z * r2;

        // Gradient from cyan core to blue tail
        const b = 0.5 + Math.random() * 0.5;
        colors[i * 6] = b * 0.3;
        colors[i * 6 + 1] = b * 0.7;
        colors[i * 6 + 2] = 1.0;
        colors[i * 6 + 3] = b * 0.1;
        colors[i * 6 + 4] = b * 0.3;
        colors[i * 6 + 5] = b * 0.7;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    warpParticles = new THREE.LineSegments(geo, mat);
    warpParticles.userData.dynamic = true;
    scene.add(warpParticles);

    // Shockwave rings
    warpRings = [];
    for (let r = 0; r < 5; r++) {
        const ringGeo = new THREE.TorusGeometry(10 + r * 8, 0.5, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.z = -r * 20;
        ring.userData.dynamic = true;
        ring.userData.delay = r * 0.08;
        scene.add(ring);
        warpRings.push({ mesh: ring, mat: ringMat, delay: r * 0.08 });
    }

    const startTime = performance.now();
    const duration = 1400;

    function animateWarp() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Line opacity curve
        if (t < 0.2) {
            mat.opacity = t / 0.2;
        } else if (t > 0.75) {
            mat.opacity = (1 - t) / 0.25;
        } else {
            mat.opacity = 1.0;
        }

        // Scale acceleration
        const accel = 1 + t * t * 5;
        warpParticles.scale.setScalar(accel);
        warpParticles.rotation.z += 0.015;

        // Rings animation
        warpRings.forEach((ring) => {
            const rt = Math.max(0, t - ring.delay) / (1 - ring.delay);
            ring.mat.opacity = rt < 0.2 ? rt / 0.2 : rt > 0.6 ? Math.max(0, (1 - rt) / 0.4) : 0.3;
            ring.mesh.scale.setScalar(1 + rt * 3);
            ring.mesh.position.z = -20 + rt * 200;
        });

        // Camera FOV zoom effect
        if (t < 0.5) {
            camera.fov = 55 + t * 30;
        } else {
            camera.fov = 70 - (t - 0.5) * 30;
        }
        camera.updateProjectionMatrix();

        if (t < 1) {
            requestAnimationFrame(animateWarp);
        } else {
            // Cleanup
            scene.remove(warpParticles);
            geo.dispose();
            mat.dispose();
            warpParticles = null;

            warpRings.forEach(r => {
                scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                r.mat.dispose();
            });
            warpRings = [];

            camera.fov = 55;
            camera.updateProjectionMatrix();
            warpActive = false;

            if (overlay) overlay.classList.remove('active');
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(animateWarp);
}

/**
 * Discovery burst with ring shockwave.
 */
export function triggerDiscoveryBurst(scene, rarity = 'common') {
    const colorMap = {
        common:    0x8892b0,
        uncommon:  0x0cce6b,
        rare:      0x00b4d8,
        epic:      0xc792ea,
        legendary: 0xffd700,
        mythic:    0xff6b6b,
    };

    const color = colorMap[rarity] || colorMap.common;
    const count = rarity === 'legendary' ? 300 : rarity === 'epic' ? 180 : rarity === 'rare' ? 100 : 60;

    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 15 + Math.random() * 80;
        velocities.push(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.sin(phi) * Math.sin(theta) * speed,
            Math.cos(phi) * speed
        );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color,
        size: 2,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    discoveryParticles = new THREE.Points(geo, mat);
    discoveryParticles.userData.dynamic = true;
    scene.add(discoveryParticles);

    // Shockwave ring for epic+
    let ringMesh = null;
    if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
        const ringGeo = new THREE.TorusGeometry(1, 0.3, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.userData.dynamic = true;
        scene.add(ringMesh);
    }

    const startTime = performance.now();
    const duration = 2000;

    function animateBurst() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const dt = 0.016;

        const posArray = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
            posArray[i * 3] += velocities[i * 3] * dt;
            posArray[i * 3 + 1] += velocities[i * 3 + 1] * dt;
            posArray[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            velocities[i * 3] *= 0.96;
            velocities[i * 3 + 1] *= 0.96;
            velocities[i * 3 + 2] *= 0.96;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - t;

        if (ringMesh) {
            ringMesh.scale.setScalar(1 + t * 50);
            ringMesh.material.opacity = (1 - t) * 0.5;
        }

        if (t < 1) {
            requestAnimationFrame(animateBurst);
        } else {
            scene.remove(discoveryParticles);
            geo.dispose();
            mat.dispose();
            discoveryParticles = null;

            if (ringMesh) {
                scene.remove(ringMesh);
                ringMesh.geometry.dispose();
                ringMesh.material.dispose();
            }
        }
    }

    requestAnimationFrame(animateBurst);
}

export function isWarping() {
    return warpActive;
}

/**
 * Triggers a screen shake effect using GSAP.
 * @param {number} intensity - The severity of the shake
 * @param {number} duration - The duration in seconds
 */
export function triggerShake(intensity = 1, duration = 0.3) {
    if (typeof gsap === 'undefined') return;
    const container = document.body;
    const move = intensity * 4;
    gsap.fromTo(container, 
        { x: -move, y: move }, 
        { x: 0, y: 0, duration: duration, ease: `rough({ strength: ${intensity * 2}, points: 10, randomize: true })`, clearProps: "transform" }
    );
}

/**
 * Triggers a confetti explosion based on rarity.
 * @param {string} rarity 
 */
export function triggerConfetti(rarity = 'epic') {
    if (typeof confetti === 'undefined') return;
    let particleCount = 50, spread = 70, colors = ['#ffffff'];
    switch(rarity) {
        case 'legendary': particleCount = 150; spread = 120; colors = ['#f39c12', '#f1c40f', '#e67e22', '#ffffff']; break;
        case 'epic': particleCount = 100; spread = 90; colors = ['#9b59b6', '#8e44ad', '#ecf0f1']; break;
        case 'mythic': particleCount = 300; spread = 160; colors = ['#e74c3c', '#c0392b', '#1abc9c', '#f1c40f']; break;
        case 'rare': particleCount = 60; spread = 60; colors = ['#3498db', '#2980b9']; break;
        default: return;
    }
    confetti({ particleCount, spread, origin: { y: 0.6 }, colors, zIndex: 9999, disableForReducedMotion: true });
}
