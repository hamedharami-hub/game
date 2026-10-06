/**
 * Living Wildlife & Peaceful Planetary Fauna System.
 *
 * Gentle butterflies that flutter around blooming flowers,
 * an ethereal glowing Spirit Deer in the sacred grove,
 * soaring Celestial Birds circling the high skies,
 * and luminous fish swimming in the crystal pond.
 */
import * as T from 'three';
import { planetElevation } from './interactions.ts';

export interface ButterflyState {
  position: T.Vector3;
  target: T.Vector3;
  color: string;
  wingAngle: number;
  flapSpeed: number;
  orbitRadius: number;
  orbitAngle: number;
}

export function calculateButterflyPosition(
  center: { x: number; y: number; z: number },
  orbitAngle: number,
  orbitRadius: number,
  heightBob: number
): { x: number; y: number; z: number } {
  const cx = Number.isFinite(center?.x) ? center.x : 0;
  const cy = Number.isFinite(center?.y) ? center.y : 0;
  const cz = Number.isFinite(center?.z) ? center.z : 0;

  const r = Math.max(0.2, Number.isFinite(orbitRadius) ? orbitRadius : 1.2);
  const ang = Number.isFinite(orbitAngle) ? orbitAngle : 0;
  const bob = Number.isFinite(heightBob) ? heightBob : 0;

  return {
    x: cx + Math.cos(ang) * r,
    y: Math.max(0.4, cy + 0.65 + bob),
    z: cz + Math.sin(ang) * r,
  };
}

export function calculateButterflyWingFlap(time: number, speed: number = 10): number {
  const t = Number.isFinite(time) ? time : 0;
  return Math.sin(t * speed) * 0.75;
}

export function calculateCelestialBirdPosition(
  center: { x: number; y: number; z: number },
  flightAngle: number,
  flightRadius: number,
  altitude: number,
  pitchBob: number
): { x: number; y: number; z: number } {
  const cx = Number.isFinite(center?.x) ? center.x : 0;
  const cy = Number.isFinite(center?.y) ? center.y : 0;
  const cz = Number.isFinite(center?.z) ? center.z : 0;
  const r = Math.max(1.0, Number.isFinite(flightRadius) ? flightRadius : 22);
  const ang = Number.isFinite(flightAngle) ? flightAngle : 0;
  const alt = Math.max(2.0, Number.isFinite(altitude) ? altitude : 12.0);
  const bob = Number.isFinite(pitchBob) ? pitchBob : 0;

  return {
    x: cx + Math.cos(ang) * r,
    y: cy + alt + bob,
    z: cz + Math.sin(ang) * r,
  };
}

export function calculateFishPondPosition(
  center: { x: number; y: number; z: number },
  swimAngle: number,
  swimRadiusX: number,
  swimRadiusZ: number
): { x: number; y: number; z: number } {
  const cx = Number.isFinite(center?.x) ? center.x : 0;
  const cy = Number.isFinite(center?.y) ? center.y : 0;
  const cz = Number.isFinite(center?.z) ? center.z : 0;
  const rx = Math.max(0.2, Number.isFinite(swimRadiusX) ? swimRadiusX : 2.8);
  const rz = Math.max(0.2, Number.isFinite(swimRadiusZ) ? swimRadiusZ : 2.2);
  const ang = Number.isFinite(swimAngle) ? swimAngle : 0;

  return {
    x: cx + Math.cos(ang) * rx,
    y: cy + 0.16,
    z: cz + Math.sin(ang) * rz,
  };
}

export interface SpiritDeerState {
  position: T.Vector3;
  targetPosition: T.Vector3;
  headingAngle: number;
  isGrazing: boolean;
  stateTimer: number;
}

export function createSpiritDeerState(homeX = -21, homeZ = 19): SpiritDeerState {
  return {
    position: new T.Vector3(homeX, 0, homeZ),
    targetPosition: new T.Vector3(homeX, 0, homeZ),
    headingAngle: 0,
    isGrazing: true,
    stateTimer: 0,
  };
}

export function updateSpiritDeerState(
  state: SpiritDeerState,
  dt: number,
  homeCenter = { x: -21, z: 19 },
  wanderRadius = 4.5
): SpiritDeerState {
  const safeDt = Math.min(Math.max(0, Number.isFinite(dt) ? dt : 0), 0.5);
  let { isGrazing, stateTimer, headingAngle } = state;
  const pos = state.position.clone();
  let target = state.targetPosition.clone();

  stateTimer += safeDt;

  if (isGrazing) {
    if (stateTimer > 6.0) {
      // Pick a new wander target near grove
      isGrazing = false;
      stateTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.0 + Math.random() * wanderRadius;
      target.set(homeCenter.x + Math.cos(angle) * dist, 0, homeCenter.z + Math.sin(angle) * dist);
    }
  } else {
    // Walk towards target
    const step = target.clone().sub(pos).setY(0);
    const dist = step.length();
    if (dist < 0.25 || stateTimer > 8.0) {
      isGrazing = true;
      stateTimer = 0;
    } else {
      step.normalize();
      headingAngle = Math.atan2(step.x, step.z);
      pos.addScaledVector(step, Math.min(dist, safeDt * 0.85));
    }
  }

  return {
    position: pos,
    targetPosition: target,
    headingAngle,
    isGrazing,
    stateTimer,
  };
}

export function createFaunaMeshGroup(scene: T.Scene) {
  const root = new T.Group();
  root.name = 'fauna-group';
  const dummy = new T.Object3D();

  // --- 1. Butterfly meshes (3 colorful pairs) ---
  const butterflyColors = ['#ffd6ea', '#bdf4ff', '#fff3be'];
  const butterflies: { group: T.Group; wings: T.InstancedMesh; flap: (flap: number) => void; center: T.Vector3 }[] = [];
  const wingGeom = new T.PlaneGeometry(0.18, 0.26);
  wingGeom.translate(0.09, 0, 0);

  for (let i = 0; i < butterflyColors.length; i++) {
    const bGroup = new T.Group();

    const wingMat = new T.MeshStandardMaterial({
      color: butterflyColors[i],
      emissive: butterflyColors[i],
      emissiveIntensity: 0.6,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    // Both wings of a butterfly share one batch: same geometry, same material,
    // only the flap angle differs, so the pair costs a single draw call.
    const wings = new T.InstancedMesh(wingGeom, wingMat, 2);
    wings.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const flap = (angle: number) => {
      dummy.position.set(-0.02, 0, 0);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wings.setMatrixAt(0, dummy.matrix);
      dummy.position.set(0.02, 0, 0);
      dummy.rotation.set(0, Math.PI - angle, 0);
      dummy.updateMatrix();
      wings.setMatrixAt(1, dummy.matrix);
      wings.instanceMatrix.needsUpdate = true;
    };
    flap(0);
    bGroup.add(wings);
    root.add(bGroup);

    butterflies.push({
      group: bGroup,
      wings,
      flap,
      center: new T.Vector3(-2 + (i - 1) * 2.2, 0, 14 + (i - 1) * 1.8),
    });
  }

  // --- 2. Spirit Deer mesh (Luminous ethereal stylized mesh) ---
  const deerGroup = new T.Group();
  deerGroup.position.set(-21, 0, 19);

  const deerMaterial = new T.MeshStandardMaterial({
    color: '#ebf9ff',
    emissive: '#b6e9ff',
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.1,
  });

  // Torso
  const body = new T.Mesh(new T.CylinderGeometry(0.32, 0.28, 1.1, 8), deerMaterial);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.95;
  deerGroup.add(body);

  // Neck and Head
  const neck = new T.Mesh(new T.CylinderGeometry(0.14, 0.22, 0.65, 6), deerMaterial);
  neck.position.set(0.45, 1.35, 0);
  neck.rotation.z = -0.45;
  deerGroup.add(neck);

  const head = new T.Mesh(new T.ConeGeometry(0.16, 0.42, 6), deerMaterial);
  head.position.set(0.68, 1.62, 0);
  head.rotation.z = -Math.PI / 2;
  deerGroup.add(head);

  // Antlers (Crystal glowing horns)
  const antlerMat = new T.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#d6f4ff',
    emissiveIntensity: 0.85,
    roughness: 0.1,
  });
  const antlers = new T.InstancedMesh(new T.TorusGeometry(0.24, 0.028, 4, 12, Math.PI * 0.9), antlerMat, 2);
  [[-0.14, 0.4], [0.14, -0.4]].forEach(([az, ax], index) => {
    dummy.position.set(0.62, 1.82, az);
    dummy.rotation.set(ax, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    antlers.setMatrixAt(index, dummy.matrix);
  });
  antlers.instanceMatrix.needsUpdate = true;
  deerGroup.add(antlers);

  // 4 Legs
  const legGeom = new T.CylinderGeometry(0.045, 0.035, 0.88, 5);
  const legs = new T.InstancedMesh(legGeom, deerMaterial, 4);
  [[-0.38, -0.16], [-0.38, 0.16], [0.38, -0.16], [0.38, 0.16]].forEach(([lx, lz], index) => {
    dummy.position.set(lx, 0.44, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    legs.setMatrixAt(index, dummy.matrix);
  });
  legs.instanceMatrix.needsUpdate = true;
  deerGroup.add(legs);

  root.add(deerGroup);

  // --- 3. Celestial Soaring Birds (3 graceful luminous sky birds) ---
  const celestialBirds: { group: T.Group; orbitRadius: number; altitude: number; speed: number; phase: number }[] = [];
  const birdMat = new T.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#e6f7ff',
    emissiveIntensity: 0.75,
    side: T.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });

  // The flock shares one body batch and one wing batch (world matrices are set
  // per frame), so three birds cost two draw calls instead of nine.
  const birdBodies = new T.InstancedMesh(new T.ConeGeometry(0.12, 0.55, 5), birdMat, 3);
  const birdWingGeom = new T.PlaneGeometry(0.42, 0.22);
  birdWingGeom.translate(0.21, 0, 0);
  const birdWings = new T.InstancedMesh(birdWingGeom, birdMat, 6);
  birdBodies.instanceMatrix.setUsage(T.DynamicDrawUsage);
  birdWings.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const birdScratch = new T.Matrix4();
  root.add(birdBodies, birdWings);

  for (let i = 0; i < 3; i++) {
    const birdGroup = new T.Group();
    root.add(birdGroup);

    celestialBirds.push({
      group: birdGroup,
      orbitRadius: 18 + i * 5,
      altitude: 10.5 + i * 2.2,
      speed: 0.28 + i * 0.06,
      phase: i * 2.09,
    });
  }

  // --- 4. Luminous Pond Fish (3 glowing koi in central water) ---
  const pondFish: { group: T.Group; tail: T.Mesh; radiusX: number; radiusZ: number; speed: number; phase: number }[] = [];
  const fishColors = ['#ffad80', '#ffd67a', '#7ee2cf'];

  for (let i = 0; i < 3; i++) {
    const fGroup = new T.Group();
    const fishMat = new T.MeshStandardMaterial({
      color: fishColors[i],
      emissive: fishColors[i],
      emissiveIntensity: 0.7,
      roughness: 0.2,
    });

    const fBody = new T.Mesh(new T.ConeGeometry(0.1, 0.38, 5), fishMat);
    fBody.rotation.z = Math.PI / 2;
    fGroup.add(fBody);

    const tailGeom = new T.PlaneGeometry(0.15, 0.16);
    tailGeom.translate(-0.075, 0, 0);
    const fTail = new T.Mesh(tailGeom, fishMat);
    fTail.position.set(-0.2, 0, 0);
    fTail.rotation.x = Math.PI / 2;
    fGroup.add(fTail);

    root.add(fGroup);

    pondFish.push({
      group: fGroup,
      tail: fTail,
      radiusX: 2.2 + i * 0.9,
      radiusZ: 1.8 + i * 0.8,
      speed: 0.45 + i * 0.12,
      phase: i * 2.2,
    });
  }

  scene.add(root);

  let deerState = createSpiritDeerState(-21, 19);

  return {
    root,
    update: (time: number, dt: number, reducedMotion = false) => {
      // Animate butterflies
      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        if (reducedMotion) {
          b.group.position.set(b.center.x, 0.8 + planetElevation(b.center.x, b.center.z), b.center.z);
          continue;
        }
        const ang = time * 0.85 + i * 2.1;
        const bob = Math.sin(time * 3.5 + i) * 0.18;
        const pos = calculateButterflyPosition(b.center, ang, 1.35 + Math.sin(time * 0.5 + i) * 0.35, bob);
        const elevation = planetElevation(pos.x, pos.z);
        b.group.position.set(pos.x, pos.y + elevation, pos.z);

        const wingFlap = calculateButterflyWingFlap(time, 14 + i * 2);
        b.flap(wingFlap);
      }

      // Animate spirit deer
      if (!reducedMotion) {
        deerState = updateSpiritDeerState(deerState, dt);
        const deerElevation = planetElevation(deerState.position.x, deerState.position.z);
        deerGroup.position.set(deerState.position.x, deerElevation, deerState.position.z);
        deerGroup.rotation.y = deerState.headingAngle - Math.PI / 2;
        // Subtle breathing
        const breath = Math.sin(time * 1.6) * 0.02;
        body.position.y = 0.95 + breath;
      }

      // Animate celestial soaring birds
      for (let i = 0; i < celestialBirds.length; i++) {
        const cb = celestialBirds[i];
        const birdAng = time * cb.speed + cb.phase;
        const bob = Math.sin(time * 1.8 + i) * 0.35;
        const pos = calculateCelestialBirdPosition({ x: 0, y: 0, z: 0 }, birdAng, cb.orbitRadius, cb.altitude, bob);
        cb.group.position.set(pos.x, pos.y, pos.z);
        cb.group.rotation.y = -birdAng + Math.PI / 2;
        cb.group.updateMatrix();

        const birdFlap = reducedMotion ? 0 : Math.sin(time * 5.5 + i) * 0.38;
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        birdBodies.setMatrixAt(i, birdScratch.multiplyMatrices(cb.group.matrix, dummy.matrix));
        dummy.position.set(-0.04, 0, 0);
        dummy.rotation.set(0, 0, birdFlap);
        dummy.updateMatrix();
        birdWings.setMatrixAt(i * 2, birdScratch.multiplyMatrices(cb.group.matrix, dummy.matrix));
        dummy.position.set(0.04, 0, 0);
        dummy.rotation.set(0, Math.PI, -birdFlap);
        dummy.updateMatrix();
        birdWings.setMatrixAt(i * 2 + 1, birdScratch.multiplyMatrices(cb.group.matrix, dummy.matrix));
      }
      birdBodies.instanceMatrix.needsUpdate = true;
      birdWings.instanceMatrix.needsUpdate = true;

      // Animate luminous pond fish
      for (let i = 0; i < pondFish.length; i++) {
        const pf = pondFish[i];
        const fishAng = time * pf.speed + pf.phase;
        const pos = calculateFishPondPosition({ x: 0, y: 0, z: 0 }, fishAng, pf.radiusX, pf.radiusZ);
        pf.group.position.set(pos.x, pos.y, pos.z);
        // Face tangential velocity
        pf.group.rotation.y = -fishAng;

        if (!reducedMotion) {
          pf.tail.rotation.y = Math.sin(time * 7.5 + i * 2) * 0.42;
        }
      }
    },
  };
}
