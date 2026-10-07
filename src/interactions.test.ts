import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planetElevation,
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
  getIntimacyActionDescriptor,
  INTIMACY_ACTIONS,
  HAND_HOLD_SPACING,
  CRUISE_ALTITUDE,
  calculateWingFlapAngle,
  calculateEmbraceTransform,
  adjustFlightAltitude,
  resolveObstacleCollision,
  projectPointToLand,
  snapPointToGrid,
  projectAndSnapToLand,
  isFootprintInsideLand,
  stepPlacementRotation,
  circlesOverlap,
  isPlacementClear,
  MIN_FLIGHT_ALTITUDE,
  MAX_FLIGHT_ALTITUDE,
} from './interactions.ts';

// ============================================================================
// Suite 1: Side-by-Side Traversal Offset Mathematics
// ============================================================================

test('calculateSideBySideOffset produces lateral vector strictly perpendicular to heading', () => {
  const headings = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 0.7071, z: 0.7071 },
    { x: -0.6, z: 0.8 },
  ];

  for (const h of headings) {
    const offset = calculateSideBySideOffset(h, 0.90);
    // Dot product with heading must be zero (perpendicular)
    const dot = h.x * offset.x + h.z * offset.z;
    assert.ok(Math.abs(dot) < 1e-6, `Heading (${h.x}, ${h.z}) dot offset was ${dot}`);

    // Magnitude must match configured spacing (0.90)
    const mag = Math.hypot(offset.x, offset.z);
    assert.ok(Math.abs(mag - 0.90) < 1e-5, `Offset magnitude ${mag} did not match 0.90`);
  }
});

test('calculateSideBySideOffset scales with custom separation distances', () => {
  const heading = { x: 0, z: 1 };
  const offset1 = calculateSideBySideOffset(heading, 0.5);
  const offset2 = calculateSideBySideOffset(heading, 1.25);
  assert.ok(Math.abs(Math.hypot(offset1.x, offset1.z) - 0.5) < 1e-5);
  assert.ok(Math.abs(Math.hypot(offset2.x, offset2.z) - 1.25) < 1e-5);
});

test('calculateSideBySideOffset defaults to HAND_HOLD_SPACING when deltaDist omitted', () => {
  const heading = { x: 1, z: 0 };
  const offset = calculateSideBySideOffset(heading);
  assert.ok(Math.abs(Math.hypot(offset.x, offset.z) - HAND_HOLD_SPACING) < 1e-5);
});

test('calculateSideBySideOffset handles zero-vector and NaN heading gracefully without NaN', () => {
  const zeroOffset = calculateSideBySideOffset({ x: 0, z: 0 }, 0.90);
  assert.ok(Number.isFinite(zeroOffset.x));
  assert.ok(Number.isFinite(zeroOffset.z));
  assert.ok(!Number.isNaN(zeroOffset.x) && !Number.isNaN(zeroOffset.z));

  const nanOffset = calculateSideBySideOffset({ x: NaN, z: NaN }, 0.90);
  assert.ok(Number.isFinite(nanOffset.x));
  assert.ok(Number.isFinite(nanOffset.z));
});

test('planetElevation stays finite for very large finite coordinates', () => {
  assert.equal(planetElevation(1e156, 0), -Number.MAX_VALUE);
  assert.ok(Number.isFinite(planetElevation(1e155, 0)));
  assert.equal(planetElevation(Number.MAX_VALUE, Number.MAX_VALUE), -Number.MAX_VALUE);
});

// ============================================================================
// Suite 2: Flight Altitude & Easing Dynamics
// ============================================================================

test('calculateFlightAltitude ascends smoothly towards target cruise altitude without overshoot', () => {
  let alt = 0.0;
  const target = 4.0;
  const dt = 0.033; // ~30fps

  for (let i = 0; i < 60; i++) {
    const next = calculateFlightAltitude(alt, target, dt, 3.5, 3.5);
    assert.ok(next >= alt, `Altitude should monotonically increase during climb: ${next} < ${alt}`);
    assert.ok(next <= target, `Altitude should not overshoot target 4.0: ${next}`);
    alt = next;
  }
  // After ~2 seconds, should be very close to 4.0
  assert.ok(alt > 3.9, `Altitude after 2s should reach >3.9, got ${alt}`);
});

test('calculateFlightAltitude descends smoothly towards ground (0m) without overshoot', () => {
  let alt = 4.0;
  const target = 0.0;
  const dt = 0.033;

  for (let i = 0; i < 60; i++) {
    const next = calculateFlightAltitude(alt, target, dt, 3.5, 3.5);
    assert.ok(next <= alt, `Altitude should monotonically decrease during descent: ${next} > ${alt}`);
    assert.ok(next >= 0, `Altitude should not dip below ground: ${next}`);
    alt = next;
  }
  assert.ok(alt < 0.1, `Altitude after 2s descent should be <0.1, got ${alt}`);
});

test('calculateFlightAltitude respects distinct climbSpeed and descentSpeed rates', () => {
  const climbSlow = calculateFlightAltitude(0, 4.0, 0.1, 1.0, 5.0);
  const climbFast = calculateFlightAltitude(0, 4.0, 0.1, 5.0, 1.0);
  assert.ok(climbFast > climbSlow, `Fast climb should yield higher altitude than slow climb`);

  const descSlow = calculateFlightAltitude(4.0, 0, 0.1, 5.0, 1.0);
  const descFast = calculateFlightAltitude(4.0, 0, 0.1, 1.0, 5.0);
  assert.ok(descFast < descSlow, `Fast descent should drop altitude lower than slow descent`);
});

test('calculateFlightAltitude snaps exactly to target when within 0.001 delta', () => {
  const nearTarget = calculateFlightAltitude(3.9995, 4.0, 0.033);
  assert.equal(nearTarget, 4.0);
});

test('calculateFlightAltitude clamps safely with negative, zero, or huge dt and NaN values', () => {
  assert.equal(calculateFlightAltitude(2.0, 4.0, 0), 2.0);
  assert.equal(calculateFlightAltitude(2.0, 4.0, -0.5), 2.0);
  const hugeDt = calculateFlightAltitude(2.0, 4.0, 100);
  assert.ok(hugeDt <= 4.0);
  const nanHandled = calculateFlightAltitude(NaN, 4.0, 0.033);
  assert.ok(Number.isFinite(nanHandled) && nanHandled >= 0);
});

test('flightAltitudeCurve is smoothstep, monotonic, and bounded in [0, maxAlt]', () => {
  const maxAlt = CRUISE_ALTITUDE;
  const duration = 1.6;

  assert.equal(flightAltitudeCurve(0, maxAlt, duration), 0);
  assert.equal(flightAltitudeCurve(duration, maxAlt, duration), maxAlt);
  assert.equal(flightAltitudeCurve(duration + 1, maxAlt, duration), maxAlt);
  assert.equal(flightAltitudeCurve(-1, maxAlt, duration), 0);

  let prev = 0;
  for (let t = 0.1; t <= duration; t += 0.1) {
    const val = flightAltitudeCurve(t, maxAlt, duration);
    assert.ok(val >= prev, `flightAltitudeCurve not monotonic at t=${t}`);
    assert.ok(val <= maxAlt, `flightAltitudeCurve exceeded maxAlt at t=${t}`);
    prev = val;
  }
});

test('flightGlideBob oscillates with zero net drift within [-amplitude, amplitude]', () => {
  const amp = 0.15;
  for (let t = 0; t <= 10; t += 0.5) {
    const bob = flightGlideBob(t, amp, 1.8);
    assert.ok(bob >= -amp - 1e-6 && bob <= amp + 1e-6);
  }
});

// ============================================================================
// Suite 3: Dynamic Camera Focus Y Tracking
// ============================================================================

test('calculateCameraFocusY scales character altitude by tracking factor', () => {
  assert.equal(calculateCameraFocusY(0), 0);
  assert.ok(Math.abs(calculateCameraFocusY(4.0, 0.82) - 3.28) < 1e-5);
  assert.ok(Math.abs(calculateCameraFocusY(2.0, 0.5) - 1.0) < 1e-5);
});

test('calculateCameraFocusY clamps negative altitudes to zero to protect ground framing', () => {
  assert.equal(calculateCameraFocusY(-2.0), 0);
  assert.equal(calculateCameraFocusY(-0.001), 0);
});

test('calculateCameraFocusY is resilient to NaN and infinite arguments', () => {
  assert.equal(calculateCameraFocusY(NaN), 0);
  assert.ok(Number.isFinite(calculateCameraFocusY(4.0, NaN)));
});

// ============================================================================
// Suite 4: Aerodynamic Banking Roll Physics
// ============================================================================

test('calculateBankingRoll tilts roll in direction of turn and clamps to maxRoll', () => {
  const maxRoll = 0.20;
  // Turning right (positive angular velocity) produces negative banking tilt
  const rollRight = calculateBankingRoll(0, 3.0, 0.05, maxRoll);
  assert.ok(rollRight < 0, `Turning right should produce negative roll, got ${rollRight}`);
  assert.ok(rollRight >= -maxRoll, `Roll should clamp to -maxRoll`);

  // Turning left (negative angular velocity) produces positive banking tilt
  const rollLeft = calculateBankingRoll(0, -3.0, 0.05, maxRoll);
  assert.ok(rollLeft > 0, `Turning left should produce positive roll, got ${rollLeft}`);
  assert.ok(rollLeft <= maxRoll, `Roll should clamp to maxRoll`);
});

test('calculateBankingRoll decays back to zero when steering straight', () => {
  let roll = 0.18;
  const dt = 0.033;
  for (let i = 0; i < 30; i++) {
    roll = calculateBankingRoll(roll, 0, dt);
  }
  assert.ok(Math.abs(roll) < 0.01, `Roll should decay near zero on straight flight, got ${roll}`);
});

test('calculateBankingRoll handles extreme inputs and NaN gracefully', () => {
  const safeRoll = calculateBankingRoll(NaN, NaN, 0.033);
  assert.ok(Number.isFinite(safeRoll));
  const clampedRoll = calculateBankingRoll(0, 1e6, 0.033, 0.20);
  assert.ok(clampedRoll >= -0.20 && clampedRoll <= 0.20);
});

// ============================================================================
// Suite 5: Companion Idle Awareness Timer
// ============================================================================

test('isCompanionIdle returns false before 4.5s threshold and true after', () => {
  const t0 = 10000;
  assert.equal(isCompanionIdle(t0, t0 + 2000), false);
  assert.equal(isCompanionIdle(t0, t0 + 4499), false);
  assert.equal(isCompanionIdle(t0, t0 + 4500), true);
  assert.equal(isCompanionIdle(t0, t0 + 7000), true);
});

test('isCompanionIdle handles negative elapsed time and NaN safely', () => {
  const t0 = 10000;
  assert.equal(isCompanionIdle(t0, t0 - 500), false); // clock jump backwards
  assert.equal(isCompanionIdle(NaN, 5000), false);
  assert.equal(isCompanionIdle(5000, NaN), false);
});

test('updateIdleTimer accumulates time when stationary and resets to zero upon movement', () => {
  let timer = 0;
  timer = updateIdleTimer(timer, 1.0, false);
  assert.equal(timer, 1.0);
  timer = updateIdleTimer(timer, 0.5, false);
  assert.equal(timer, 1.5);
  // Player moves!
  timer = updateIdleTimer(timer, 0.1, true);
  assert.equal(timer, 0);
});

test('shouldTriggerIdleLinger triggers only at or above threshold', () => {
  assert.equal(shouldTriggerIdleLinger(0), false);
  assert.equal(shouldTriggerIdleLinger(4.49), false);
  assert.equal(shouldTriggerIdleLinger(4.5), true);
  assert.equal(shouldTriggerIdleLinger(5.0), true);
});

// ============================================================================
// Suite 6: Hand Positions & Visual Connector Anchors
// ============================================================================

test('computeHandPositions computes 3D wrist positions elevated by hand height and reaching outward', () => {
  const angelPos = { x: 0, y: 0, z: 0 };
  const gorPos = { x: 1.0, y: 0, z: 0 };

  const { angelHand, gorHand } = computeHandPositions(angelPos, gorPos);

  // Both hands should be at y = 1.15
  assert.ok(Math.abs(angelHand.y - 1.15) < 1e-5);
  assert.ok(Math.abs(gorHand.y - 1.15) < 1e-5);

  // Angel hand reaches towards Gorastakh (+X)
  assert.ok(angelHand.x > angelPos.x);
  assert.ok(Math.abs(angelHand.x - 0.28) < 1e-5);

  // Gorastakh hand reaches towards Angel (-X)
  assert.ok(gorHand.x < gorPos.x);
  assert.ok(Math.abs(gorHand.x - (1.0 - 0.28)) < 1e-5);

  // Distance between hands is less than distance between character roots
  const handDist = Math.hypot(gorHand.x - angelHand.x, gorHand.z - angelHand.z);
  assert.ok(handDist < 1.0);
});

test('computeHandPositions handles co-located characters without NaN', () => {
  const pos = { x: 2, y: 1, z: 3 };
  const { angelHand, gorHand } = computeHandPositions(pos, pos);
  assert.ok(Number.isFinite(angelHand.x) && Number.isFinite(angelHand.y) && Number.isFinite(angelHand.z));
  assert.ok(Number.isFinite(gorHand.x) && Number.isFinite(gorHand.y) && Number.isFinite(gorHand.z));
});

test('computeHandPositions keeps its direction finite when coordinate subtraction overflows', () => {
  const { angelHand, gorHand } = computeHandPositions(
    { x: -Number.MAX_VALUE, y: 0, z: 0 },
    { x: Number.MAX_VALUE, y: 0, z: 0 },
  );
  for (const value of [angelHand.x, angelHand.y, angelHand.z, gorHand.x, gorHand.y, gorHand.z]) {
    assert.ok(Number.isFinite(value));
  }
});

test('isHandHoldDetached detects separation distance exceeding break threshold', () => {
  assert.equal(isHandHoldDetached(1.0), false);
  assert.equal(isHandHoldDetached(4.1), false);
  assert.equal(isHandHoldDetached(4.25), true);
  assert.equal(isHandHoldDetached(6.0), true);
});

// ============================================================================
// Suite 7: Traversal State Transitions & Action Dispatch
// ============================================================================

test('createTraversalState initializes with correct ground defaults', () => {
  const s = createTraversalState();
  assert.equal(s.mode, 'ground');
  assert.equal(s.altitude, 0);
  assert.equal(s.isFlying, false);
  assert.equal(s.isHandHolding, false);
  assert.equal(s.flightState, 'grounded');
});

test('toggleHandHolding succeeds when within proximity and toggles off cleanly', () => {
  const s0 = createTraversalState();
  // Too far (> 3.5m)
  const sFar = toggleHandHolding(s0, 4.0);
  assert.equal(sFar.isHandHolding, false);

  // In proximity (1.2m)
  const sNear = toggleHandHolding(s0, 1.2);
  assert.equal(sNear.isHandHolding, true);
  assert.equal(sNear.mode, 'hand_holding');

  // Toggle off
  const sOff = toggleHandHolding(sNear, 1.2);
  assert.equal(sOff.isHandHolding, false);
  assert.equal(sOff.mode, 'ground');
});

test('toggleHandHolding is blocked while airborne in flight mode', () => {
  const sFly = { ...createTraversalState(), isFlying: true, mode: 'soaring' as const };
  const sAttempt = toggleHandHolding(sFly, 1.0);
  assert.equal(sAttempt.isHandHolding, false);
});

test('toggleHandHolding rejects invalid distances and flight releases a held hand', () => {
  const ground = createTraversalState();
  assert.equal(toggleHandHolding(ground, -1), ground);
  assert.equal(toggleHandHolding(ground, NaN), ground);

  const holding = toggleHandHolding(ground, 1.0);
  const takeoff = toggleFlight(holding);
  assert.equal(takeoff.isHandHolding, false);
  assert.equal(takeoff.mode, 'soaring');
});

test('toggleFlight transitions between takeoff and landing states', () => {
  const s0 = createTraversalState();
  const sTakeoff = toggleFlight(s0, 4.0);
  assert.equal(sTakeoff.isFlying, true);
  assert.equal(sTakeoff.flightState, 'ascending');
  assert.equal(sTakeoff.targetAltitude, 4.0);
  assert.equal(sTakeoff.mode, 'soaring');

  const sLanding = toggleFlight(sTakeoff);
  assert.equal(sLanding.flightState, 'descending');
  assert.equal(sLanding.targetAltitude, 0);
});

test('toggleFlight keeps requested altitude finite and within flight limits', () => {
  const ground = createTraversalState();
  assert.equal(toggleFlight(ground, NaN).targetAltitude, CRUISE_ALTITUDE);
  assert.equal(toggleFlight(ground, -10).targetAltitude, MIN_FLIGHT_ALTITUDE);
  assert.equal(toggleFlight(ground, 100).targetAltitude, MAX_FLIGHT_ALTITUDE);
});

test('INTIMACY_ACTIONS defines all 6 Persian couple interaction descriptors with proper metadata', () => {
  const expectedKinds = ['handhold', 'fly', 'hug', 'wave', 'sit', 'walk'] as const;
  for (const kind of expectedKinds) {
    const desc = getIntimacyActionDescriptor(kind);
    assert.ok(desc, `Descriptor missing for ${kind}`);
    assert.equal(desc.kind, kind);
    assert.ok(desc.label.length > 0);
    assert.ok(desc.ariaLabel.length > 0);
    assert.ok(desc.statusMessage.length > 0);
  }
  assert.equal(INTIMACY_ACTIONS.handhold.label, 'دست هم را بگیریم');
  assert.equal(INTIMACY_ACTIONS.fly.label, 'پرواز دونفره');
  assert.equal(INTIMACY_ACTIONS.hug.label, 'در آغوش کشیدن');
});

test('mapKeyToInteraction maps keys correctly and suppresses actions during open modal', () => {
  const closedNear = mapKeyToInteraction('f', true, false);
  assert.equal(closedNear.flight, true);
  assert.equal(closedNear.handhold, false);

  const upperF = mapKeyToInteraction('F', true, false);
  assert.equal(upperF.flight, true);

  const handH = mapKeyToInteraction('h', true, false);
  assert.equal(handH.handhold, true);

  const interactE = mapKeyToInteraction('e', true, false);
  assert.equal(interactE.interact, true);

  const interactEFar = mapKeyToInteraction('e', false, false);
  assert.equal(interactEFar.interact, false);

  // Modal open: all gameplay actions must be suppressed
  const modalOpen = mapKeyToInteraction('f', true, true);
  assert.equal(modalOpen.flight, false);
  assert.equal(modalOpen.handhold, false);
  assert.equal(modalOpen.interact, false);
  assert.equal(modalOpen.close, false);

  const modalEscape = mapKeyToInteraction('Escape', true, true);
  assert.equal(modalEscape.close, true);
});

test('calculateWingFlapAngle scales with flight, motion, and reducedMotion', () => {
  const idle = calculateWingFlapAngle(false, false, 1.0, false);
  assert.ok(Math.abs(idle.flapAngle) <= 0.09);
  assert.equal(idle.spreadScale, 1.0);

  const moving = calculateWingFlapAngle(false, true, 1.0, false);
  assert.ok(Math.abs(moving.flapAngle) <= 0.22);
  assert.equal(moving.spreadScale, 1.12);

  const flying = calculateWingFlapAngle(true, true, 1.0, false);
  assert.ok(Math.abs(flying.flapAngle) <= 0.42);
  assert.ok(flying.spreadScale > 1.25);

  const reduced = calculateWingFlapAngle(true, true, 1.0, true);
  assert.equal(reduced.flapAngle, 0);
  assert.equal(reduced.spreadScale, 1.25);
});

test('calculateEmbraceTransform produces 3-phase smooth embrace trajectory', () => {
  // Start
  const start = calculateEmbraceTransform(0);
  assert.equal(start.approachFactor, 0);
  assert.equal(start.tiltAngle, 0);

  // Peak hold
  const hold = calculateEmbraceTransform(0.5);
  assert.equal(hold.approachFactor, 1.0);
  assert.ok(hold.tiltAngle >= 0.065 && hold.tiltAngle <= 0.095);
  assert.equal(hold.warmthGlow, 0.95);

  // End
  const end = calculateEmbraceTransform(1.0);
  assert.equal(end.approachFactor, 0);
  assert.equal(end.tiltAngle, 0);
});

test('adjustFlightAltitude scales altitude smoothly and clamps within min and max bounds', () => {
  // Ascend
  const ascended = adjustFlightAltitude(4.0, 2.5);
  assert.equal(ascended, 6.5);

  // Clamp at max
  const maxClamped = adjustFlightAltitude(11.0, 3.0);
  assert.equal(maxClamped, MAX_FLIGHT_ALTITUDE);

  // Descend
  const descended = adjustFlightAltitude(4.0, -1.5);
  assert.equal(descended, 2.5);

  // Clamp at min
  const minClamped = adjustFlightAltitude(1.5, -2.0);
  assert.equal(minClamped, MIN_FLIGHT_ALTITUDE);

  // NaN resilience
  const nanSafe = adjustFlightAltitude(NaN, NaN);
  assert.equal(nanSafe, CRUISE_ALTITUDE);
});

test('resolveObstacleCollision pushes character out of obstacle radius smoothly', () => {
  const obstacles = [
    { x: 0, z: 0, radius: 2.0 },
    { x: 10, z: 10, radius: 1.5 },
  ];

  // Character inside obstacle at (1.0, 0) with charRadius 0.4
  // minDistance = 2.0 + 0.4 = 2.4
  const res = resolveObstacleCollision({ x: 1.0, z: 0 }, 0.4, obstacles);
  assert.equal(res.collided, true);
  assert.ok(Math.abs(res.x - 2.4) < 1e-4);
  assert.equal(res.z, 0);

  // Character outside obstacle at (3.0, 0)
  const outside = resolveObstacleCollision({ x: 3.0, z: 0 }, 0.4, obstacles);
  assert.equal(outside.collided, false);
  assert.equal(outside.x, 3.0);
  assert.equal(outside.z, 0);

  // Empty or invalid obstacles array
  const emptyRes = resolveObstacleCollision({ x: 1.0, z: 2.0 }, 0.4, []);
  assert.equal(emptyRes.collided, false);
  assert.equal(emptyRes.x, 1.0);
  assert.equal(emptyRes.z, 2.0);

  const negativeRadius = resolveObstacleCollision({ x: 0, z: 0 }, 0.4, [{ x: 0, z: 0, radius: -2 }]);
  assert.equal(negativeRadius.collided, true);
  assert.ok(Math.abs(negativeRadius.x - 0.4) < 1e-4);
});

test('placement projection preserves free points and clamps object footprints to a circular edge', () => {
  const land = { x: 4, z: -3, radius: 10 };
  assert.deepEqual(projectPointToLand({ x: 7, z: 1 }, land, 1), { x: 7, z: 1 });

  const edge = projectPointToLand({ x: 30, z: -3 }, land, 2);
  assert.ok(Math.abs(edge.x - 12) < 1e-10);
  assert.equal(edge.z, -3);
  assert.ok(isFootprintInsideLand(edge, 2, land));
  assert.equal(isFootprintInsideLand({ x: 13, z: -3 }, 2, land), false);
  assert.equal(isFootprintInsideLand({ x: 4, z: -3 }, Number.POSITIVE_INFINITY, land), false);
  assert.deepEqual(projectPointToLand({ x: NaN, z: Infinity }, land, 1), { x: 4, z: -3 });
  assert.deepEqual(projectPointToLand({ x: 50, z: 50 }, land, 99), { x: 4, z: -3 });
});

test('placement snapping is optional and re-clamps snapped objects at the land boundary', () => {
  assert.deepEqual(snapPointToGrid({ x: 1.24, z: -2.26 }), { x: 1, z: -2.5 });
  assert.deepEqual(snapPointToGrid({ x: 1.24, z: -2.26 }, 0), { x: 1.24, z: -2.26 });
  const land = { x: 0, z: 0, radius: 5 };
  const placed = projectAndSnapToLand({ x: 20, z: 0 }, land, 0.8, 1);
  assert.ok(isFootprintInsideLand(placed, 0.8, land));
  assert.ok(Number.isFinite(placed.x) && Number.isFinite(placed.z));
  const tinyGrid = snapPointToGrid({ x: 1, z: 2 }, Number.MIN_VALUE);
  assert.ok(Number.isFinite(tinyGrid.x) && Number.isFinite(tinyGrid.z));
});

test('placement rotation advances in stable wrapped steps and tolerates invalid inputs', () => {
  const step = Math.PI / 4;
  assert.ok(Math.abs(stepPlacementRotation(0, 1, step) - step) < 1e-12);
  assert.ok(Math.abs(stepPlacementRotation(0, -1, step) + step) < 1e-12);
  assert.ok(Math.abs(stepPlacementRotation(Math.PI - step / 2, 1, step) + Math.PI - step / 2) < 1e-12);
  assert.ok(Math.abs(stepPlacementRotation(NaN, 1) - Math.PI / 12) < 1e-12);
  assert.equal(stepPlacementRotation(1, Infinity), 1);
});

test('placement collision checks use circular footprints with optional clearance', () => {
  const object = { x: 0, z: 0, radius: 1 };
  const tree = { x: 2.1, z: 0, radius: 1 };
  const pond = { x: -4, z: 0, radius: 2 };
  assert.equal(circlesOverlap(object, tree), false);
  assert.equal(circlesOverlap(object, tree, 0.2), true);
  assert.equal(circlesOverlap(object, pond), false);
  assert.equal(isPlacementClear({ x: 0, z: 0 }, 1, [tree, pond]), true);
  assert.equal(isPlacementClear({ x: 0, z: 0 }, 1, [tree], 0.2), false);
  assert.equal(isPlacementClear({ x: 0, z: 0 }, 1, [{ x: NaN, z: 0, radius: 2 }]), true);
  assert.equal(isPlacementClear({ x: 0, z: 0 }, Number.NaN, []), false);
  assert.equal(isPlacementClear({ x: 0, z: 0 }, Number.POSITIVE_INFINITY, []), false);
  assert.equal(isPlacementClear({ x: Infinity, z: 0 }, 1, []), false);
});
