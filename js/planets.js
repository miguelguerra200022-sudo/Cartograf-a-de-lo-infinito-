// Planet system renderer v2 — Cinematic planets with procedural textures,
// ring systems, volumetric atmospheres, cloud layers, and surface detail.
// Dramatically upgraded visual fidelity while staying GPU-friendly.

import * as THREE from 'three';

let planetGroup = null;
let starLight = null;
let starMesh = null;
let starGlowMesh = null;
let planets = [];
let accretionDisk = null;

const BIOME_COLORS = {
    Barren:        { base: 0x8a8278, secondary: 0x5c564f },
    Volcanic:      { base: 0xcc3300, secondary: 0xff6600 },
    Frozen:        { base: 0x8ac4e0, secondary: 0xc0e8ff },
    Oceanic:       { base: 0x0066aa, secondary: 0x2299dd },
    Ocean:         { base: 0x0066aa, secondary: 0x2299dd },
    Temperate:     { base: 0x3a8a3a, secondary: 0x6aaa4a },
    Jungle:        { base: 0x1a6a1a, secondary: 0x2a9a2a },
    Desert:        { base: 0xccaa5a, secondary: 0xe8cc88 },
    Toxic:         { base: 0x6aaa0a, secondary: 0xaaff00 },
    Crystalline:   { base: 0x8a5aba, secondary: 0xcc99ff },
    Biomechanical: { base: 0x5a7a8a, secondary: 0x8aaacc },
    Lush:          { base: 0x3aaa3a, secondary: 0x66cc44 },
    Gas:           { base: 0xcc8844, secondary: 0xeeaa66 },
};

const ATMOSPHERE_COLORS = {
    Barren:        null,
    Volcanic:      new THREE.Color(0xff4400),
    Frozen:        new THREE.Color(0x88ccff),
    Oceanic:       new THREE.Color(0x4488ff),
    Ocean:         new THREE.Color(0x4488ff),
    Temperate:     new THREE.Color(0x6699cc),
    Jungle:        new THREE.Color(0x44aa66),
    Desert:        new THREE.Color(0xddaa66),
    Toxic:         new THREE.Color(0xaaff00),
    Crystalline:   new THREE.Color(0xaa66ff),
    Biomechanical: new THREE.Color(0x66aacc),
    Lush:          new THREE.Color(0x55bb77),
    Gas:           new THREE.Color(0xddaa55),
};

const STAR_COLORS = {
    RedDwarf:    { color: 0xff3300, intensity: 1.5, size: 8,  coronaColor: 0xff6633 },
    YellowMain:  { color: 0xffdd44, intensity: 2.0, size: 12, coronaColor: 0xffee88 },
    BlueGiant:   { color: 0x4488ff, intensity: 3.0, size: 18, coronaColor: 0x88bbff },
    WhiteDwarf:  { color: 0xeeeeff, intensity: 1.8, size: 6,  coronaColor: 0xffffff },
    Neutron:     { color: 0x88ccff, intensity: 4.0, size: 4,  coronaColor: 0xaaddff },
    BlackHole:   { color: 0x220033, intensity: 0.3, size: 20, coronaColor: 0x440066 },
};

// ─── Shaders ───

const atmosphereVertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const atmosphereFragmentShader = `
    uniform vec3 glowColor;
    uniform float intensity;
    uniform float falloff;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = 1.0 - dot(viewDir, vNormal);
        fresnel = pow(fresnel, falloff) * intensity;
        gl_FragColor = vec4(glowColor, fresnel * 0.7);
    }
`;

// Procedural planet surface shader (replaces flat color)
const planetSurfaceVertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vElevation;
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vElevation = position.y * 0.5 + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const planetSurfaceFragmentShader = `
    uniform vec3 baseColor;
    uniform vec3 secondaryColor;
    uniform float time;
    uniform float seed;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vElevation;

    // Simple hash for procedural patterns
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
        }
        return v;
    }

    void main() {
        vec2 uv = vUv * 6.0 + seed;
        float n = fbm(uv);
        float n2 = fbm(uv * 2.3 + 5.7);

        // Mix colors based on noise
        vec3 col = mix(baseColor, secondaryColor, n);
        
        // Add terrain variation
        float detail = fbm(uv * 4.0 + vec2(seed * 3.14));
        col = mix(col, col * 1.3, detail * 0.3);

        // Latitude bands (gas giant style bands if applicable)
        float bands = sin(vUv.y * 20.0 + n2 * 3.0) * 0.5 + 0.5;
        col = mix(col, col * (0.8 + bands * 0.4), 0.2);

        // Lighting
        vec3 lightDir = normalize(vec3(1.0, 0.5, 0.8));
        float diff = max(dot(vNormal, lightDir), 0.0);
        float ambient = 0.15;
        vec3 finalColor = col * (ambient + diff * 0.85);

        // Specular
        vec3 viewDir = normalize(-vPosition);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0);
        finalColor += vec3(1.0) * spec * 0.15;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// Cloud layer shader
const cloudFragmentShader = `
    uniform vec3 cloudColor;
    uniform float time;
    uniform float seed;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}
        return v;
    }

    void main() {
        vec2 uv = vUv * 4.0 + vec2(time * 0.02, seed);
        float clouds = fbm(uv);
        clouds = smoothstep(0.35, 0.65, clouds);
        
        vec3 lightDir = normalize(vec3(1.0, 0.5, 0.8));
        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 col = cloudColor * (0.3 + diff * 0.7);
        
        gl_FragColor = vec4(col, clouds * 0.5);
    }
`;

// Star corona shader
const coronaFragmentShader = `
    uniform vec3 coronaColor;
    uniform float time;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }

    void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = 1.0 - dot(viewDir, vNormal);
        fresnel = pow(fresnel, 1.5);
        
        // Animated noise for solar flares
        vec2 uv = vUv * 3.0 + time * 0.1;
        float flare = noise(uv) * noise(uv * 2.3 + 1.7);
        
        float alpha = fresnel * (0.6 + flare * 0.4);
        gl_FragColor = vec4(coronaColor, alpha * 0.8);
    }
`;

let shaderTime = 0;

/**
 * Create the full planetary system from sector data.
 */
export function createPlanetSystem(scene, starSystem) {
    removePlanets(scene);
    if (!starSystem) return;

    planetGroup = new THREE.Group();
    planetGroup.userData.dynamic = true;
    planets = [];
    shaderTime = Math.random() * 100;

    const starConfig = STAR_COLORS[starSystem.star_type] || STAR_COLORS.YellowMain;
    createStar(starConfig, starSystem.star_type);

    starSystem.planets.forEach((planetData, index) => {
        createPlanet(planetData, index, starSystem.planets.length);
    });

    scene.add(planetGroup);
}

function createStar(config, starType) {
    // Core star sphere with emissive material
    const starGeo = new THREE.SphereGeometry(config.size, 48, 48);
    const starMat = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: starType === 'BlackHole' ? 0.15 : 1.0,
    });
    starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.userData.dynamic = true;
    planetGroup.add(starMesh);

    if (starType !== 'BlackHole') {
        // Inner corona (animated shader)
        const coronaGeo = new THREE.SphereGeometry(config.size * 1.4, 48, 48);
        const coronaMat = new THREE.ShaderMaterial({
            uniforms: {
                coronaColor: { value: new THREE.Color(config.coronaColor) },
                time: { value: 0 },
            },
            vertexShader: planetSurfaceVertexShader,
            fragmentShader: coronaFragmentShader,
            side: THREE.FrontSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        corona.userData.dynamic = true;
        corona.userData.isCorona = true;
        planetGroup.add(corona);

        // Outer glow (Fresnel)
        const glowGeo = new THREE.SphereGeometry(config.size * 3, 32, 32);
        const glowMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(config.color) },
                intensity: { value: 1.5 },
                falloff: { value: 2.0 },
            },
            vertexShader: atmosphereVertexShader,
            fragmentShader: atmosphereFragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        starGlowMesh = new THREE.Mesh(glowGeo, glowMat);
        starGlowMesh.userData.dynamic = true;
        planetGroup.add(starGlowMesh);

        // Lens flare rays (simple sprite planes)
        for (let i = 0; i < 4; i++) {
            const rayGeo = new THREE.PlaneGeometry(config.size * 8, config.size * 0.3);
            const rayMat = new THREE.MeshBasicMaterial({
                color: config.color,
                transparent: true,
                opacity: 0.08,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const ray = new THREE.Mesh(rayGeo, rayMat);
            ray.rotation.z = (i * Math.PI) / 4;
            ray.userData.dynamic = true;
            planetGroup.add(ray);
        }
    }

    // Black hole accretion disk with gradient
    if (starType === 'BlackHole') {
        // Inner event horizon glow
        const ehGeo = new THREE.SphereGeometry(config.size * 0.95, 48, 48);
        const ehMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
        });
        const eh = new THREE.Mesh(ehGeo, ehMat);
        eh.userData.dynamic = true;
        planetGroup.add(eh);

        // Accretion disk (multi-layer for depth)
        for (let layer = 0; layer < 3; layer++) {
            const inner = config.size * (1.3 + layer * 0.5);
            const outer = config.size * (2.5 + layer * 1.0);
            const diskGeo = new THREE.RingGeometry(inner, outer, 128);
            const diskColors = [0xff4400, 0xff8800, 0xffcc00];
            const diskMat = new THREE.MeshBasicMaterial({
                color: diskColors[layer],
                transparent: true,
                opacity: 0.25 - layer * 0.06,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
            });
            const disk = new THREE.Mesh(diskGeo, diskMat);
            disk.rotation.x = Math.PI / 2.2;
            disk.userData.dynamic = true;
            disk.userData.isAccretion = true;
            disk.userData.rotSpeed = 0.3 + layer * 0.15;
            planetGroup.add(disk);
        }

        // Gravitational lensing ring
        const lensGeo = new THREE.TorusGeometry(config.size * 1.1, config.size * 0.05, 16, 128);
        const lensMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
        });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.rotation.x = Math.PI / 2.2;
        lens.userData.dynamic = true;
        planetGroup.add(lens);
    }

    // Neutron star jets
    if (starType === 'Neutron') {
        for (let dir = -1; dir <= 1; dir += 2) {
            const jetGeo = new THREE.ConeGeometry(1.5, 40, 16, 1, true);
            const jetMat = new THREE.MeshBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.15,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const jet = new THREE.Mesh(jetGeo, jetMat);
            jet.position.y = dir * 20;
            jet.rotation.x = dir > 0 ? 0 : Math.PI;
            jet.userData.dynamic = true;
            planetGroup.add(jet);
        }
    }

    // Point light from the star
    starLight = new THREE.PointLight(config.color, config.intensity, 600);
    starLight.userData.dynamic = true;
    planetGroup.add(starLight);

    // Secondary fill light for better planet illumination
    const fillLight = new THREE.DirectionalLight(config.color, config.intensity * 0.3);
    fillLight.position.set(50, 30, 50);
    fillLight.userData.dynamic = true;
    planetGroup.add(fillLight);
}

function createPlanet(planetData, index, totalPlanets) {
    const planetObj = new THREE.Group();
    planetObj.userData.dynamic = true;

    const radius = Math.max(1.5, Math.min(planetData.radius_earth * 1.5, 8));
    const orbitRadius = 35 + (index / totalPlanets) * 130;
    const angle = (index / totalPlanets) * Math.PI * 2 + Math.PI * 0.3;
    const planetX = Math.cos(angle) * orbitRadius;
    const planetZ = Math.sin(angle) * orbitRadius;
    planetObj.position.set(planetX, (Math.random() - 0.5) * 8, planetZ);

    // Seed for procedural texture
    const seed = planetData.mass_earth * 7.13 + index * 3.7;

    // Planet sphere with procedural shader
    const biomeColors = BIOME_COLORS[planetData.biome] || BIOME_COLORS.Temperate;
    const geo = new THREE.SphereGeometry(radius, 48, 48);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            baseColor: { value: new THREE.Color(biomeColors.base) },
            secondaryColor: { value: new THREE.Color(biomeColors.secondary) },
            time: { value: 0 },
            seed: { value: seed },
        },
        vertexShader: planetSurfaceVertexShader,
        fragmentShader: planetSurfaceFragmentShader,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.dynamic = true;
    mesh.userData.planetData = planetData;
    mesh.userData.isPlanetSurface = true;
    
    // Axial tilt
    mesh.rotation.z = (Math.random() - 0.5) * 0.5;
    planetObj.add(mesh);

    // Cloud layer (if has atmosphere)
    if (planetData.has_atmosphere) {
        const cloudGeo = new THREE.SphereGeometry(radius * 1.03, 48, 48);
        const cloudMat = new THREE.ShaderMaterial({
            uniforms: {
                cloudColor: { value: new THREE.Color(0xffffff) },
                time: { value: 0 },
                seed: { value: seed + 42 },
            },
            vertexShader: planetSurfaceVertexShader,
            fragmentShader: cloudFragmentShader,
            transparent: true,
            depthWrite: false,
        });
        const clouds = new THREE.Mesh(cloudGeo, cloudMat);
        clouds.userData.dynamic = true;
        clouds.userData.isCloud = true;
        planetObj.add(clouds);

        // Atmosphere glow
        const atmoColor = ATMOSPHERE_COLORS[planetData.biome];
        if (atmoColor) {
            const atmoGeo = new THREE.SphereGeometry(radius * 1.18, 32, 32);
            const atmoMat = new THREE.ShaderMaterial({
                uniforms: {
                    glowColor: { value: atmoColor },
                    intensity: { value: 1.2 },
                    falloff: { value: 3.0 },
                },
                vertexShader: atmosphereVertexShader,
                fragmentShader: atmosphereFragmentShader,
                side: THREE.BackSide,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const atmo = new THREE.Mesh(atmoGeo, atmoMat);
            atmo.userData.dynamic = true;
            planetObj.add(atmo);
        }
    }

    // Ring system for gas giants or random chance
    const hasRings = planetData.biome === 'Gas' || (planetData.mass_earth > 5 && Math.random() > 0.4);
    if (hasRings) {
        const ringInner = radius * 1.4;
        const ringOuter = radius * 2.4;
        const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 128);

        // Procedural ring colors
        const ringColors = new Float32Array(ringGeo.attributes.position.count * 3);
        for (let i = 0; i < ringGeo.attributes.position.count; i++) {
            const pos = new THREE.Vector3().fromBufferAttribute(ringGeo.attributes.position, i);
            const dist = pos.length();
            const t = (dist - ringInner) / (ringOuter - ringInner);
            const brightness = 0.4 + Math.sin(t * 20) * 0.15 + Math.random() * 0.1;
            ringColors[i * 3] = brightness * 0.9;
            ringColors[i * 3 + 1] = brightness * 0.8;
            ringColors[i * 3 + 2] = brightness * 0.7;
        }
        ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));

        const ringMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        ring.userData.dynamic = true;
        planetObj.add(ring);

        // Ring shadow highlight
        const shadowRingGeo = new THREE.RingGeometry(ringInner, ringOuter, 128);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: biomeColors.base,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
        const shadowRing = new THREE.Mesh(shadowRingGeo, shadowMat);
        shadowRing.rotation.x = ring.rotation.x;
        shadowRing.userData.dynamic = true;
        planetObj.add(shadowRing);
    }

    // Moons with visible orbit paths
    for (let m = 0; m < Math.min(planetData.moons, 4); m++) {
        const moonRadius = 0.25 + Math.random() * 0.3;
        const moonGeo = new THREE.SphereGeometry(moonRadius, 12, 12);
        const moonMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa + Math.floor(Math.random() * 0x333333),
            roughness: 0.9,
        });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        const moonDist = radius * 2.5 + m * 1.2;
        const moonAngle = (m / planetData.moons) * Math.PI * 2;
        moonMesh.position.set(
            Math.cos(moonAngle) * moonDist,
            (Math.random() - 0.5) * 1,
            Math.sin(moonAngle) * moonDist
        );
        moonMesh.userData.dynamic = true;
        moonMesh.userData.moonOrbit = { radius: moonDist, angle: moonAngle, speed: 0.5 + Math.random() * 0.5 };
        planetObj.add(moonMesh);

        // Moon orbit line
        const orbitCurve = new THREE.EllipseCurve(0, 0, moonDist, moonDist, 0, Math.PI * 2, false);
        const orbitPoints = orbitCurve.getPoints(64);
        const orbitGeo3 = new THREE.BufferGeometry().setFromPoints(orbitPoints.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const orbitLineMat = new THREE.LineBasicMaterial({ color: 0x667eea, transparent: true, opacity: 0.08 });
        const orbitLine = new THREE.Line(orbitGeo3, orbitLineMat);
        orbitLine.userData.dynamic = true;
        planetObj.add(orbitLine);
    }

    // Orbital ring around star
    const ringGeo = new THREE.TorusGeometry(orbitRadius, 0.08, 4, 200);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x667eea,
        transparent: true,
        opacity: 0.04,
    });
    const orbitRing = new THREE.Mesh(ringGeo, ringMat);
    orbitRing.rotation.x = Math.PI / 2;
    orbitRing.userData.dynamic = true;
    planetGroup.add(orbitRing);

    planetGroup.add(planetObj);

    planets.push({
        group: planetObj,
        orbitRadius,
        angle,
        speed: 0.015 + Math.random() * 0.025,
        mesh,
        data: planetData,
    });
}

/**
 * Animate planets, clouds, coronas, and accretion disks.
 */
export function animatePlanets(delta) {
    shaderTime += delta;

    planets.forEach((p) => {
        p.angle += p.speed * delta;
        p.group.position.x = Math.cos(p.angle) * p.orbitRadius;
        p.group.position.z = Math.sin(p.angle) * p.orbitRadius;
        p.mesh.rotation.y += delta * 0.2;

        // Update shader time
        if (p.mesh.material.uniforms) {
            p.mesh.material.uniforms.time.value = shaderTime;
        }
    });

    // Update cloud layers
    if (planetGroup) {
        planetGroup.traverse((child) => {
            if (child.userData.isCloud && child.material.uniforms) {
                child.material.uniforms.time.value = shaderTime;
                child.rotation.y += delta * 0.08;
            }
            if (child.userData.isCorona && child.material.uniforms) {
                child.material.uniforms.time.value = shaderTime;
            }
            if (child.userData.isAccretion) {
                child.rotation.z += delta * child.userData.rotSpeed;
            }
            if (child.userData.moonOrbit) {
                const mo = child.userData.moonOrbit;
                mo.angle += mo.speed * delta;
                child.position.x = Math.cos(mo.angle) * mo.radius;
                child.position.z = Math.sin(mo.angle) * mo.radius;
            }
        });
    }

    if (starMesh) {
        starMesh.rotation.y += delta * 0.05;
    }
}

/**
 * Remove all planets from the scene.
 */
export function removePlanets(scene) {
    if (planetGroup) {
        planetGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                child.material.dispose();
            }
        });
        scene.remove(planetGroup);
        planetGroup = null;
        starLight = null;
        starMesh = null;
        starGlowMesh = null;
        planets = [];
    }
}

/**
 * Get the list of planet meshes for interaction.
 */
export function getPlanetMeshes() {
    return planets.map(p => p.mesh);
}
