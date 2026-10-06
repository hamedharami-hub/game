import { strict as assert } from 'node:assert';
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
  CRUISE_ALTITUDE,
  HAND_HOLD_SPACING,
  HAND_HOLD_MAX_PROXIMITY,
  HAND_HOLD_BREAK_DISTANCE,
} from '../src/interactions.ts';

console.log('=== DREAM CARAVAN: EMPIRICAL MATHEMATICAL INVARIANTS HARNESS ===\n');

let passCount = 0;
let failCount = 0;

function runSuite(name, fn) {
  try {
    console.log(`[SUITE] ${name}`);
    fn();
    console.log(`  -> PASS: ${name}\n`);
    passCount++;
  } catch (err) {
    console.error(`  -> FAIL: ${name}`);
    console.error(err);
    failCount++;
  }
}

// =========================================================================
// 1. PERPENDICULAR LATERAL OFFSET INVARIANTS
// =========================================================================
runSuite('1. Perpendicular Lateral Offset: Dot Product & Norm Invariants', () => {
  const EPSILON_DOT = 1e-12;
  const EPSILON_MAG = 1e-12;

  // 1.1 Sweep across 36,000 distinct angles from 0 to 2*PI
  const steps = 36000;
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const hx = Math.cos(theta);
    const hz = Math.sin(theta);
    const heading = { x: hx, z: hz };

    const offset = calculateSideBySideOffset(heading, 0.90);

    // Invariant 1: dot product heading · offset === 0
    const dot = hx * offset.x + hz * offset.z;
    assert.ok(
      Math.abs(dot) < EPSILON_DOT,
      `Dot product failure at angle ${theta}: ${dot} >= ${EPSILON_DOT}`
    );

    // Invariant 2: ||offset|| === 0.90
    const norm = Math.hypot(offset.x, offset.z);
    assert.ok(
      Math.abs(norm - 0.90) < EPSILON_MAG,
      `Norm failure at angle ${theta}: ${norm} !== 0.90`
    );

    // Invariant 3: 2D cross product check (handedness)
    const cross = hx * offset.z - hz * offset.x;
    assert.ok(
      Math.abs(cross - (-0.90)) < EPSILON_MAG,
      `Handedness failure at angle ${theta}: cross is ${cross}, expected -0.90`
    );
  }

  // 1.2 Scaling across arbitrary positive separation distances [1e-4, 1e4]
  const testDistances = [1e-4, 0.01, 0.5, 0.90, 1.0, 2.5, 10.0, 1000.0, 1e4];
  for (const dist of testDistances) {
    const heading = { x: 3.0, z: -4.0 }; // norm = 5.0
    const offset = calculateSideBySideOffset(heading, dist);

    const dot = (heading.x * offset.x + heading.z * offset.z);
    assert.ok(Math.abs(dot) < 1e-10, `Scaling dot product non-zero for dist=${dist}: ${dot}`);

    const norm = Math.hypot(offset.x, offset.z);
    assert.ok(Math.abs(norm - dist) < 1e-10, `Scaling norm mismatch for dist=${dist}: ${norm} !== ${dist}`);
  }

  // 1.3 Boundary & Degenerate values
  const zeroVector = calculateSideBySideOffset({ x: 0, z: 0 }, 0.90);
  assert.strictEqual(zeroVector.x, 0.90, 'Zero vector must return x = dist');
  assert.strictEqual(zeroVector.z, 0, 'Zero vector must return z = 0');
  assert.strictEqual(Math.hypot(zeroVector.x, zeroVector.z), 0.90, 'Zero vector norm must be 0.90');

  const nearZeroVector = calculateSideBySideOffset({ x: 1e-7, z: 1e-7 }, 0.90);
  assert.strictEqual(nearZeroVector.x, 0.90, 'Near-zero vector below 1e-5 must fallback cleanly');
  assert.strictEqual(nearZeroVector.z, 0);

  const nanVector = calculateSideBySideOffset({ x: NaN, z: NaN }, 0.90);
  assert.ok(Number.isFinite(nanVector.x) && Number.isFinite(nanVector.z), 'NaN heading handled safely');
  assert.strictEqual(nanVector.x, 0.90);
  assert.strictEqual(nanVector.z, 0);

  const infVector = calculateSideBySideOffset({ x: Infinity, z: -Infinity }, 0.90);
  assert.ok(Number.isFinite(infVector.x) && Number.isFinite(infVector.z), 'Infinity heading handled safely');

  console.log('    Verified 36,000 continuous angles, arbitrary scales, degenerate vectors.');
});

// =========================================================================
// 2. FLIGHT EXPONENTIAL EASING INVARIANTS
// =========================================================================
runSuite('2. Flight Exponential Easing: Monotonicity & Zero-Overshoot Invariants', () => {
  const dtValues = [1e-5, 0.001, 0.016, 0.033, 0.05, 0.1, 0.25, 0.5, 1.0, 5.0, 100.0];
  const speeds = [0.1, 1.0, 3.5, 5.0, 10.0, 50.0];

  // 2.1 Strictly Monotonic Ascent and Zero Overshoot Past Target
  for (const dt of dtValues) {
    for (const speed of speeds) {
      const targetAlt = 4.0;
      let alt = 0.0;
      let prevAlt = alt;

      // Run up to 2000 steps or until target snapped
      for (let step = 0; step < 2000; step++) {
        const nextAlt = calculateFlightAltitude(alt, targetAlt, dt, speed, speed);

        // Invariant 1: Strictly non-decreasing
        assert.ok(
          nextAlt >= prevAlt,
          `Ascent violated monotonicity: next=${nextAlt} < prev=${prevAlt} (dt=${dt}, speed=${speed}, step=${step})`
        );

        // Invariant 2: Zero overshoot past target altitude
        assert.ok(
          nextAlt <= targetAlt,
          `Ascent overshot target: next=${nextAlt} > target=${targetAlt} (dt=${dt}, speed=${speed}, step=${step})`
        );

        // Invariant 3: Ground safety (never negative)
        assert.ok(nextAlt >= 0, `Altitude dipped below zero: ${nextAlt}`);

        prevAlt = nextAlt;
        alt = nextAlt;
        if (alt === targetAlt) break; // Snapped or reached exactly
      }

      // If simulated with practical frame delta dt >= 0.016 and standard speed >= 1.0, must reach target
      if (dt >= 0.016 && speed >= 1.0) {
        assert.strictEqual(alt, targetAlt, `Failed to reach target (dt=${dt}, speed=${speed})`);
      }
    }
  }

  // 2.2 Strictly Monotonic Descent and Zero Overshoot Below Ground (0.0)
  for (const dt of dtValues) {
    for (const speed of speeds) {
      const targetAlt = 0.0;
      let alt = 4.0;
      let prevAlt = alt;

      for (let step = 0; step < 2000; step++) {
        const nextAlt = calculateFlightAltitude(alt, targetAlt, dt, speed, speed);

        // Invariant 1: Strictly non-increasing
        assert.ok(
          nextAlt <= prevAlt,
          `Descent violated monotonicity: next=${nextAlt} > prev=${prevAlt} (dt=${dt}, speed=${speed}, step=${step})`
        );

        // Invariant 2: Zero overshoot past target (0.0)
        assert.ok(
          nextAlt >= targetAlt,
          `Descent undershot target: next=${nextAlt} < target=${targetAlt} (dt=${dt}, speed=${speed}, step=${step})`
        );

        // Invariant 3: Ground non-negativity
        assert.ok(nextAlt >= 0, `Altitude below 0: ${nextAlt}`);

        prevAlt = nextAlt;
        alt = nextAlt;
        if (alt === targetAlt) break;
      }

      if (dt >= 0.016 && speed >= 1.0) {
        assert.strictEqual(alt, 0.0, `Failed to land on ground (dt=${dt}, speed=${speed})`);
      }
    }
  }

  // 2.3 Arbitrary In-between Targets (e.g. 0.5m, 1.73m, 5.0m, 10.0m)
  for (const intermediateTarget of [0.5, 1.73, 5.0, 10.0]) {
    let altAsc = 0;
    for (let s = 0; s < 100; s++) {
      altAsc = calculateFlightAltitude(altAsc, intermediateTarget, 0.033, 3.5, 3.5);
      assert.ok(altAsc <= intermediateTarget, `Ascent overshot intermediateTarget ${intermediateTarget}`);
    }
    assert.strictEqual(altAsc, intermediateTarget);

    let altDesc = 15.0;
    for (let s = 0; s < 100; s++) {
      altDesc = calculateFlightAltitude(altDesc, intermediateTarget, 0.033, 3.5, 3.5);
      assert.ok(altDesc >= intermediateTarget, `Descent overshot intermediateTarget ${intermediateTarget}`);
    }
    assert.strictEqual(altDesc, intermediateTarget);
  }

  // 2.4 Snapping within 0.001 boundary
  assert.strictEqual(calculateFlightAltitude(3.9992, 4.0, 0.016), 4.0);
  assert.strictEqual(calculateFlightAltitude(4.0008, 4.0, 0.016), 4.0);
  assert.strictEqual(calculateFlightAltitude(0.0005, 0.0, 0.016), 0.0);

  // 2.5 Extreme / Adversarial Inputs
  assert.strictEqual(calculateFlightAltitude(-5.0, 4.0, 0.033), calculateFlightAltitude(0.0, 4.0, 0.033));
  assert.strictEqual(calculateFlightAltitude(4.0, -10.0, 0.033), calculateFlightAltitude(4.0, 0.0, 0.033));
  assert.strictEqual(calculateFlightAltitude(NaN, 4.0, 0.033), calculateFlightAltitude(0.0, 4.0, 0.033));
  assert.strictEqual(calculateFlightAltitude(4.0, NaN, 0.033), calculateFlightAltitude(4.0, 0.0, 0.033));

  console.log('    Verified strict monotonicity & zero overshoot across 132 parameter variations.');
});

// =========================================================================
// 3. CAMERA Y-FOCUS TRACKING INVARIANTS
// =========================================================================
runSuite('3. Camera Y-Focus Tracking: Clamp & Proportionality Invariants', () => {
  // 3.1 Linear Proportionality: focusY === 0.82 * altitude for altitude >= 0
  const trackingFactor = 0.82;
  for (let alt = 0.0; alt <= 100.0; alt += 0.25) {
    const focusY = calculateCameraFocusY(alt, trackingFactor);
    const expected = alt * trackingFactor;
    assert.ok(
      Math.abs(focusY - expected) < 1e-12,
      `Linear proportionality violated at alt=${alt}: focusY=${focusY}, expected=${expected}`
    );
    assert.ok(focusY >= 0, `Camera focus Y must be non-negative: ${focusY}`);
  }

  // 3.2 Monotonic Clamp: focusY === 0 for ALL negative altitudes
  for (let alt = -1000.0; alt <= -1e-7; alt += 5.5) {
    const focusY = calculateCameraFocusY(alt, trackingFactor);
    assert.strictEqual(
      focusY,
      0,
      `Negative altitude ${alt} must clamp focusY to 0, got ${focusY}`
    );
  }

  // 3.3 Strict Monotonicity for all altitudes in [-100, 100]
  let prevFocus = calculateCameraFocusY(-100, trackingFactor);
  for (let alt = -99.9; alt <= 100.0; alt += 0.1) {
    const currentFocus = calculateCameraFocusY(alt, trackingFactor);
    assert.ok(
      currentFocus >= prevFocus,
      `Camera focus Y violated global monotonicity at alt=${alt}: ${currentFocus} < ${prevFocus}`
    );
    prevFocus = currentFocus;
  }

  // 3.4 Default Tracking Factor check
  assert.strictEqual(calculateCameraFocusY(10.0), 10.0 * 0.82);

  // 3.5 Robustness against NaN and Infs
  assert.strictEqual(calculateCameraFocusY(NaN), 0);
  assert.strictEqual(calculateCameraFocusY(-Infinity), 0);
  assert.strictEqual(calculateCameraFocusY(4.0, -0.5), 0);

  console.log('    Verified linear 0.82x scaling, strict non-negativity, global monotonicity.');
});

// =========================================================================
// 4. BANKING ROLL BOUNDS INVARIANTS
// =========================================================================
runSuite('4. Banking Roll Bounds: Aerodynamic Angle Clamping Invariants', () => {
  // 4.1 Boundary Enclosure under Extreme Angular Velocities
  // Sweep omega from -1e12 to +1e12
  const extremeOmegas = [
    -1e12, -1e9, -1e6, -1000, -100, -10, -5, -1, 0, 1, 5, 10, 100, 1000, 1e6, 1e9, 1e12
  ];
  const dtValues = [0.001, 0.016, 0.033, 0.05, 0.1, 0.5, 1.0, 10.0];

  for (const maxRoll of [0.05, 0.15, 0.20, 0.35]) {
    for (const omega of extremeOmegas) {
      for (const dt of dtValues) {
        for (const initialRoll of [-maxRoll, -maxRoll * 0.5, 0, maxRoll * 0.5, maxRoll]) {
          const nextRoll = calculateBankingRoll(initialRoll, omega, dt, maxRoll);

          // Invariant: nextRoll must be strictly within [-maxRoll, maxRoll]
          assert.ok(
            nextRoll >= -maxRoll - 1e-12,
            `nextRoll underflow: ${nextRoll} < -${maxRoll} (omega=${omega}, dt=${dt}, init=${initialRoll})`
          );
          assert.ok(
            nextRoll <= maxRoll + 1e-12,
            `nextRoll overflow: ${nextRoll} > ${maxRoll} (omega=${omega}, dt=${dt}, init=${initialRoll})`
          );
        }
      }
    }
  }

  // 4.2 Dynamic Trajectory Simulation (5,000 steps with random wild angular velocities)
  let simRoll = 0.0;
  const simMax = 0.20;
  for (let i = 0; i < 5000; i++) {
    const wildOmega = (Math.random() - 0.5) * 2e8; // [-1e8, +1e8] rad/s
    const dt = 0.01 + Math.random() * 0.05; // 10ms - 60ms
    simRoll = calculateBankingRoll(simRoll, wildOmega, dt, simMax);

    assert.ok(
      simRoll >= -simMax - 1e-12 && simRoll <= simMax + 1e-12,
      `Trajectory roll escaped bounds at step ${i}: simRoll=${simRoll}, max=${simMax}`
    );
  }

  // 4.3 Damped Decay to Zero on Straight Flight (omega = 0)
  let roll = 0.20;
  for (let step = 0; step < 60; step++) {
    const next = calculateBankingRoll(roll, 0, 0.033, 0.20);
    assert.ok(Math.abs(next) <= Math.abs(roll), `Decay must monotonically decrease towards zero: ${next} vs ${roll}`);
    roll = next;
  }
  assert.ok(Math.abs(roll) < 1e-4, `Roll did not decay near zero after 60 frames: ${roll}`);

  console.log('    Verified strict containment within [-maxRoll, maxRoll] over 5,000 dynamic trajectory steps.');
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log('=================================================================');
console.log(`TOTAL SUITES: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('=================================================================');

if (failCount > 0) {
  process.exit(1);
}
