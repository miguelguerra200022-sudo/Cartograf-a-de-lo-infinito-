import fs from 'fs';

let content = fs.readFileSync('js/planet_surface.js', 'utf8');

// Replace flat background with HemisphereLight and SkyDome
const targetAtmosphere = `    // Set atmosphere
    if (scene) {
        scene.background = new THREE.Color(palette.sky);
        scene.fog = new THREE.FogExp2(palette.fog, 0.002);
    }`;

const replaceAtmosphere = `    // Set atmosphere and lighting
    if (scene) {
        scene.background = new THREE.Color(palette.fog); // Background matches fog at horizon
        scene.fog = new THREE.FogExp2(palette.fog, 0.0018); // Slightly lighter fog for visibility
        
        // SkyDome for smooth gradient (zenith to horizon)
        const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(palette.sky) },
                bottomColor: { value: new THREE.Color(palette.fog) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: \`
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            \`,
            fragmentShader: \`
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            \`,
            side: THREE.BackSide,
            fog: false
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.name = 'planet-skydome';
        scene.add(sky);
    }`;

// Replace flat ambient light with Hemisphere Light
const targetLights = `    // Planet lighting
    const ambientLight = new THREE.AmbientLight(palette.sky, 0.4);
    scene.add(ambientLight);

    // Create sun
    sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    sunLight.position.set(100, 200, 50);
    sunLight.castShadow = true;
    
    // Optimize shadows
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 1000;
    scene.add(sunLight);

    // Simple sun sprite
    const sunGeo = new THREE.CircleGeometry(20, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    sunSprite = new THREE.Mesh(sunGeo, sunMat);
    sunSprite.position.copy(sunLight.position).multiplyScalar(5);
    scene.add(sunSprite);`;

const replaceLights = `    // Planet lighting (Hemisphere light for better natural bounce)
    const hemiLight = new THREE.HemisphereLight(palette.sky, palette.low, 0.6);
    hemiLight.name = 'planet-hemi-light';
    scene.add(hemiLight);

    // Create sun
    sunLight = new THREE.DirectionalLight(0xffffee, 2.5);
    sunLight.position.set(400, 800, 200); // Higher up for better shadows over large terrain
    sunLight.castShadow = true;
    
    // Optimize shadows for terrain
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 400; // Large orthographic bounds for terrain shadows
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 3000;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Sun sprite with soft glow
    const sunGroup = new THREE.Group();
    sunGroup.name = 'planet-sun-group';
    
    const sunGeo = new THREE.CircleGeometry(80, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, fog: false, transparent: true, opacity: 0.9 });
    const sunCore = new THREE.Mesh(sunGeo, sunMat);
    sunGroup.add(sunCore);
    
    const glowGeo = new THREE.CircleGeometry(250, 32);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffddaa, fog: false, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending });
    const sunGlow = new THREE.Mesh(glowGeo, glowMat);
    sunGroup.add(sunGlow);
    
    sunGroup.position.copy(sunLight.position).multiplyScalar(3);
    // Point sun group to center
    sunGroup.lookAt(0, 0, 0);
    sunSprite = sunGroup;
    scene.add(sunSprite);`;

content = content.replace(targetAtmosphere, replaceAtmosphere);
content = content.replace(targetLights, replaceLights);

// We also need to remove these elements in leavePlanet!
const targetLeave = `    if (sunLight) scene.remove(sunLight);
    if (sunSprite) scene.remove(sunSprite);`;

const replaceLeave = `    if (sunLight) scene.remove(sunLight);
    if (sunSprite) scene.remove(sunSprite);
    
    const sky = scene.getObjectByName('planet-skydome');
    if (sky) {
        sky.geometry.dispose();
        sky.material.dispose();
        scene.remove(sky);
    }
    
    const hemiLight = scene.getObjectByName('planet-hemi-light');
    if (hemiLight) scene.remove(hemiLight);`;

content = content.replace(targetLeave, replaceLeave);

fs.writeFileSync('js/planet_surface.js', content);
