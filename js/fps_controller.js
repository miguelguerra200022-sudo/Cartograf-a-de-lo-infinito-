/**
 * js/fps_controller.js
 * First-Person Surface Controller with real physics.
 * 
 * When the player is on a planet surface, this replaces the 6DOF ship controls
 * with a ground-based FPS controller featuring:
 *   - Gravity (9.8 m/s² scaled to game units)
 *   - Terrain collision (walk ON the ground, not through it)
 *   - Jumping
 *   - Head bobbing for walking feel
 *   - Smooth camera look (pitch/yaw only, no roll)
 */

import * as THREE from 'three';
import { InputState } from './input.js';
import { getTerrainHeightAt } from './chunk_manager.js';

// ─── Constants ───
const GRAVITY = 25.0;          // Downward acceleration (world units/s²)
const JUMP_FORCE = 12.0;       // Initial upward velocity on jump
const WALK_SPEED = 18.0;       // Horizontal movement speed
const SPRINT_MULTIPLIER = 2.2; // Speed multiplier when boosting
const EYE_HEIGHT = 2.5;        // Camera height above ground
const GROUND_SNAP = 0.5;       // Snap to ground threshold
const DAMPING = 0.88;          // Horizontal velocity damping (simulates friction)
const PITCH_LIMIT = Math.PI / 2 - 0.05; // Prevent looking straight up/down

// Head bobbing parameters
const BOB_FREQUENCY = 8.0;     // Steps per second
const BOB_AMPLITUDE = 0.15;    // Vertical bob amount
const BOB_HORIZONTAL = 0.08;   // Horizontal sway amount

// ─── State ───
let camera = null;
let enabled = false;

const velocity = new THREE.Vector3(0, 0, 0);
let yaw = 0;        // Horizontal rotation (radians)
let pitch = 0;      // Vertical rotation (radians)
let isGrounded = false;
let jumpCooldown = 0;

// Head bob state
let bobTimer = 0;
let bobActive = false;

// Reusable vectors (avoid GC pressure)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

/**
 * Initialize the FPS controller.
 * @param {THREE.PerspectiveCamera} cam
 */
export function initFPSController(cam) {
    camera = cam;
}

/**
 * Enable FPS mode — call when entering a planet.
 * Captures current camera facing direction as initial yaw/pitch.
 */
export function enableFPS() {
    if (!camera) return;
    enabled = true;
    velocity.set(0, 0, 0);
    isGrounded = false;
    jumpCooldown = 0;
    bobTimer = 0;

    // Extract yaw and pitch from current camera orientation
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = euler.y;
    pitch = euler.x;
    
    // Clamp pitch
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/**
 * Disable FPS mode — call when leaving a planet.
 */
export function disableFPS() {
    enabled = false;
    velocity.set(0, 0, 0);
}

/**
 * Check if FPS controller is active.
 */
export function isFPSActive() {
    return enabled;
}

/**
 * Main update loop — call every frame from animate().
 * @param {number} delta - Time since last frame in seconds
 */
export function updateFPSController(delta) {
    if (!enabled || !camera) return;

    // Clamp delta to prevent physics explosion on tab-switch
    delta = Math.min(delta, 0.1);

    // ─── 1. Camera Look (Pitch + Yaw) ───
    const lookSensitivity = 2.5;
    yaw += InputState.lookX * lookSensitivity * delta;
    pitch += InputState.lookY * lookSensitivity * delta;

    // Clamp pitch to prevent flipping
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

    // Apply rotation via Euler angles (YXZ order = FPS standard)
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // ─── 2. Horizontal Movement ───
    // Forward vector (projected onto horizontal plane)
    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _forward.y = 0;
    _forward.normalize();

    // Right vector
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _right.y = 0;
    _right.normalize();

    // Compose move direction from input
    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_right, InputState.moveX);
    _moveDir.addScaledVector(_forward, -InputState.moveZ); // -Z = forward in our input convention

    const isMoving = _moveDir.lengthSq() > 0.01;
    if (isMoving) {
        _moveDir.normalize();
        const speed = WALK_SPEED * (InputState.boost ? SPRINT_MULTIPLIER : 1.0);
        velocity.x += _moveDir.x * speed * delta;
        velocity.z += _moveDir.z * speed * delta;
    }

    // Horizontal damping (friction)
    velocity.x *= DAMPING;
    velocity.z *= DAMPING;

    // ─── 3. Gravity & Jump ───
    velocity.y -= GRAVITY * delta;

    // Jump
    jumpCooldown -= delta;
    if (isGrounded && InputState.moveY > 0.5 && jumpCooldown <= 0) {
        velocity.y = JUMP_FORCE;
        isGrounded = false;
        jumpCooldown = 0.3; // Prevent bunny-hopping
    }

    // ─── 4. Apply Velocity ───
    camera.position.x += velocity.x * delta;
    camera.position.y += velocity.y * delta;
    camera.position.z += velocity.z * delta;

    // ─── 5. Ground Collision ───
    const groundY = getTerrainHeightAt(camera.position.x, camera.position.z);
    const feetY = groundY + EYE_HEIGHT;

    if (camera.position.y <= feetY) {
        camera.position.y = feetY;
        velocity.y = 0;
        isGrounded = true;
    } else if (camera.position.y > feetY + GROUND_SNAP) {
        isGrounded = false;
    }

    // ─── 6. Head Bob ───
    if (isGrounded && isMoving) {
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        const bobSpeed = BOB_FREQUENCY * (InputState.boost ? 1.6 : 1.0);
        bobTimer += delta * bobSpeed;
        bobActive = true;

        const bobY = Math.sin(bobTimer * Math.PI * 2) * BOB_AMPLITUDE * Math.min(speed / WALK_SPEED, 1.0);
        const bobX = Math.cos(bobTimer * Math.PI) * BOB_HORIZONTAL * Math.min(speed / WALK_SPEED, 1.0);
        
        camera.position.y += bobY;
        // Apply horizontal sway in local space
        camera.position.x += _right.x * bobX * delta;
        camera.position.z += _right.z * bobX * delta;
    } else {
        // Smoothly decay bob
        if (bobActive) {
            bobTimer *= 0.9;
            if (Math.abs(bobTimer) < 0.01) {
                bobTimer = 0;
                bobActive = false;
            }
        }
    }
}

/**
 * Get current state info for HUD display.
 */
export function getFPSState() {
    return {
        isGrounded,
        velocity: velocity.length(),
        yaw,
        pitch,
    };
}
