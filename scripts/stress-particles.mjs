import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import * as T from 'three';
import {
  createVisualFXSystem,
  computeNightIntensity,
  calculateShadowParams,
  calculateFootstepParams,
} from '../src/particles.ts';
import { sampleAmbience } from '../src/ambience.ts';

console.log('=== DREAM CARAVAN: EMPIRICAL STRESS & INVARIANT HARNESS ===\n');

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
// 1. SHADOW ALTITUDE DIFFUSION INVARIANTS
// =========================================================================
runSuite('1. Shadow Altitude Diffusion Invariants', () => {
  // Test h=0
  const s0 = calculateShadowParams(0);
  assert.strictEqual(s0.y, 0.025, 'Ground pinned y must be 0.025 at h=0');
  assert.strictEqual(s0.scale, 1.0, 'Scale must be 1.0 at h=0');
  assert.strictEqual(s0.opacity, 0.19, 'Opacity must be 0.19 at h=0');

  // Test h=8
  const s8 = calculateShadowParams(8);
  assert.strictEqual(s8.y, 0.025, 'Ground pinned y must be 0.025 at h=8');
  assert.strictEqual(s8.scale, 2.12, 'Scale must be exactly 2.12 at h=8');
  const expectedOpacity8 = 0.19 / (1.0 + 0.24 * 8); // 0.19 / 2.92 = 0.065068493...
  assert.ok(Math.abs(s8.opacity - 0.065) < 0.001, `Opacity at h=8 (${s8.opacity}) must be ~0.065`);
  assert.ok(Math.abs(s8.opacity - expectedOpacity8) < 1e-5, 'Opacity must match exact theoretical formula');

  // Sweep h in [0, 50] with step 0.1: verify strict monotonicity and non-negativity
  let prevScale = s0.scale;
  let prevOpacity = s0.opacity;
  for (let h = 0.1; h <= 50; h += 0.1) {
    const sp = calculateShadowParams(h);
    assert.strictEqual(sp.y, 0.025, `y must remain pinned at 0.025 at h=${h}`);
    assert.ok(sp.scale >= prevScale, `Scale must be monotonically non-decreasing at h=${h}`);
    assert.ok(sp.opacity <= prevOpacity, `Opacity must be monotonically non-increasing at h=${h}`);
    assert.ok(sp.opacity >= 0.0, `Opacity must remain non-negative at h=${h}`);
    prevScale = sp.scale;
    prevOpacity = sp.opacity;
  }

  // Adversarial edge cases: negative altitude, NaN, Infinity
  const sNeg = calculateShadowParams(-5);
  assert.strictEqual(sNeg.y, 0.025);
  assert.strictEqual(sNeg.scale, 1.0, 'Negative altitude must clamp to h=0 scale');
  assert.strictEqual(sNeg.opacity, 0.19, 'Negative altitude must clamp to h=0 opacity');

  const sNaN = calculateShadowParams(NaN);
  assert.strictEqual(sNaN.scale, 1.0);
  assert.strictEqual(sNaN.opacity, 0.19);

  const sInf = calculateShadowParams(Infinity);
  assert.strictEqual(sInf.y, 0.025);
  // Infinity should clamp or produce valid finite output
  assert.ok(Number.isFinite(sInf.scale) || sInf.scale === Infinity);
});

// =========================================================================
// 2. CELESTIAL NIGHT INTENSITY ACROSS 4 DIURNAL PHASES
// =========================================================================
runSuite('2. Celestial Night Intensity Across 4 Diurnal Phases', () => {
  // Day phase invariant: exactly 0.0 for ALL progress values
  for (let p = 0; p <= 1.0; p += 0.01) {
    const val = computeNightIntensity('day', p);
    assert.strictEqual(val, 0.0, `Day night intensity at p=${p} must be exactly 0.0`);
  }

  // Evening phase: 0.0 before 0.3, then smooth linear ramp to 1.0
  assert.strictEqual(computeNightIntensity('evening', 0.0), 0.0);
  assert.strictEqual(computeNightIntensity('evening', 0.3), 0.0);
  assert.strictEqual(computeNightIntensity('evening', 0.65), 0.5);
  assert.strictEqual(computeNightIntensity('evening', 1.0), 1.0);

  // Night phase: exactly 1.0 for p in [0.0, 0.85]
  for (let p = 0; p <= 0.85; p += 0.05) {
    const val = computeNightIntensity('night', p);
    assert.strictEqual(val, 1.0, `Night intensity at p=${p} must be exactly 1.0`);
  }
  // Soft ease towards dawn in final 15% (reaches 0.70 at p=1.0)
  assert.strictEqual(computeNightIntensity('night', 1.0), 0.70);

  // Morning phase: fades from 0.70 down to 0.0 over first 40%
  assert.strictEqual(computeNightIntensity('morning', 0.0), 0.70);
  assert.strictEqual(computeNightIntensity('morning', 0.2), 0.35);
  assert.strictEqual(computeNightIntensity('morning', 0.4), 0.0);
  assert.strictEqual(computeNightIntensity('morning', 1.0), 0.0);

  // Phase transition continuity (C0 continuity across boundaries)
  const dayEnd = computeNightIntensity('day', 1.0);
  const eveningStart = computeNightIntensity('evening', 0.0);
  assert.strictEqual(dayEnd, eveningStart, 'Continuity broken between Day and Evening');

  const eveningEnd = computeNightIntensity('evening', 1.0);
  const nightStart = computeNightIntensity('night', 0.0);
  assert.strictEqual(eveningEnd, nightStart, 'Continuity broken between Evening and Night');

  const nightEnd = computeNightIntensity('night', 1.0);
  const morningStart = computeNightIntensity('morning', 0.0);
  assert.strictEqual(nightEnd, morningStart, 'Continuity broken between Night and Morning');

  const morningEnd = computeNightIntensity('morning', 1.0);
  const dayStart = computeNightIntensity('day', 0.0);
  assert.strictEqual(morningEnd, dayStart, 'Continuity broken between Morning and Day');

  // Complete 18-minute session cycle simulation (10,800 frames at 10Hz)
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);
  let prevIntensity = -1;

  for (let sec = 0; sec <= 18 * 60; sec += 0.1) {
    const sample = sampleAmbience(sec);
    const intensity = computeNightIntensity(sample.phase, sample.phaseProgress);

    assert.ok(
      intensity >= 0.0 && intensity <= 1.0,
      `Night intensity (${intensity}) at sec=${sec} out of [0.0, 1.0]`,
    );

    if (prevIntensity >= 0) {
      const delta = Math.abs(intensity - prevIntensity);
      assert.ok(
        delta <= 0.02,
        `Sudden jump in night intensity (${delta}) at sec=${sec}`,
      );
    }
    prevIntensity = intensity;

    // Verify Star Dome GPU bypass integration
    fx.setNightIntensity(intensity);
    if (intensity <= 0.001) {
      assert.strictEqual(fx.starDomeMesh.visible, false, `Star dome must be invisible when intensity <= 0.001 (sec=${sec})`);
    } else {
      assert.strictEqual(fx.starDomeMesh.visible, true, `Star dome must be visible when intensity > 0.001 (sec=${sec})`);
    }
  }
  fx.dispose();
});

// =========================================================================
// 3. FOOTSTEP DECAL POWER LAW DECAY (1 - u)^1.8
// =========================================================================
runSuite('3. Footstep Decal Power Law Decay (1 - u)^1.8', () => {
  const lifetime = 2.4;
  const baseOpacity = 0.68;
  const startScale = 0.60;
  const endScale = 1.20;

  // Exact oracle check across 100 sample points
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const age = u * lifetime;
    const p = calculateFootstepParams(age, lifetime, baseOpacity, startScale, endScale);

    assert.strictEqual(p.y, 0.028, `Footstep y must be strictly 0.028 at u=${u}`);

    if (u >= 1.0) {
      assert.strictEqual(p.active, false);
      assert.strictEqual(p.opacity, 0.0);
      assert.strictEqual(p.scale, endScale);
    } else {
      assert.strictEqual(p.active, true);

      // Verify exact power law: opacity = baseOpacity * (1 - u)^1.8
      const expectedOpacity = baseOpacity * Math.pow(1.0 - u, 1.8);
      assert.ok(
        Math.abs(p.opacity - expectedOpacity) < 1e-5,
        `Footstep opacity mismatch at u=${u}: got ${p.opacity}, expected ${expectedOpacity}`,
      );

      // Verify quadratic ease-out scale: s(u) = startScale + (endScale - startScale) * (1 - (1 - u)^2)
      const expectedScale = startScale + (endScale - startScale) * (1.0 - (1.0 - u) * (1.0 - u));
      assert.ok(
        Math.abs(p.scale - expectedScale) < 1e-5,
        `Footstep scale mismatch at u=${u}: got ${p.scale}, expected ${expectedScale}`,
      );
    }
  }

  // Verify non-linear decay curve derivative: d(opacity)/du < 0 (monotonically decreasing)
  let prevO = baseOpacity;
  let prevS = startScale;
  for (let i = 1; i < 100; i++) {
    const u = i / 100;
    const p = calculateFootstepParams(u * lifetime);
    assert.ok(p.opacity < prevO, `Opacity must be strictly decreasing at u=${u}`);
    assert.ok(p.scale > prevS, `Scale must be strictly increasing at u=${u}`);
    prevO = p.opacity;
    prevS = p.scale;
  }

  // Robustness with non-finite and negative age
  const pNeg = calculateFootstepParams(-1.0);
  assert.strictEqual(pNeg.opacity, baseOpacity);
  assert.strictEqual(pNeg.scale, startScale);

  const pNaN = calculateFootstepParams(NaN);
  assert.strictEqual(pNaN.opacity, baseOpacity);
  assert.strictEqual(pNaN.scale, startScale);

  const pPast = calculateFootstepParams(100.0);
  assert.strictEqual(pPast.opacity, 0.0);
  assert.strictEqual(pPast.active, false);
});

// =========================================================================
// 4. MOBILE THERMAL FRAME BUDGET & STRESS HARNESS
// =========================================================================
runSuite('4. Mobile Thermal Frame Budget (Worst-Case Workload Stress)', () => {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(0, 20, 25);
  camera.lookAt(0, 0, 0);

  const fx = createVisualFXSystem(scene, { camera, reducedMotion: false });

  // Warmup 50 frames
  for (let f = 0; f < 50; f++) {
    fx.update(1 / 30, f * 33.33);
    fx.updateRibbonTrails(new T.Vector3(f * 0.1, 5, 0), new T.Vector3(f * 0.1, 5, 1), true);
  }

  // Pre-load maximum stress elements:
  // - 32 footsteps active
  for (let i = 0; i < 32; i++) {
    fx.spawnFootstepGlow(new T.Vector3(i, 0, i));
  }
  // - Hand-holding connection active
  fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), true);
  // - Night intensity full (dome active, stars active)
  fx.setNightIntensity(1.0);

  // Force GC before measurement if possible
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const FRAME_COUNT = 1000;
  const frameTimes = new Float64Array(FRAME_COUNT);

  const startTotal = performance.now();

  for (let f = 0; f < FRAME_COUNT; f++) {
    const now = 2000 + f * 33.33; // 30 FPS simulated interval
    const t0 = performance.now();

    // 1. Full particle system tick
    fx.update(1 / 30, now);

    // 2. Flight ribbons with 3D motion & star shedding
    const angelPos = new T.Vector3(Math.sin(f * 0.05) * 10, 6 + Math.cos(f * 0.08) * 2, Math.cos(f * 0.05) * 10);
    const gorPos = new T.Vector3(Math.sin(f * 0.05 + 0.1) * 10, 6 + Math.cos(f * 0.08 + 0.1) * 2, Math.cos(f * 0.05 + 0.1) * 10);
    fx.updateRibbonTrails(angelPos, gorPos, true);

    // 3. Handhold arc flutter
    fx.setHandHoldConnection(angelPos, gorPos, true);

    // 4. Footstep spawn every 15 frames
    if (f % 15 === 0) {
      fx.spawnFootstepGlow(angelPos);
    }

    // 5. Ground shadow recalculations for both characters
    const shAngel = calculateShadowParams(angelPos.y);
    const shGor = calculateShadowParams(gorPos.y);
    assert.strictEqual(shAngel.y, 0.025);
    assert.strictEqual(shGor.y, 0.025);

    const t1 = performance.now();
    frameTimes[f] = t1 - t0;
  }

  const endTotal = performance.now();
  const totalDuration = endTotal - startTotal;
  const memAfter = process.memoryUsage().heapUsed;

  // Compute timing percentiles
  frameTimes.sort();
  const avgFrameTime = totalDuration / FRAME_COUNT;
  const p50 = frameTimes[Math.floor(FRAME_COUNT * 0.50)];
  const p95 = frameTimes[Math.floor(FRAME_COUNT * 0.95)];
  const p99 = frameTimes[Math.floor(FRAME_COUNT * 0.99)];
  const maxFrameTime = frameTimes[FRAME_COUNT - 1];

  console.log(`    [BENCHMARK RESULTS - 1,000 WORST-CASE FRAMES]`);
  console.log(`    Total Duration:     ${totalDuration.toFixed(2)} ms`);
  console.log(`    Average Frame CPU:  ${avgFrameTime.toFixed(4)} ms`);
  console.log(`    Median (p50):       ${p50.toFixed(4)} ms`);
  console.log(`    95th percentile:    ${p95.toFixed(4)} ms`);
  console.log(`    99th percentile:    ${p99.toFixed(4)} ms`);
  console.log(`    Max Frame Time:     ${maxFrameTime.toFixed(4)} ms`);
  console.log(`    Heap Delta:         ${((memAfter - memBefore) / 1024).toFixed(2)} KB`);

  // Mobile Thermal Frame Budget assertions:
  // Mobile CPU execution budget per frame is strictly < 1.0 ms (to allow 15ms for GPU & OS)
  assert.ok(
    avgFrameTime < 1.0,
    `Average frame CPU time (${avgFrameTime.toFixed(4)} ms) exceeds mobile thermal budget 1.0 ms!`,
  );
  assert.ok(
    p95 < 2.0,
    `95th percentile frame time (${p95.toFixed(4)} ms) exceeds mobile thermal spike budget 2.0 ms!`,
  );
  assert.ok(
    maxFrameTime < 10.0,
    `Max frame time spike (${maxFrameTime.toFixed(4)} ms) exceeds thermal hitch budget 10.0 ms!`,
  );

  fx.dispose();
});

// =========================================================================
// 5. ADVERSARIAL GEOMETRY & CAMERA DEGENERACY HARNESS
// =========================================================================
runSuite('5. Adversarial Geometry & Camera Degeneracy Tests', () => {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  const fx = createVisualFXSystem(scene, { camera });

  // Adversarial case A: Ribbon movement collinear with camera ray (t x d = 0 degeneracy)
  for (let i = 0; i < 10; i++) {
    // Flying directly towards the camera on Z axis
    fx.updateRibbonTrails(new T.Vector3(0, 0, 10 - i * 0.5), new T.Vector3(0.1, 0, 10 - i * 0.5), true);
    fx.update(1 / 30, i * 33);
  }
  const ribbonPos = fx.ribbonGeometry.getAttribute('position').array;
  for (let i = 0; i < ribbonPos.length; i++) {
    assert.ok(Number.isFinite(ribbonPos[i]), `Collinear camera vector produced non-finite vertex: ${ribbonPos[i]}`);
  }

  // Adversarial case B: Handhold arc when Angel and Gorastakh are at identical positions (d = 0)
  fx.setHandHoldConnection(new T.Vector3(5, 2, 5), new T.Vector3(5, 2, 5), true);
  fx.update(1 / 30, 500);
  const connPos = fx.connectionMesh.geometry.getAttribute('position').array;
  for (let i = 0; i < connPos.length; i++) {
    assert.ok(Number.isFinite(connPos[i]), `Coincident hands produced non-finite vertex: ${connPos[i]}`);
  }

  // Adversarial case C: Camera positioned exactly at connection arc midpoint
  camera.position.set(5, 2, 5);
  fx.update(1 / 30, 600);
  for (let i = 0; i < connPos.length; i++) {
    assert.ok(Number.isFinite(connPos[i]), `Coincident camera produced non-finite vertex: ${connPos[i]}`);
  }

  // Adversarial case D: Dynamic reduced-motion toggle back and forth
  fx.setReducedMotion(true);
  fx.update(0.1, 700);
  fx.setReducedMotion(false);
  fx.update(0.1, 800);
  fx.setReducedMotion(true);

  fx.dispose();
});

// =========================================================================
// 6. LONG-TERM ENDURANCE TEST (10,000 CONSECUTIVE SIMULATED FRAMES)
// =========================================================================
runSuite('6. Long-Term Endurance & Zero-GC Memory Stability (10,000 Frames)', () => {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(0, 20, 25);
  camera.lookAt(0, 0, 0);

  const fx = createVisualFXSystem(scene, { camera });

  // Baseline buffer references
  const ribbonPosRef = fx.ribbonGeometry.getAttribute('position').array;
  const ribbonColRef = fx.ribbonGeometry.getAttribute('color').array;
  const starPosRef = fx.starGeometry.getAttribute('position').array;
  const starColRef = fx.starGeometry.getAttribute('color').array;
  const dustPosRef = fx.dustGeometry.getAttribute('position').array;
  const connPosRef = fx.connectionMesh.geometry.getAttribute('position').array;

  const tStart = performance.now();
  const angelPos = new T.Vector3(0, 4, 0);
  const gorPos = new T.Vector3(1, 4, 0);

  for (let f = 0; f < 10000; f++) {
    const now = f * 33.33;
    const dt = 1 / 30;

    angelPos.x = Math.sin(f * 0.01) * 12;
    angelPos.z = Math.cos(f * 0.01) * 12;
    gorPos.x = Math.sin(f * 0.01 + 0.1) * 12;
    gorPos.z = Math.cos(f * 0.01 + 0.1) * 12;

    fx.update(dt, now);
    fx.updateRibbonTrails(angelPos, gorPos, true);
    fx.setHandHoldConnection(angelPos, gorPos, (f % 60) < 40);

    if (f % 10 === 0) {
      fx.spawnFootstepGlow(angelPos);
    }

    if (f % 300 === 0) {
      const p = (f % 1200) / 1200;
      fx.setNightIntensity(computeNightIntensity('evening', p));
    }
  }

  const tEnd = performance.now();
  const elapsed = tEnd - tStart;
  const avgMs = elapsed / 10000;

  console.log(`    [10,000 FRAMES ENDURANCE COMPLETED]`);
  console.log(`    Total Elapsed:      ${elapsed.toFixed(2)} ms`);
  console.log(`    Average Frame CPU:  ${avgMs.toFixed(4)} ms`);

  // Strictly verify that no TypedArray was reallocated during all 10,000 frames
  assert.strictEqual(fx.ribbonGeometry.getAttribute('position').array, ribbonPosRef);
  assert.strictEqual(fx.ribbonGeometry.getAttribute('color').array, ribbonColRef);
  assert.strictEqual(fx.starGeometry.getAttribute('position').array, starPosRef);
  assert.strictEqual(fx.starGeometry.getAttribute('color').array, starColRef);
  assert.strictEqual(fx.dustGeometry.getAttribute('position').array, dustPosRef);
  assert.strictEqual(fx.connectionMesh.geometry.getAttribute('position').array, connPosRef);

  fx.dispose();
});

console.log(`\n======================================================`);
console.log(`TOTAL SUITES: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log(`======================================================\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
