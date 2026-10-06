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

export const CRUISE_ALTITUDE = 4.0;
export const HAND_HOLD_SPACING = 0.90;
export const HAND_HOLD_MAX_PROXIMITY = 3.5;
export const HAND_HOLD_BREAK_DISTANCE = 4.2;
export const IDLE_AWARENESS_THRESHOLD_MS = 4500;

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

