import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  calculateSideBySideOffset,
  calculateFlightAltitude,
  calculateCameraFocusY,
  calculateBankingRoll,
  isCompanionIdle,
  computeHandPositions,
  toggleHandHolding,
  toggleFlight,
  isHandHoldDetached,
  flightAltitudeCurve,
  flightGlideBob,
  updateIdleTimer,
  shouldTriggerIdleLinger,
  mapKeyToInteraction,
  createTraversalState,
  type TraversalState,
  type FlightState,
  HAND_HOLD_SPACING,
  HAND_HOLD_MAX_PROXIMITY,
  HAND_HOLD_BREAK_DISTANCE,
  IDLE_AWARENESS_THRESHOLD_MS,
  CRUISE_ALTITUDE,
} from '../src/interactions.ts';

// ============================================================================
// Suite 1: Rapid-Fire Toggling & State Synchronization Stress (1,000+ iterations)
// ============================================================================

test('Challenge 1.1: 2,000 rapid hand-holding toggles within proximity maintain synchronized state', () => {
  let state = createTraversalState();
  const proximity = 1.5; // Within 3.5m

  for (let i = 0; i < 2000; i++) {
    const shouldBeHolding = i % 2 === 0;
    state = toggleHandHolding(state, proximity);

    if (shouldBeHolding) {
      assert.equal(state.isHandHolding, true, `Iter ${i}: expected isHandHolding true`);
      assert.equal(state.mode, 'hand_holding', `Iter ${i}: expected mode hand_holding`);
    } else {
      assert.equal(state.isHandHolding, false, `Iter ${i}: expected isHandHolding false`);
      assert.equal(state.mode, 'ground', `Iter ${i}: expected mode ground`);
    }
    assert.equal(state.isFlying, false);
    assert.equal(state.flightState, 'grounded');
  }
});

test('Challenge 1.2: 2,000 rapid flight takeoffs and landings with altitude simulation maintain flight state integrity', () => {
  let state = createTraversalState();

  for (let cycle = 0; cycle < 1000; cycle++) {
    // 1. Takeoff command
    state = toggleFlight(state, CRUISE_ALTITUDE);
    assert.equal(state.isFlying, true);
    assert.equal(state.flightState, 'ascending');
    assert.equal(state.targetAltitude, CRUISE_ALTITUDE);
    assert.equal(state.mode, 'soaring');

    // Simulate ascent over several steps
    for (let step = 0; step < 5; step++) {
      state.altitude = calculateFlightAltitude(state.altitude, state.targetAltitude, 0.1);
    }
    // Snap to cruise
    state.altitude = state.targetAltitude;
    state.flightState = 'cruising';

    // 2. Landing command
    state = toggleFlight(state);
    assert.equal(state.flightState, 'descending');
    assert.equal(state.targetAltitude, 0);

    // Simulate descent over several steps
    for (let step = 0; step < 5; step++) {
      state.altitude = calculateFlightAltitude(state.altitude, state.targetAltitude, 0.1);
    }
    // Snap to ground
    state.altitude = 0;
    state.flightState = 'grounded';
    state.isFlying = false;
    state.mode = 'ground';
  }

  assert.equal(state.altitude, 0);
  assert.equal(state.isFlying, false);
  assert.equal(state.flightState, 'grounded');
});

test('Challenge 1.3: 5,000 randomized interleaved transitions maintain strict invariants', () => {
  let state = createTraversalState();
  const validModes = new Set(['ground', 'hand_holding', 'soaring']);
  const validFlightStates = new Set(['grounded', 'ascending', 'cruising', 'descending']);

  for (let i = 0; i < 5000; i++) {
    const action = Math.floor(Math.random() * 4);
    const dist = (Math.random() * 8) - 1; // [-1.0, 7.0]

    switch (action) {
      case 0: // Toggle handholding
        state = toggleHandHolding(state, dist);
        break;
      case 1: // Toggle flight
        state = toggleFlight(state, CRUISE_ALTITUDE);
        break;
      case 2: // Simulate altitude step
        {
          const dt = Math.random() * 0.1;
          state.altitude = calculateFlightAltitude(state.altitude, state.targetAltitude, dt);
          if (state.flightState === 'ascending' && Math.abs(state.altitude - CRUISE_ALTITUDE) < 0.05) {
            state.flightState = 'cruising';
          } else if (state.flightState === 'descending' && state.altitude <= 0.04) {
            state.flightState = 'grounded';
            state.isFlying = false;
            state.mode = state.isHandHolding ? 'hand_holding' : 'ground';
            state.altitude = 0;
          }
        }
        break;
      case 3: // Detachment check
        if (state.isHandHolding && isHandHoldDetached(dist, HAND_HOLD_BREAK_DISTANCE)) {
          state = {
            ...state,
            isHandHolding: false,
            mode: state.isFlying ? 'soaring' : 'ground',
          };
        }
        break;
    }

    // Invariant verifications
    assert.ok(validModes.has(state.mode), `Invalid mode ${state.mode}`);
    assert.ok(validFlightStates.has(state.flightState), `Invalid flightState ${state.flightState}`);
    assert.ok(Number.isFinite(state.altitude), `Altitude must be finite: ${state.altitude}`);
    assert.ok(state.altitude >= 0, `Altitude must be >= 0: ${state.altitude}`);
    assert.ok(Number.isFinite(state.targetAltitude), `Target altitude must be finite`);

    if (state.isFlying) {
      assert.equal(state.mode, 'soaring', 'Mode must be soaring when isFlying is true');
    }
    if (!state.isFlying && !state.isHandHolding) {
      assert.equal(state.mode, 'ground', 'Mode must be ground when not flying or handholding');
    }
  }
});

// ============================================================================
// Suite 2: Extreme Inputs & Numerical Robustness (dt, coords, non-finite)
// ============================================================================

test('Challenge 2.1: calculateFlightAltitude under extreme dt values', () => {
  const extremeDts = [-1000, -1, -1e-6, 0, 1e-12, 1e6, Infinity, -Infinity, NaN];

  for (const dt of extremeDts) {
    const ascAlt = calculateFlightAltitude(1.0, 4.0, dt);
    assert.ok(Number.isFinite(ascAlt), `ascAlt must be finite for dt=${dt}, got ${ascAlt}`);
    assert.ok(ascAlt >= 0, `ascAlt must be >= 0 for dt=${dt}`);
    assert.ok(ascAlt <= 4.0, `ascAlt must not overshoot target 4.0 for dt=${dt}, got ${ascAlt}`);

    const descAlt = calculateFlightAltitude(3.0, 0.0, dt);
    assert.ok(Number.isFinite(descAlt), `descAlt must be finite for dt=${dt}, got ${descAlt}`);
    assert.ok(descAlt >= 0, `descAlt must be >= 0 for dt=${dt}`);
    assert.ok(descAlt <= 3.0, `descAlt must not ascend during descent for dt=${dt}`);
  }
});

test('Challenge 2.2: calculateFlightAltitude under non-finite currentAlt and targetAlt', () => {
  assert.equal(calculateFlightAltitude(NaN, 4.0, 0.016), 0 + (4.0 - 0) * (1 - Math.exp(-0.016 * 3.5)));
  assert.equal(calculateFlightAltitude(2.0, NaN, 0.016), 2.0 + (0 - 2.0) * (1 - Math.exp(-0.016 * 3.5)));
  assert.ok(Number.isFinite(calculateFlightAltitude(Infinity, 4.0, 0.016)));
  assert.ok(Number.isFinite(calculateFlightAltitude(2.0, Infinity, 0.016)));
  assert.ok(Number.isFinite(calculateFlightAltitude(-Infinity, 4.0, 0.016)));
});

test('Challenge 2.3: calculateSideBySideOffset under extreme and non-finite heading vectors', () => {
  const badHeadings = [
    { x: 0, z: 0 },
    { x: 1e-12, z: 1e-12 },
    { x: 1e12, z: 1e12 },
    { x: NaN, z: 0 },
    { x: 0, z: NaN },
    { x: NaN, z: NaN },
    { x: Infinity, z: 0 },
    { x: 0, z: -Infinity },
    { x: Infinity, z: Infinity },
    null as unknown as { x: number; z: number },
    undefined as unknown as { x: number; z: number },
  ];

  for (const h of badHeadings) {
    const offset = calculateSideBySideOffset(h);
    assert.ok(Number.isFinite(offset.x), `offset.x must be finite for heading ${JSON.stringify(h)}`);
    assert.ok(Number.isFinite(offset.z), `offset.z must be finite for heading ${JSON.stringify(h)}`);
    const mag = Math.hypot(offset.x, offset.z);
    assert.ok(Math.abs(mag - HAND_HOLD_SPACING) < 1e-4, `Offset magnitude must equal HAND_HOLD_SPACING, got ${mag}`);
  }
});

test('Challenge 2.4: computeHandPositions with identical coincident character coordinates', () => {
  const testPoints = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 5, z: -10 },
    { x: -500, y: 200, z: 500 },
  ];

  for (const pt of testPoints) {
    const { angelHand, gorHand } = computeHandPositions(pt, pt);
    assert.ok(Number.isFinite(angelHand.x));
    assert.ok(Number.isFinite(angelHand.y));
    assert.ok(Number.isFinite(angelHand.z));
    assert.ok(Number.isFinite(gorHand.x));
    assert.ok(Number.isFinite(gorHand.y));
    assert.ok(Number.isFinite(gorHand.z));

    // Hands must be elevated by 1.15
    assert.ok(Math.abs(angelHand.y - (pt.y + 1.15)) < 1e-5);
    assert.ok(Math.abs(gorHand.y - (pt.y + 1.15)) < 1e-5);

    // Fallback separation must be non-zero (each offset by reachDist = 0.28)
    const dist = Math.hypot(gorHand.x - angelHand.x, gorHand.z - angelHand.z);
    assert.ok(Math.abs(dist - 0.56) < 1e-4, `Expected 2 * reachDist = 0.56, got ${dist}`);
  }
});

test('Challenge 2.5: computeHandPositions with non-finite coordinates', () => {
  const { angelHand, gorHand } = computeHandPositions(
    { x: NaN, y: Infinity, z: -Infinity },
    { x: 0, y: 0, z: 0 }
  );
  assert.ok(Number.isFinite(angelHand.x));
  assert.ok(Number.isFinite(angelHand.y));
  assert.ok(Number.isFinite(angelHand.z));
  assert.ok(Number.isFinite(gorHand.x));
  assert.ok(Number.isFinite(gorHand.y));
  assert.ok(Number.isFinite(gorHand.z));
});

test('Challenge 2.6: calculateBankingRoll with extreme angular velocities and dt', () => {
  const extremeOmegas = [-1e9, -100, 0, 100, 1e9, NaN, Infinity, -Infinity];
  const extremeDts = [-1, 0, 0.016, 100, NaN, Infinity];

  for (const omega of extremeOmegas) {
    for (const dt of extremeDts) {
      const roll = calculateBankingRoll(0, omega, dt, 0.20);
      assert.ok(Number.isFinite(roll), `Roll must be finite for omega=${omega}, dt=${dt}`);
      assert.ok(roll >= -0.20 && roll <= 0.20, `Roll must stay bounded in [-0.20, 0.20], got ${roll}`);
    }
  }
});

test('Challenge 2.7: calculateCameraFocusY negative clamping and non-finite resilience', () => {
  assert.equal(calculateCameraFocusY(-100), 0);
  assert.equal(calculateCameraFocusY(-0.0001), 0);
  assert.equal(calculateCameraFocusY(0), 0);
  assert.equal(calculateCameraFocusY(NaN), 0);
  assert.equal(calculateCameraFocusY(-Infinity), 0);
  assert.ok(Math.abs(calculateCameraFocusY(10, 0.82) - 8.2) < 1e-5);
});

// ============================================================================
// Suite 3: Companion Idle Awareness, Clock Jumps & Move-Stop Oscillation
// ============================================================================

test('Challenge 3.1: Clock jumps (backwards or massive forward) handled safely', () => {
  const t0 = 50000;

  // Backwards clock jump (system time corrected or negative delta)
  assert.equal(isCompanionIdle(t0, t0 - 1000), false);
  assert.equal(isCompanionIdle(t0, t0 - 1e8), false);

  // Massive forward jump (e.g. system sleep/wake)
  assert.equal(isCompanionIdle(t0, t0 + 1e8), true);

  // Non-finite clock values
  assert.equal(isCompanionIdle(NaN, t0), false);
  assert.equal(isCompanionIdle(t0, NaN), false);
  assert.equal(isCompanionIdle(Infinity, t0), false);
  assert.equal(isCompanionIdle(t0, -Infinity), false);
});

test('Challenge 3.2: 2,000 rapid move-stop oscillations never trigger idle linger', () => {
  let timer = 0;
  const frameDt = 0.016; // 60 FPS frame

  for (let f = 0; f < 2000; f++) {
    const isMoving = f % 2 === 0; // alternates moving and stopped every single frame
    timer = updateIdleTimer(timer, frameDt, isMoving);

    // Because player moves every other frame, timer never exceeds frameDt
    assert.ok(timer <= frameDt + 1e-6, `Timer exceeded frame dt during oscillation: ${timer}`);
    assert.equal(shouldTriggerIdleLinger(timer, 4.5), false, 'Idle linger triggered during active oscillation!');
  }
});

test('Challenge 3.3: Idle timer accumulates only during sustained stationary periods', () => {
  let timer = 0;
  const frameDt = 0.1;

  // Stationary for 4.4 seconds (44 steps)
  for (let s = 0; s < 44; s++) {
    timer = updateIdleTimer(timer, frameDt, false);
    assert.equal(shouldTriggerIdleLinger(timer, 4.5), false);
  }

  // Next step crosses 4.5s boundary
  timer = updateIdleTimer(timer, frameDt, false);
  assert.equal(shouldTriggerIdleLinger(timer, 4.5), true);

  // A single moving frame instantly resets timer
  timer = updateIdleTimer(timer, frameDt, true);
  assert.equal(timer, 0);
  assert.equal(shouldTriggerIdleLinger(timer, 4.5), false);
});

// ============================================================================
// Suite 4: Detachment Distance & Proximity Thresholds
// ============================================================================

test('Challenge 4.1: Handhold activation proximity threshold boundary (3.5m)', () => {
  const s0 = createTraversalState();

  // Exactly at boundary
  const sAtBound = toggleHandHolding(s0, 3.5);
  assert.equal(sAtBound.isHandHolding, true);

  // Just outside boundary (3.5001m)
  const sOutside = toggleHandHolding(s0, 3.5001);
  assert.equal(sOutside.isHandHolding, false);

  // Far away (10m)
  const sFar = toggleHandHolding(s0, 10.0);
  assert.equal(sFar.isHandHolding, false);

  // NaN proximity
  const sNaN = toggleHandHolding(s0, NaN);
  assert.equal(sNaN.isHandHolding, false);
});

test('Challenge 4.2: Handhold detachment threshold boundary (4.2m / 4.5m)', () => {
  // Testing default HAND_HOLD_BREAK_DISTANCE (4.2m)
  assert.equal(isHandHoldDetached(4.199), false);
  assert.equal(isHandHoldDetached(4.2), false);
  assert.equal(isHandHoldDetached(4.2001), true);
  assert.equal(isHandHoldDetached(4.5), true);
  assert.equal(isHandHoldDetached(10.0), true);

  // Testing explicit 4.5m threshold
  assert.equal(isHandHoldDetached(4.499, 4.5), false);
  assert.equal(isHandHoldDetached(4.5, 4.5), false);
  assert.equal(isHandHoldDetached(4.5001, 4.5), true);
  assert.equal(isHandHoldDetached(5.0, 4.5), true);
});

test('Challenge 4.3: Detachment dynamics in 3D distance simulation', () => {
  const angelPos = new T.Vector3(0, 0, 0);
  const gorPos = new T.Vector3(0, 0, 0);

  // Walk apart step-by-step
  let handHolding = true;
  for (let d = 0; d <= 5.0; d += 0.1) {
    gorPos.set(d, 0, 0);
    const dist = angelPos.distanceTo(gorPos);

    if (isHandHoldDetached(dist, 4.2)) {
      handHolding = false;
    }

    if (d <= 4.2) {
      assert.equal(handHolding, true, `Should stay attached at d=${d}`);
    } else {
      assert.equal(handHolding, false, `Must be detached at d=${d}`);
    }
  }
});
