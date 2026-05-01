import * as THREE from 'three';
import { InputState, updateInput, clearInputImpulses } from './input.js';

let camera;
const velocity = new THREE.Vector3();
const rotationVelocity = new THREE.Vector3();

// Physics settings
const MAX_SPEED = 50.0;
const ACCELERATION = 200.0;
const DAMPING = 0.95; // Simulates friction/inertial dampeners

const ROTATION_SPEED = 2.0;
const ROTATION_DAMPING = 0.85;

// Quaternion for smooth rotation accumulation
const targetRotation = new THREE.Quaternion();

/**
 * Initialize the 6DOF Ship Controller
 * @param {THREE.PerspectiveCamera} cam
 */
export function initControls(cam) {
    camera = cam;
    targetRotation.copy(camera.quaternion);
}

/**
 * Update the camera position and rotation based on physics and input.
 * Must be called in the animate() loop.
 * @param {number} delta - Time since last frame in seconds
 */
export function updateControls(delta) {
    if (!camera) return;

    // 1. Update hardware inputs
    updateInput();

    // 2. Handle Rotation
    // Yaw (Y) and Pitch (X) from look axes
    const pitch = InputState.lookY * ROTATION_SPEED;
    const yaw = InputState.lookX * ROTATION_SPEED;
    const roll = InputState.roll * ROTATION_SPEED * 0.5;

    // Accumulate rotational velocity (for smoothness)
    rotationVelocity.x += pitch * delta;
    rotationVelocity.y += yaw * delta;
    rotationVelocity.z += roll * delta;

    // Apply rotation relative to current orientation
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotationVelocity.x);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationVelocity.y);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationVelocity.z);

    // Multiply quaternions to combine rotations. Order matters: Yaw -> Pitch -> Roll
    const qTemp = new THREE.Quaternion().multiplyQuaternions(qYaw, qPitch).multiply(qRoll);
    targetRotation.multiply(qTemp);
    targetRotation.normalize();

    // Slerp camera for smooth rotation
    camera.quaternion.slerp(targetRotation, 0.3);

    // Apply rotational damping
    rotationVelocity.multiplyScalar(ROTATION_DAMPING);

    // 3. Handle Movement Translation
    // Input is relative to local axes
    const localThrust = new THREE.Vector3(
        InputState.moveX,
        InputState.moveY,
        InputState.moveZ
    );

    // Boost multiplier
    const speedMult = InputState.boost ? 3.0 : 1.0;

    if (localThrust.lengthSq() > 0) {
        localThrust.normalize();
        
        // Convert local thrust to world space based on camera orientation
        const worldThrust = localThrust.applyQuaternion(camera.quaternion);
        
        // Add to velocity
        velocity.add(worldThrust.multiplyScalar(ACCELERATION * speedMult * delta));
    }

    // Clamp speed
    if (velocity.length() > MAX_SPEED * speedMult) {
        velocity.normalize().multiplyScalar(MAX_SPEED * speedMult);
    }

    // Apply translational damping (inertial dampeners)
    velocity.multiplyScalar(DAMPING);

    // Move camera
    camera.position.addScaledVector(velocity, delta);

    // 4. Cleanup impulse states
    clearInputImpulses();
}

/**
 * Forces the controller to look at a specific point
 */
export function lookAt(targetPosition) {
    if (!camera) return;
    camera.lookAt(targetPosition);
    targetRotation.copy(camera.quaternion);
}

/**
 * Hard sets the position
 */
export function setPosition(x, y, z) {
    if (!camera) return;
    camera.position.set(x, y, z);
    velocity.set(0, 0, 0);
}
