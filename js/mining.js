import * as THREE from 'three';
import { store } from './store.js';
import { getTerrainGroup, getChunkConstants } from './chunk_manager.js';
import { playScanSound } from './audio.js';

let scene, camera;
let raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

// Visuals
let laserLine;
let impactGlow;

// State
let isMining = false;
let miningTimer = 0;
let currentTarget = null;
let currentInstanceId = -1;

export function initMining(sceneRef, cameraRef) {
    scene = sceneRef;
    camera = cameraRef;

    // Laser Beam
    const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
    ]);
    const mat = new THREE.LineBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });
    laserLine = new THREE.Line(geo, mat);
    laserLine.visible = false;
    laserLine.frustumCulled = false;
    scene.add(laserLine);

    // Impact Glow
    const glowGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    impactGlow = new THREE.Mesh(glowGeo, glowMat);
    impactGlow.visible = false;
    scene.add(impactGlow);
}

export function fireMiningLaser() {
    isMining = true;
    if (miningTimer <= 0) {
        try { playScanSound(); } catch(e) {}
    }
    miningTimer = 0.15;
}

export function updateMining(delta) {
    if (!isMining || !camera) {
        if (laserLine) laserLine.visible = false;
        if (impactGlow) impactGlow.visible = false;
        currentTarget = null;
        return;
    }

    miningTimer -= delta;
    if (miningTimer <= 0) {
        isMining = false;
        if (laserLine) laserLine.visible = false;
        if (impactGlow) impactGlow.visible = false;
        return;
    }

    const terrainGroup = getTerrainGroup();
    if (!terrainGroup) return;

    raycaster.setFromCamera(center, camera);
    
    // Intersect all children of terrainGroup (chunks and their props)
    let hits = [];
    terrainGroup.children.forEach(chunkGrp => {
        try {
            const localHits = raycaster.intersectObjects(chunkGrp.children, false);
            hits.push(...localHits);
        } catch(e) {}
    });
    
    // Sort by distance
    hits.sort((a, b) => a.distance - b.distance);

    let targetHit = null;
    for (let hit of hits) {
        if (hit.object.isInstancedMesh && hit.distance < 50) {
            targetHit = hit;
            break;
        }
    }

    if (targetHit) {
        const obj = targetHit.object;
        const id = targetHit.instanceId;
        
        // Laser Origin: relative to camera
        const origin = new THREE.Vector3(0.5, -0.5, -1);
        origin.applyMatrix4(camera.matrixWorld);
        
        const targetPos = targetHit.point;
        
        // Update Laser
        const positions = laserLine.geometry.attributes.position;
        positions.setXYZ(0, origin.x, origin.y, origin.z);
        positions.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
        positions.needsUpdate = true;
        laserLine.visible = true;

        // Update Glow
        impactGlow.position.copy(targetPos);
        impactGlow.scale.setScalar(1 + Math.random() * 0.5);
        impactGlow.visible = true;
        
        // Damage logic
        if (currentTarget !== obj || currentInstanceId !== id) {
            currentTarget = obj;
            currentInstanceId = id;
            destroyProp(obj, id);
        }
    } else {
        // Shoot into space
        const origin = new THREE.Vector3(0.5, -0.5, -1).applyMatrix4(camera.matrixWorld);
        const end = new THREE.Vector3(0, 0, -30).applyMatrix4(camera.matrixWorld);
        
        const positions = laserLine.geometry.attributes.position;
        positions.setXYZ(0, origin.x, origin.y, origin.z);
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        laserLine.visible = true;
        
        impactGlow.visible = false;
        currentTarget = null;
    }
}

function destroyProp(instancedMesh, instanceId) {
    let resourceType = 'carbon';
    let amount = Math.floor(Math.random() * 10) + 5;
    
    const mat = instancedMesh.material;
    if (mat.color && mat.color.getHex() === 0x777788) resourceType = 'iron';
    else if (mat.emissive && mat.emissive.getHex() === 0x008888) resourceType = 'silicon';
    else resourceType = 'carbon';
    
    // Hide the instance by scaling it to 0
    const matrix = new THREE.Matrix4();
    instancedMesh.getMatrixAt(instanceId, matrix);
    
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    
    scale.set(0, 0, 0);
    matrix.compose(position, quaternion, scale);
    
    instancedMesh.setMatrixAt(instanceId, matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;

    // Grant resources via store (correct Redux-style API)
    try {
        const storeState = store.getState();
        const current = storeState.quarks || 0;
        store.dispatch({ type: 'ADD_QUARKS', payload: amount });
    } catch(e) {
        console.log('[MINING] Store dispatch error:', e);
    }
    
    showMiningPopup(resourceType, amount);
}

function showMiningPopup(resourceType, amount) {
    const popup = document.getElementById('mining-popup');
    if (!popup) return;
    
    const names = {
        'carbon': 'Carbono',
        'iron': 'Hierro',
        'silicon': 'Silicio'
    };
    
    const colors = {
        'carbon': '#33aa44',
        'iron': '#aaaaaa',
        'silicon': '#00ffff'
    };
    
    const name = names[resourceType] || resourceType;
    const color = colors[resourceType] || '#ffffff';
    
    popup.textContent = '+' + amount + ' ' + name;
    popup.style.color = color;
    popup.style.textShadow = '0 0 5px ' + color;
    
    // Random jitter
    const jx = 10 + Math.random() * 20;
    const jy = -10 - Math.random() * 20;
    popup.style.transform = 'translate(' + jx + 'px, ' + jy + 'px)';
    
    popup.style.display = 'block';
    
    if (popup._timeout) clearTimeout(popup._timeout);
    popup._timeout = setTimeout(() => {
        popup.style.display = 'none';
    }, 1500);
}

export function cleanupMining() {
    if (laserLine) laserLine.visible = false;
    if (impactGlow) impactGlow.visible = false;
    isMining = false;
}
