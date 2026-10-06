/**
 * Couple Interactions & Soaring Flight Traversal Mechanics.
 *
 * Pure mathematical functions, state management, and intimacy action descriptors
 * for Angel and Gorastakh's cooperative gameplay.
 */

export type TraversalMode = 'ground' | 'hand_holding' | 'soaring';
export type FlightState = 'grounded' | 'ascending' | 'cruising' | 'descending';
export type IntimacyActionKind = 'handhold' | 'fly' | 'hug' | 'wave' | 'sit' | 'walk';

/** Calculates spherical planet elevation drop to produce rolling planetary horizon. */
export function planetElevation(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const d2 = x * x + z * z;
  return -0.00032 * d2;
}

export interface IntimacyActionDescriptor {
  kind: IntimacyActionKind;
  label: string;
  ariaLabel: string;
  durationMs: number;
  statusMessage: string;
  requiresProximity: boolean;
}

export const INTIMACY_ACTIONS: Record<IntimacyActionKind, IntimacyActionDescriptor> = {
  handhold: {
    kind: 'handhold',
    label: 'دست هم را بگیریم',
    ariaLabel: 'دست هم را بگیریم',
    durationMs: 0, // continuous mode
    statusMessage: 'دست‌های یکدیگر را گرفتید؛ گام‌هایتان یکی شد.',
    requiresProximity: true,
  },
  fly: {
    kind: 'fly',
    label: 'پرواز دونفره',
    ariaLabel: 'پرواز دونفره',
    durationMs: 0, // continuous mode
    statusMessage: 'پرواز دونفره آغاز شد؛ با کلیدهای جهت‌دار اوج بگیرید.',
    requiresProximity: false,
  },
  hug: {
    kind: 'hug',
    label: 'در آغوش کشیدن',
    ariaLabel: 'در آغوش کشیدن گوراستاخ',
    durationMs: 3200,
    statusMessage: 'یکدیگر را با گرمی در آغوش کشیدید؛ نوای آرامش در دشت طنین‌انداز شد.',
    requiresProximity: true,
  },
  wave: {
    kind: 'wave',
    label: 'سلام',
    ariaLabel: 'سلام به گوراستاخ',
    durationMs: 1250,
    statusMessage: 'به گوراستاخ سلام کردی.',
    requiresProximity: false,
  },
  sit: {
    kind: 'sit',
    label: 'کمی بنشینیم',
    ariaLabel: 'نشستن دونفره',
    durationMs: 9000,
    statusMessage: 'کنار هم نشستید.',
    requiresProximity: false,
  },
  walk: {
    kind: 'walk',
    label: 'با هم قدم بزنیم',
    ariaLabel: 'قدم‌زدن دونفره',
    durationMs: 2200,
    statusMessage: 'با هم قدم زدید.',
    requiresProximity: false,
  },
};

export function getIntimacyActionDescriptor(kind: IntimacyActionKind): IntimacyActionDescriptor {
  return INTIMACY_ACTIONS[kind];
}

export interface TraversalState {
  mode: TraversalMode;
  altitude: number;
  targetAltitude: number;
  flightState: FlightState;
  isFlying: boolean;
  isHandHolding: boolean;
  handSideSign: number; // +1 = right side, -1 = left side
  idleTimer: number;
}

export const MIN_FLIGHT_ALTITUDE = 1.2;
export const CRUISE_ALTITUDE = 4.0;
export const MAX_FLIGHT_ALTITUDE = 12.0;
export const HAND_HOLD_SPACING = 0.90;
export const HAND_HOLD_MAX_PROXIMITY = 3.5;
export const HAND_HOLD_BREAK_DISTANCE = 4.2;
export const IDLE_AWARENESS_THRESHOLD_MS = 4500;

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

export interface PlacementPoint {
  x: number;
  z: number;
}

/** Circular playable area. Its center may be offset from the world origin. */
export interface PlacementLand extends ObstacleCircle {}

function finitePoint(point: PlacementPoint): PlacementPoint | null {
  return Number.isFinite(point?.x) && Number.isFinite(point?.z)
    ? { x: point.x, z: point.z }
    : null;
}

function nonNegativeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Clamp a world-space point into the usable disc, keeping the whole object's
 * circular footprint on the land. Invalid coordinates safely fall back to the
 * land center; invalid land dimensions collapse to a point at that center.
 */
export function projectPointToLand(
  point: PlacementPoint,
  land: PlacementLand,
  footprintRadius = 0,
): PlacementPoint {
  const centerX = Number.isFinite(land?.x) ? land.x : 0;
  const centerZ = Number.isFinite(land?.z) ? land.z : 0;
  const landRadius = Number.isFinite(land?.radius) ? Math.max(0, land.radius) : 0;
  const footprint = nonNegativeFinite(footprintRadius);
  const usableRadius = Math.max(0, landRadius - footprint);
  const candidate = finitePoint(point) ?? { x: centerX, z: centerZ };
  const dx = candidate.x - centerX;
  const dz = candidate.z - centerZ;
  const distance = Math.hypot(dx, dz);

  if (!Number.isFinite(distance) || distance <= usableRadius || distance === 0) {
    return distance === 0 || !Number.isFinite(distance)
      ? { x: centerX, z: centerZ }
      : candidate;
  }

  const scale = usableRadius / distance;
  return { x: centerX + dx * scale, z: centerZ + dz * scale };
}

/** Snap a point to a square grid; a zero/invalid grid size preserves free placement. */
export function snapPointToGrid(point: PlacementPoint, gridSize = 0.5): PlacementPoint {
  const candidate = finitePoint(point) ?? { x: 0, z: 0 };
  if (!Number.isFinite(gridSize) || gridSize <= 0) return candidate;
  const snapped = {
    x: Math.round(candidate.x / gridSize) * gridSize,
    z: Math.round(candidate.z / gridSize) * gridSize,
  };
  return finitePoint(snapped) ?? candidate;
}

/** Project, optionally snap, then re-project so snapping cannot cross the land edge. */
export function projectAndSnapToLand(
  point: PlacementPoint,
  land: PlacementLand,
  footprintRadius = 0,
  gridSize = 0.5,
): PlacementPoint {
  const projected = projectPointToLand(point, land, footprintRadius);
  return projectPointToLand(snapPointToGrid(projected, gridSize), land, footprintRadius);
}

/** Return whether the complete circular footprint fits inside the usable land disc. */
export function isFootprintInsideLand(
  point: PlacementPoint,
  footprintRadius: number,
  land: PlacementLand,
): boolean {
  const candidate = finitePoint(point);
  if (!candidate || !Number.isFinite(land?.radius) || land.radius < 0) return false;
  const centerX = Number.isFinite(land.x) ? land.x : 0;
  const centerZ = Number.isFinite(land.z) ? land.z : 0;
  const footprint = nonNegativeFinite(footprintRadius);
  const usableRadius = land.radius - footprint;
  if (usableRadius < 0) return false;
  return Math.hypot(candidate.x - centerX, candidate.z - centerZ) <= usableRadius + 1e-9;
}

/** Advance or rewind an object's yaw by a fixed angle, wrapped to [-π, π). */
export function stepPlacementRotation(
  rotation: number,
  direction: number,
  step = Math.PI / 12,
): number {
  const current = Number.isFinite(rotation) ? rotation : 0;
  const sign = Number.isFinite(direction) ? direction : 0;
  const increment = Number.isFinite(step) && step > 0 ? step : Math.PI / 12;
  const fullTurn = Math.PI * 2;
  const wrapped = ((current + sign * increment + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  return Number.isFinite(wrapped) ? wrapped : 0;
}

/** True when two circular footprints overlap (touching edges are allowed). */
export function circlesOverlap(
  first: ObstacleCircle,
  second: ObstacleCircle,
  clearance = 0,
): boolean {
  if (![first?.x, first?.z, first?.radius, second?.x, second?.z, second?.radius].every(Number.isFinite)) return false;
  const gap = nonNegativeFinite(clearance);
  const minimumDistance = Math.max(0, first.radius) + Math.max(0, second.radius) + gap;
  return Math.hypot(first.x - second.x, first.z - second.z) < minimumDistance;
}

/** Check a candidate object's circular footprint against placed objects or terrain circles. */
export function isPlacementClear(
  point: PlacementPoint,
  footprintRadius: number,
  obstacles: readonly ObstacleCircle[],
  clearance = 0,
): boolean {
  const candidate = finitePoint(point);
  if (!candidate || !Array.isArray(obstacles)) return false;
  const placedFootprint: ObstacleCircle = {
    ...candidate,
    radius: nonNegativeFinite(footprintRadius),
  };
  return !obstacles.some(obstacle => circlesOverlap(placedFootprint, obstacle, clearance));
}

/**
 * Adjusts soaring altitude dynamically with safe min/max boundary clamping.
 */
export function adjustFlightAltitude(
  current: number,
  delta: number,
  minAlt: number = MIN_FLIGHT_ALTITUDE,
  maxAlt: number = MAX_FLIGHT_ALTITUDE
): number {
  const cur = Number.isFinite(current) ? current : CRUISE_ALTITUDE;
  const d = Number.isFinite(delta) ? delta : 0;
  return Math.max(minAlt, Math.min(maxAlt, cur + d));
}

/**
 * Resolves 2D circular obstacle collisions with soft pushout and sliding kinematics.
 */
export function resolveObstacleCollision(
  pos: { x: number; z: number },
  characterRadius: number,
  obstacles: readonly ObstacleCircle[]
): { x: number; z: number; collided: boolean } {
  let cx = Number.isFinite(pos?.x) ? pos.x : 0;
  let cz = Number.isFinite(pos?.z) ? pos.z : 0;
  const cr = Number.isFinite(characterRadius) ? Math.max(0.01, characterRadius) : 0.35;
  let hasCollided = false;

  if (!Array.isArray(obstacles) || obstacles.length === 0) {
    return { x: cx, z: cz, collided: false };
  }

  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const ox = Number.isFinite(obs?.x) ? obs.x : 0;
      const oz = Number.isFinite(obs?.z) ? obs.z : 0;
      const or = Number.isFinite(obs?.radius) ? obs.radius : 0.5;

      const dx = cx - ox;
      const dz = cz - oz;
      const minDistance = or + cr;
      const distSq = dx * dx + dz * dz;

      if (distSq < minDistance * minDistance) {
        hasCollided = true;
        const dist = Math.sqrt(distSq);
        if (dist > 1e-4) {
          const push = (minDistance - dist) / dist;
          cx += dx * push;
          cz += dz * push;
        } else {
          cx += minDistance;
        }
      }
    }
  }

  return { x: cx, z: cz, collided: hasCollided };
}

export function createTraversalState(): TraversalState {
  return {
    mode: 'ground',
    altitude: 0,
    targetAltitude: 0,
    flightState: 'grounded',
    isFlying: false,
    isHandHolding: false,
    handSideSign: 1,
    idleTimer: 0,
  };
}

/**
 * Calculates perpendicular lateral offset for side-by-side positioning.
 * Rotates heading vector 90 degrees in X-Z plane.
 * Guaranteed resilience to zero-magnitude or NaN vectors.
 */
export function calculateSideBySideOffset(
  heading: { x: number; z: number },
  deltaDist: number = HAND_HOLD_SPACING
): { x: number; z: number } {
  const hx = Number.isFinite(heading?.x) ? heading.x : 0;
  const hz = Number.isFinite(heading?.z) ? heading.z : 0;
  const dist = Number.isFinite(deltaDist) ? deltaDist : HAND_HOLD_SPACING;
  const len = Math.hypot(hx, hz);
  if (len < 1e-5) {
    return { x: dist, z: 0 };
  }
  // Perpendicular vector: (hz / len, -hx / len) * dist
  return {
    x: (hz / len) * dist,
    z: (-hx / len) * dist,
  };
}

/**
 * Smooth exponential ease towards target flight altitude.
 * Distinguishes climb and descent speeds.
 * Clamps result to >= 0 (no ground clipping).
 */
export function calculateFlightAltitude(
  currentAlt: number,
  targetAlt: number,
  dt: number,
  climbSpeed: number = 3.5,
  descentSpeed: number = 3.5
): number {
  const cAlt = Number.isFinite(currentAlt) ? Math.max(0, currentAlt) : 0;
  const tAlt = Number.isFinite(targetAlt) ? Math.max(0, targetAlt) : 0;
  if (Math.abs(cAlt - tAlt) < 0.001) return tAlt;

  const clampedDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.5)) : 0;
  const speed = tAlt > cAlt
    ? (Number.isFinite(climbSpeed) && climbSpeed > 0 ? climbSpeed : 3.5)
    : (Number.isFinite(descentSpeed) && descentSpeed > 0 ? descentSpeed : 3.5);

  const factor = 1 - Math.exp(-clampedDt * speed);
  const nextAlt = cAlt + (tAlt - cAlt) * factor;
  return Math.max(0, nextAlt);
}

/**
 * Dynamic camera Y-focus tracking to keep soaring characters nicely framed.
 */
export function calculateCameraFocusY(
  characterAlt: number,
  trackingFactor: number = 0.82
): number {
  const alt = Number.isFinite(characterAlt) ? Math.max(0, characterAlt) : 0;
  const factor = Number.isFinite(trackingFactor) ? Math.max(0, trackingFactor) : 0.82;
  return alt * factor;
}

/**
 * Aerodynamic banking tilt roll angle calculation during turns.
 * Tilts 2D sprite view rotation smoothly into turns, damping back to zero on straight flight.
 */
export function calculateBankingRoll(
  currentRoll: number,
  angularVelocity: number,
  dt: number,
  maxRoll: number = 0.20
): number {
  const cRoll = Number.isFinite(currentRoll) ? currentRoll : 0;
  const omega = Number.isFinite(angularVelocity) ? angularVelocity : 0;
  const limit = Number.isFinite(maxRoll) && maxRoll > 0 ? maxRoll : 0.20;
  const clampedDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.5)) : 0;

  // Negative banking tilt into the turn
  const rawTarget = -0.09 * omega;
  const targetRoll = Math.max(-limit, Math.min(limit, rawTarget));

  const damping = 1 - Math.exp(-clampedDt * 8.0);
  return cRoll + (targetRoll - cRoll) * damping;
}

/**
 * Idle awareness timer check for player lingering / inactivity (4-5s).
 */
export function isCompanionIdle(
  lastMoveTime: number,
  now: number,
  thresholdMs: number = IDLE_AWARENESS_THRESHOLD_MS
): boolean {
  if (!Number.isFinite(lastMoveTime) || !Number.isFinite(now)) return false;
  const threshold = Number.isFinite(thresholdMs) ? thresholdMs : IDLE_AWARENESS_THRESHOLD_MS;
  const elapsed = now - lastMoveTime;
  return elapsed >= threshold && elapsed >= 0;
}

/**
 * Computes 3D coordinates of hands for visual connector beam and motes.
 */
export function computeHandPositions(
  angelPos: { x: number; y: number; z: number },
  gorPos: { x: number; y: number; z: number }
): {
  angelHand: { x: number; y: number; z: number };
  gorHand: { x: number; y: number; z: number };
} {
  const ax = Number.isFinite(angelPos?.x) ? angelPos.x : 0;
  const ay = Number.isFinite(angelPos?.y) ? angelPos.y : 0;
  const az = Number.isFinite(angelPos?.z) ? angelPos.z : 0;

  const gx = Number.isFinite(gorPos?.x) ? gorPos.x : 0;
  const gy = Number.isFinite(gorPos?.y) ? gorPos.y : 0;
  const gz = Number.isFinite(gorPos?.z) ? gorPos.z : 0;

  const handHeight = 1.15;
  const reachDist = 0.28;

  const dx = gx - ax;
  const dz = gz - az;
  const horizDist = Math.hypot(dx, dz);

  if (horizDist > 1e-4) {
    const ux = dx / horizDist;
    const uz = dz / horizDist;
    return {
      angelHand: {
        x: ax + ux * reachDist,
        y: ay + handHeight,
        z: az + uz * reachDist,
      },
      gorHand: {
        x: gx - ux * reachDist,
        y: gy + handHeight,
        z: gz - uz * reachDist,
      },
    };
  }

  // Fallback if co-located
  return {
    angelHand: { x: ax + reachDist, y: ay + handHeight, z: az },
    gorHand: { x: gx - reachDist, y: gy + handHeight, z: gz },
  };
}

/**
 * Toggles hand-holding state if companion is within proximity range.
 */
export function toggleHandHolding(
  state: TraversalState,
  distance: number,
  maxProximity: number = HAND_HOLD_MAX_PROXIMITY
): TraversalState {
  if (state.isFlying) return state; // Hand-holding on ground only or already airborne
  if (state.isHandHolding) {
    return {
      ...state,
      isHandHolding: false,
      mode: 'ground',
    };
  }
  if (distance <= maxProximity) {
    return {
      ...state,
      isHandHolding: true,
      mode: 'hand_holding',
    };
  }
  return state;
}

/**
 * Toggles flight soaring mode between grounded and ascending/descending.
 */
export function toggleFlight(
  state: TraversalState,
  cruiseAlt: number = CRUISE_ALTITUDE
): TraversalState {
  if (state.isFlying) {
    return {
      ...state,
      flightState: 'descending',
      targetAltitude: 0,
    };
  }
  return {
    ...state,
    isFlying: true,
    flightState: 'ascending',
    targetAltitude: cruiseAlt,
    mode: 'soaring',
  };
}

/**
 * Evaluates whether couple distance has exceeded handholding detachment threshold.
 */
export function isHandHoldDetached(
  distance: number,
  breakDist: number = HAND_HOLD_BREAK_DISTANCE
): boolean {
  return distance > breakDist;
}

/**
 * Smoothstep takeoff curve for cinematic ascent.
 */
export function flightAltitudeCurve(
  t: number,
  maxAlt: number = CRUISE_ALTITUDE,
  duration: number = 1.6
): number {
  if (t <= 0) return 0;
  if (t >= duration) return maxAlt;
  const u = t / duration;
  const smooth = u * u * (3 - 2 * u);
  return maxAlt * smooth;
}

/**
 * Subtle floating buoyancy oscillation during flight cruise.
 */
export function flightGlideBob(
  time: number,
  amplitude: number = 0.12,
  freq: number = 1.8
): number {
  return Math.sin(time * freq) * amplitude;
}

/**
 * Idle timer accumulation and movement reset.
 */
export function updateIdleTimer(
  currentIdle: number,
  dt: number,
  isMoving: boolean
): number {
  if (isMoving) return 0;
  const clampedDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return currentIdle + clampedDt;
}

/**
 * Checks if idle linger threshold has been reached.
 */
export function shouldTriggerIdleLinger(
  idleTimeSeconds: number,
  thresholdSeconds: number = 4.5
): boolean {
  return idleTimeSeconds >= thresholdSeconds;
}

/**
 * Maps keyboard inputs to interaction intents with modal suppression.
 */
export function mapKeyToInteraction(
  key: string,
  isNear: boolean,
  modalOpen: boolean
): {
  flight: boolean;
  handhold: boolean;
  interact: boolean;
  close: boolean;
} {
  if (modalOpen) {
    return { flight: false, handhold: false, interact: false, close: key === 'Escape' };
  }
  const k = key.toLowerCase();
  return {
    flight: k === 'f',
    handhold: k === 'h',
    interact: k === 'e' && isNear,
    close: k === 'escape',
  };
}

/**
 * Calculates continuous wing flutter and spread metrics for Angel.
 */
export function calculateWingFlapAngle(
  isFlying: boolean,
  isMoving: boolean,
  time: number,
  reducedMotion: boolean = false
): { flapAngle: number; spreadScale: number } {
  if (reducedMotion) {
    return { flapAngle: 0, spreadScale: isFlying ? 1.25 : 1.0 };
  }
  const t = Number.isFinite(time) ? time : 0;
  if (isFlying) {
    const flapAngle = Math.sin(t * 5.2) * 0.42;
    const spreadScale = 1.35 + Math.sin(t * 2.0) * 0.08;
    return { flapAngle, spreadScale };
  }
  if (isMoving) {
    const flapAngle = Math.sin(t * 3.6) * 0.22;
    const spreadScale = 1.12;
    return { flapAngle, spreadScale };
  }
  // Idle breathing flutter
  const flapAngle = Math.sin(t * 1.8) * 0.09;
  return { flapAngle, spreadScale: 1.0 };
}

/**
 * Calculates tender 3-phase embrace kinematics: approach, hold & tilt, and gentle release.
 */
export function calculateEmbraceTransform(progress: number): {
  approachFactor: number;
  tiltAngle: number;
  warmthGlow: number;
} {
  const u = Math.min(Math.max(0, Number.isFinite(progress) ? progress : 0), 1);
  if (u < 0.25) {
    const t = u / 0.25;
    const ease = t * t * (3 - 2 * t);
    return {
      approachFactor: ease,
      tiltAngle: ease * 0.08,
      warmthGlow: ease * 0.6,
    };
  } else if (u < 0.75) {
    const breath = Math.sin((u - 0.25) * Math.PI * 4) * 0.015;
    return {
      approachFactor: 1.0,
      tiltAngle: 0.08 + breath,
      warmthGlow: 0.95,
    };
  } else {
    const t = (u - 0.75) / 0.25;
    const ease = 1 - t * t * (3 - 2 * t);
    return {
      approachFactor: ease,
      tiltAngle: ease * 0.08,
      warmthGlow: ease * 0.4,
    };
  }
}
