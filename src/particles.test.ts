/**
 * Dream Caravan (کاروان رؤیاها) - Particle & Visual System Unit Tests
 *
 * Test matrix covering:
 * 1. Pre-allocated particle pool invariants & Zero-GC guarantees
 * 2. FIFO circular ring buffer wrapping & ribbon trail alpha falloff
 * 3. Particle lifespans, decay curves & recycled footstep pools
 * 4. Color conversions, diurnal dust motes & celestial night dome
 * 5. Ground-pinned diffused shadow projection mathematics
 * 6. Luminous connection arc geometry & catenary curve validity
 * 7. Prefers-reduced-motion compliance
 * 8. Non-finite boundary robustness, clamping & lifecycle disposal
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as T from 'three';
import {
  createVisualFXSystem,
  computeNightIntensity,
  calculateShadowParams,
  calculateFootstepParams,
} from './particles.ts';

// =========================================================================
// Suite 1: Pre-allocated Particle Pool Invariants & Zero Garbage Collection
// =========================================================================

test('1.1: buffer geometries have fixed pre-allocated vertex counts and float capacities', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  const ribbonGeom = fx.ribbonGeometry!;
  const starGeom = fx.starGeometry!;
  const dustGeom = fx.dustGeometry!;
  const starDomeMesh = fx.starDomeMesh!;
  const connMesh = fx.connectionMesh!;

  // Ribbon: 32 segments, 33 cross-sections * 2 = 66 vertices, 192 indices
  assert.strictEqual(ribbonGeom.getAttribute('position').count, 66);
  assert.strictEqual(ribbonGeom.getAttribute('color').count, 66);
  assert.strictEqual(ribbonGeom.getIndex()!.count, 192);

  // Star particles pool: 64 points
  assert.strictEqual(starGeom.getAttribute('position').count, 64);
  assert.strictEqual(starGeom.getAttribute('color').count, 64);

  // Dust motes: 160 points
  assert.strictEqual(dustGeom.getAttribute('position').count, 160);

  // Celestial Star Dome: 384 points, Y >= 40
  assert.strictEqual(starDomeMesh.geometry.getAttribute('position').count, 384);
  const domePositions = starDomeMesh.geometry.getAttribute('position').array as Float32Array;
  for (let i = 0; i < 384; i++) {
    const y = domePositions[i * 3 + 1];
    assert.ok(y >= 39.99, `Celestial star Y (${y}) must be >= 40`);
  }

  // Connection Beam: 16 segments, 34 vertices, 96 indices
  assert.strictEqual(connMesh.geometry.getAttribute('position').count, 34);
  assert.strictEqual(connMesh.geometry.getIndex()!.count, 96);

  // Footstep decal pool: 32 pre-allocated meshes
  assert.strictEqual(fx.footstepPool!.length, 32);
});

test('1.2: consecutive update loops perform zero runtime TypedArray reallocations (reference identity)', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  const initialRibbonPos = fx.ribbonGeometry!.getAttribute('position').array;
  const initialRibbonCol = fx.ribbonGeometry!.getAttribute('color').array;
  const initialStarPos = fx.starGeometry!.getAttribute('position').array;
  const initialStarCol = fx.starGeometry!.getAttribute('color').array;
  const initialDustPos = fx.dustGeometry!.getAttribute('position').array;
  const initialConnPos = fx.connectionMesh!.geometry.getAttribute('position').array;
  const initialConnCol = fx.connectionMesh!.geometry.getAttribute('color').array;

  // Run 60 simulated frames of intense gameplay
  for (let i = 0; i < 60; i++) {
    fx.update(1 / 30, i * 33.33);
    fx.updateRibbonTrails(
      new T.Vector3(i * 0.1, 2 + Math.sin(i * 0.1), 0),
      new T.Vector3(i * 0.1 + 0.5, 2 + Math.cos(i * 0.1), 0.5),
      true,
    );
    fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), true);
  }

  // Strictly assert reference equality: arrays were updated in-place without reallocations
  assert.strictEqual(fx.ribbonGeometry!.getAttribute('position').array, initialRibbonPos);
  assert.strictEqual(fx.ribbonGeometry!.getAttribute('color').array, initialRibbonCol);
  assert.strictEqual(fx.starGeometry!.getAttribute('position').array, initialStarPos);
  assert.strictEqual(fx.starGeometry!.getAttribute('color').array, initialStarCol);
  assert.strictEqual(fx.dustGeometry!.getAttribute('position').array, initialDustPos);
  assert.strictEqual(fx.connectionMesh!.geometry.getAttribute('position').array, initialConnPos);
  assert.strictEqual(fx.connectionMesh!.geometry.getAttribute('color').array, initialConnCol);
});

test('1.3: particle active count accurately tracks dormant vs live instances without array splice', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  assert.strictEqual(fx.activeStarCount, 0, 'Initially star pool has 0 active particles');

  // Trigger flight movement to spawn stars
  for (let i = 0; i < 20; i++) {
    fx.update(1 / 30, i * 50);
    fx.updateRibbonTrails(new T.Vector3(i * 0.5, 5, 0), new T.Vector3(i * 0.5, 5, 1), true);
  }

  const liveStars = fx.activeStarCount!;
  assert.ok(liveStars > 0 && liveStars <= 64, `Active star count (${liveStars}) should be > 0 and <= 64`);

  // Simulate long time passing with no new flight movement
  fx.update(4.0, 10000);
  assert.strictEqual(fx.activeStarCount, 0, 'All particles must naturally expire without memory leaks');
});

// =========================================================================
// Suite 2: FIFO Circular Ring Buffer Wrapping & Traversal Trails
// =========================================================================

test('2.1: ribbon trail ring buffer head pointer advances and wraps modulo capacity', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  assert.strictEqual(fx.ribbonHead, 0);

  // Traverse 45 steps (more than 33 ring buffer capacity)
  for (let i = 1; i <= 45; i++) {
    fx.updateRibbonTrails(new T.Vector3(i * 0.2, 3, 0), new T.Vector3(i * 0.2, 3, 1), true);
  }

  assert.ok(fx.ribbonHead! >= 0 && fx.ribbonHead! < 33, 'Head pointer must wrap cleanly modulo 33');
  assert.strictEqual(fx.ribbonActiveCount, 33, 'Active segment count must clamp to ring capacity 33');
});

test('2.2: oldest segments are smoothly overwritten without Array.shift() allocations', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  // Update through multiple full rotations of the buffer
  for (let i = 0; i < 100; i++) {
    fx.updateRibbonTrails(new T.Vector3(i * 0.1, 4, 0), new T.Vector3(i * 0.1, 4, 1), true);
  }

  assert.strictEqual(fx.ribbonActiveCount, 33);
  const posArr = fx.ribbonGeometry!.getAttribute('position').array as Float32Array;
  assert.ok(Number.isFinite(posArr[0]));
});

test('2.3: monotonic alpha falloff along ribbon segments from head (1.0) to tail (0.0)', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  // Fill ribbon completely
  for (let i = 0; i < 35; i++) {
    fx.updateRibbonTrails(new T.Vector3(i * 0.2, 5, 0), new T.Vector3(i * 0.2, 5, 1), true);
  }

  const colArr = fx.ribbonGeometry!.getAttribute('color').array as Float32Array;
  let previousAlpha = 1.0;

  for (let s = 0; s <= 32; s++) {
    const alphaLeft = colArr[2 * s * 4 + 3];
    const alphaRight = colArr[(2 * s + 1) * 4 + 3];

    assert.strictEqual(alphaLeft, alphaRight, 'Left and right ribbon vertices must match alpha');
    assert.ok(
      alphaLeft <= previousAlpha + 1e-5,
      `Alpha at segment ${s} (${alphaLeft}) must be <= segment ${s - 1} (${previousAlpha})`,
    );
    previousAlpha = alphaLeft;
  }
});

test('2.4: stationary or non-flying states smoothly collapse ribbon trail opacity to zero', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  // Flying active
  for (let i = 0; i < 10; i++) {
    fx.updateRibbonTrails(new T.Vector3(i, 5, 0), new T.Vector3(i, 5, 1), true);
  }

  // Cease flying
  for (let i = 0; i < 15; i++) {
    fx.update(1 / 30, i * 33.33);
    fx.updateRibbonTrails(new T.Vector3(10, 0, 0), new T.Vector3(10, 0, 1), false);
  }

  // After fade-out, ribbon mesh is invisible
  const colArr = fx.ribbonGeometry!.getAttribute('color').array as Float32Array;
  assert.strictEqual(colArr[3], 0.0, 'Head alpha must collapse to 0');
});

// =========================================================================
// Suite 3: Particle Lifespans, Decay Curves & Recycled Pools
// =========================================================================

test('3.1: footstep decal activates on spawn and expires past 2.4s lifetime', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  fx.update(0.016, 1000);
  fx.spawnFootstepGlow(new T.Vector3(5, 0, 10));

  const pool = fx.footstepPool!;
  const spawnedDecal = pool[0];
  assert.strictEqual(spawnedDecal.visible, true);
  assert.strictEqual(spawnedDecal.position.y, 0.028);

  // Mid-life: 1.0 second elapsed
  fx.update(0.016, 2000);
  assert.strictEqual(spawnedDecal.visible, true);

  // Expired: 2.5 seconds elapsed past spawn (lifetime is 2.4s)
  fx.update(0.016, 3500);
  assert.strictEqual(spawnedDecal.visible, false, 'Decal must become hidden after lifetime');
});

test('3.2: footstep opacity follows non-linear power curve (1 - u)^1.8', () => {
  // At birth (u = 0)
  const p0 = calculateFootstepParams(0, 2.4, 0.68, 0.60, 1.20);
  assert.strictEqual(p0.y, 0.028);
  assert.strictEqual(p0.scale, 0.60);
  assert.strictEqual(p0.opacity, 0.68);
  assert.strictEqual(p0.active, true);

  // At midpoint (u = 0.5, age = 1.2)
  const pMid = calculateFootstepParams(1.2, 2.4, 0.68, 0.60, 1.20);
  const expectedMidOpacity = 0.68 * Math.pow(0.5, 1.8);
  assert.ok(Math.abs(pMid.opacity - expectedMidOpacity) < 1e-4);
  assert.ok(pMid.scale > 0.60 && pMid.scale < 1.20);
  assert.strictEqual(pMid.active, true);

  // Expired (u = 1.0, age >= 2.4)
  const pEnd = calculateFootstepParams(2.4, 2.4, 0.68, 0.60, 1.20);
  assert.strictEqual(pEnd.opacity, 0.0);
  assert.strictEqual(pEnd.scale, 1.20);
  assert.strictEqual(pEnd.active, false);
});

test('3.3: pool overflow (spawning >32 footsteps) recycles oldest instances gracefully', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  // Spawn 40 footsteps (exceeding 32 pool size)
  for (let i = 0; i < 40; i++) {
    fx.spawnFootstepGlow(new T.Vector3(i, 0, i));
  }

  assert.strictEqual(fx.footstepPool!.length, 32, 'Pool size must remain strictly 32');
});

test('3.4: live footsteps share one dynamic draw mesh and preserve the original fade', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);
  const batch = fx.footstepBatchMesh!;
  const positions = batch.geometry.getAttribute('position');
  const colors = batch.geometry.getAttribute('color');

  assert.ok(batch, 'the decals must be rendered by a shared batch mesh');
  assert.equal(positions.count, 32 * 20);
  assert.equal(colors.itemSize, 4, 'vertex alpha carries each decal’s independent fade');
  assert.equal(batch.geometry.getIndex()!.count, 32 * 18 * 3);
  assert.equal(batch.parent, scene.children[0], 'only the batch is attached to the scene');
  assert.ok(fx.footstepPool!.every((mesh) => mesh.parent === null), 'logical pool entries must not submit extra draws');

  fx.update(0, 100);
  fx.spawnFootstepGlow(new T.Vector3(5, 0, 10));
  assert.equal(fx.footstepPool![0].visible, true);
  fx.update(0, 100);
  assert.equal(batch.visible, true);

  const positionArray = positions.array as Float32Array;
  const colorArray = colors.array as Float32Array;
  assert.ok(Math.abs(positionArray[0] - 5) < 1e-6);
  assert.ok(Math.abs(positionArray[1] - 0.028) < 1e-6);
  assert.ok(Math.abs(positionArray[2] - 10) < 1e-6);
  assert.ok(Math.abs(colorArray[3] - 0.68) < 1e-6);

  fx.update(0, 1300);
  assert.ok(colorArray[3] > 0 && colorArray[3] < 0.68, 'the batched decal keeps its smooth fade');
  fx.update(0, 2000);
  fx.spawnFootstepGlow(new T.Vector3(7, 0, 12));
  fx.update(0, 2000);
  fx.update(0, 2600);
  assert.equal(fx.footstepPool![0].visible, false);
  assert.equal(batch.visible, true, 'one expired slot must not hide a newer decal');
  assert.equal(colorArray[3], 0, 'expired vertices must be cleared while other decals remain');
  assert.ok(colorArray[20 * 4 + 3] > 0, 'the newer decal keeps rendering in the same batch');
  fx.update(0, 4500);
  assert.equal(batch.visible, false, 'the shared draw is skipped when all decals expire');
  fx.dispose!();
});

test('3.5: dormant star buffers stay clean and the pooled point mesh hides when empty', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);
  const starPosition = fx.starGeometry!.getAttribute('position') as T.BufferAttribute;
  const starColor = fx.starGeometry!.getAttribute('color') as T.BufferAttribute;

  fx.update(1 / 60, 16);
  fx.update(1 / 60, 32);
  assert.equal(starPosition.version, 0, 'empty point data should not upload every frame');
  assert.equal(starColor.version, 0);
  assert.equal(fx.activeStarCount, 0);
  assert.equal(scene.getObjectByName('visual-fx-stars')!.visible, false);

  fx.update(0, 50);
  fx.updateRibbonTrails(new T.Vector3(1, 4, 0), new T.Vector3(1, 4, 1), true);
  fx.update(1 / 60, 66);
  assert.ok(fx.activeStarCount > 0);
  assert.ok(starPosition.version > 0 && starColor.version > 0, 'live star particles upload their changed buffers');
  assert.equal(scene.getObjectByName('visual-fx-stars')!.visible, true);
  fx.dispose!();
});

test('3.6: falling star particles age, reset, and recycle within the 64-particle pool', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  for (let i = 0; i < 30; i++) {
    fx.update(0.05, i * 50);
    fx.updateRibbonTrails(new T.Vector3(i, 6, 0), new T.Vector3(i, 6, 1), true);
  }

  const starPositions = fx.starGeometry!.getAttribute('position').array as Float32Array;
  let activeParticleCount = 0;
  for (let i = 0; i < 64; i++) {
    if (starPositions[i * 3 + 1] > -9000) activeParticleCount++;
  }
  assert.ok(activeParticleCount > 0);

  // Advance time past all lifespans
  fx.update(3.0, 10000);
  for (let i = 0; i < 64; i++) {
    assert.strictEqual(starPositions[i * 3 + 1], -9999, 'Expired particles must be positioned off-screen');
  }
});

// =========================================================================
// Suite 4: Color Conversions & Celestial Dome Night Intensity
// =========================================================================

test('4.1: celestial night intensity returns 0.0 at day, 1.0 at night, and eases at dusk', () => {
  assert.strictEqual(computeNightIntensity('day', 0.0), 0.0);
  assert.strictEqual(computeNightIntensity('day', 0.5), 0.0);
  assert.strictEqual(computeNightIntensity('day', 1.0), 0.0);

  // Evening: 0.0 before 0.3 progress, then ramps linearly to 1.0
  assert.strictEqual(computeNightIntensity('evening', 0.1), 0.0);
  assert.strictEqual(computeNightIntensity('evening', 0.3), 0.0);
  assert.strictEqual(computeNightIntensity('evening', 0.65), 0.5);
  assert.strictEqual(computeNightIntensity('evening', 1.0), 1.0);

  // Night: 1.0 until 0.85 progress, then soft ease to 0.70 at dawn boundary
  assert.strictEqual(computeNightIntensity('night', 0.0), 1.0);
  assert.strictEqual(computeNightIntensity('night', 0.5), 1.0);
  assert.strictEqual(computeNightIntensity('night', 0.85), 1.0);
  assert.strictEqual(computeNightIntensity('night', 1.0), 0.70);

  // Morning: Fades from 0.70 down to 0.0 over first 40%
  assert.strictEqual(computeNightIntensity('morning', 0.0), 0.70);
  assert.strictEqual(computeNightIntensity('morning', 0.2), 0.35);
  assert.strictEqual(computeNightIntensity('morning', 0.4), 0.0);
  assert.strictEqual(computeNightIntensity('morning', 0.9), 0.0);
});

test('4.2: star dome visibility flag is disabled when nightIntensity <= 0.001 (GPU bypass)', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  fx.setNightIntensity(0.0);
  assert.strictEqual(fx.starDomeMesh!.visible, false, 'Star dome must be hidden in full daylight');

  fx.setNightIntensity(0.0005);
  assert.strictEqual(fx.starDomeMesh!.visible, false);

  fx.setNightIntensity(0.5);
  assert.strictEqual(fx.starDomeMesh!.visible, true, 'Star dome must become visible during dusk and night');
  assert.ok(Math.abs((fx.starDomeMesh!.material as T.PointsMaterial).opacity - 0.475) < 1e-4);

  fx.setNightIntensity(1.0);
  assert.strictEqual(fx.starDomeMesh!.visible, true);
  assert.ok(Math.abs((fx.starDomeMesh!.material as T.PointsMaterial).opacity - 0.95) < 1e-4);
});

test('4.3: diurnal dust motes interpolate between warm gold (#fff1be) and starlight cyan (#bfe3ff)', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  fx.setNightIntensity(0.0);
  const dustMat = fx.dustMesh!.material as T.PointsMaterial;
  assert.ok(dustMat);

  const dayR = dustMat.color.r;
  const dayB = dustMat.color.b;

  fx.setNightIntensity(1.0);
  const nightR = dustMat.color.r;
  const nightB = dustMat.color.b;

  // Day has higher red (warm gold), Night has higher blue (cyan starlight)
  assert.ok(dayR > nightR, 'Day dust color should be redder/warmer');
  assert.ok(nightB > dayB, 'Night dust color should be bluer/cooler');
});

test('4.4: all color attribute conversions generate valid normalized RGB in [0.0, 1.0]', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  // Fill buffers
  for (let i = 0; i < 20; i++) {
    fx.update(1 / 30, i * 50);
    fx.updateRibbonTrails(new T.Vector3(i, 2, 0), new T.Vector3(i, 2, 1), true);
    fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), true);
  }

  const checkColors = (arr: ArrayLike<number>, name: string) => {
    for (let i = 0; i < arr.length; i++) {
      const val = arr[i];
      assert.ok(
        Number.isFinite(val) && val >= 0.0 && val <= 1.0 + 1e-4,
        `${name} color component at index ${i} (${val}) out of bounds`,
      );
    }
  };

  checkColors(fx.ribbonGeometry!.getAttribute('color').array, 'Ribbon');
  checkColors(fx.starGeometry!.getAttribute('color').array, 'Star');
  checkColors(fx.starDomeMesh!.geometry.getAttribute('color').array, 'StarDome');
  checkColors(fx.connectionMesh!.geometry.getAttribute('color').array, 'Connection');
});

// =========================================================================
// Suite 5: Ground-Pinned Diffused Shadow Mathematics
// =========================================================================

test('5.1: shadow remains strictly pinned to ground plane Y = 0.025 regardless of character altitude', () => {
  assert.strictEqual(calculateShadowParams(0).y, 0.025);
  assert.strictEqual(calculateShadowParams(2.5).y, 0.025);
  assert.strictEqual(calculateShadowParams(8.0).y, 0.025);
  assert.strictEqual(calculateShadowParams(14.0).y, 0.025);
});

test('5.2: shadow radius expands with altitude: scale(h) = 1.0 + 0.14 * h', () => {
  assert.strictEqual(calculateShadowParams(0).scale, 1.0);
  assert.strictEqual(calculateShadowParams(2).scale, 1.28);
  assert.strictEqual(calculateShadowParams(8).scale, 2.12);
  assert.strictEqual(calculateShadowParams(10).scale, 2.40);
});

test('5.3: shadow opacity diffuses with altitude: opacity(h) = 0.19 / (1.0 + 0.24 * h)', () => {
  assert.strictEqual(calculateShadowParams(0).opacity, 0.19);

  const shadow4 = calculateShadowParams(4);
  assert.ok(Math.abs(shadow4.opacity - (0.19 / (1.0 + 0.24 * 4))) < 1e-4);

  const shadow8 = calculateShadowParams(8);
  assert.ok(Math.abs(shadow8.opacity - (0.19 / (1.0 + 0.24 * 8))) < 1e-4);
  assert.ok(Math.abs(shadow8.opacity - 0.065) < 0.001);
});

// =========================================================================
// Suite 6: Luminous Connection Arc/Beam
// =========================================================================

test('6.1: hand-hold beam toggles visibility based on active flag', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), true);
  fx.update(0.1, 100);
  assert.strictEqual(fx.connectionMesh!.visible, true, 'Beam must become visible when active');

  // Deactivate
  fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), false);
  // Advance time to allow fade-out
  for (let i = 0; i < 20; i++) {
    fx.update(0.1, 200 + i * 100);
  }
  assert.strictEqual(fx.connectionMesh!.visible, false, 'Beam must become invisible after fade-out');
});

test('6.2: intermediate catenary/bezier curve points generate valid geometry without NaN', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  fx.setHandHoldConnection(new T.Vector3(-1.5, 1.2, 0), new T.Vector3(1.5, 1.2, 0), true);
  fx.update(0.016, 500);

  const posArr = fx.connectionMesh!.geometry.getAttribute('position').array as Float32Array;
  assert.strictEqual(posArr.length, 34 * 3);

  for (let i = 0; i < posArr.length; i++) {
    assert.ok(Number.isFinite(posArr[i]), `Position at index ${i} is non-finite: ${posArr[i]}`);
  }
});

// =========================================================================
// Suite 7: Prefers-Reduced-Motion Compliance
// =========================================================================

test('7.1: reduced-motion mode sets dust motes drift velocity to zero (stationary specks)', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene, { reducedMotion: true });

  const posArr = fx.dustGeometry!.getAttribute('position').array as Float32Array;
  const initialX = posArr[0];
  const initialY = posArr[1];
  const initialZ = posArr[2];

  // Update over several seconds
  fx.update(1.0, 1000);
  fx.update(1.0, 2000);
  fx.update(1.0, 3000);

  assert.strictEqual(posArr[0], initialX, 'Dust X position must not drift in reduced motion');
  assert.strictEqual(posArr[1], initialY, 'Dust Y position must not drift in reduced motion');
  assert.strictEqual(posArr[2], initialZ, 'Dust Z position must not drift in reduced motion');
});

test('7.2: reduced-motion mode freezes active ribbons and hand connections', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  for (let i = 0; i < 5; i++) {
    fx.updateRibbonTrails(new T.Vector3(i, 2, 3), new T.Vector3(i + 1, 2, 3), true);
    fx.update(0.016, i * 16);
  }
  fx.setHandHoldConnection(new T.Vector3(0, 1, 0), new T.Vector3(1, 1, 0), true);
  fx.update(0.016, 80);

  const posArr = fx.ribbonGeometry!.getAttribute('position').array as Float32Array;
  const before = Array.from(posArr);
  const connectionPosArr = fx.connectionMesh!.geometry.getAttribute('position').array as Float32Array;
  const connectionBefore = Array.from(connectionPosArr);
  const head = fx.ribbonHead;
  const activeCount = fx.ribbonActiveCount;
  fx.setReducedMotion!(true);
  fx.update(5, 5000);
  fx.updateRibbonTrails(new T.Vector3(50, 20, 30), new T.Vector3(60, 20, 30), true);
  fx.setHandHoldConnection(new T.Vector3(30, 20, 10), new T.Vector3(60, 20, 10), true);
  fx.update(5, 10000);

  assert.deepStrictEqual(Array.from(posArr), before, 'Ribbon vertices must remain fixed while reduced motion is enabled');
  assert.deepStrictEqual(Array.from(connectionPosArr), connectionBefore, 'Hand connection geometry must remain fixed while reduced motion is enabled');
  assert.strictEqual(fx.ribbonHead, head, 'Reduced-motion samples must not advance the trail ring buffer');
  assert.strictEqual(fx.ribbonActiveCount, activeCount);
});

test('7.3: reduced-motion mode freezes live particle positions and colors at runtime', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  for (let i = 0; i < 10; i++) {
    fx.update(0.016, i * 20);
    fx.updateRibbonTrails(new T.Vector3(i, 4, 0), new T.Vector3(i, 4, 1), true);
  }

  assert.ok((fx.activeStarCount ?? 0) > 0, 'Flight should create particles before the pause');
  const posArr = fx.starGeometry!.getAttribute('position').array as Float32Array;
  const colArr = fx.starGeometry!.getAttribute('color').array as Float32Array;
  const beforePositions = Array.from(posArr);
  const beforeColors = Array.from(colArr);
  const beforeCount = fx.activeStarCount;

  fx.setReducedMotion!(true);
  for (let i = 0; i < 10; i++) fx.update(0.5, 1000 + i * 500);

  assert.deepStrictEqual(Array.from(posArr), beforePositions, 'Live particles must not move or expire during the pause');
  assert.deepStrictEqual(Array.from(colArr), beforeColors, 'Particle colors and alpha must remain fixed during the pause');
  assert.strictEqual(fx.activeStarCount, beforeCount);
});

test('7.4: reduced motion freezes active footstep halos and pauses their lifetime across runtime toggles', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);
  fx.update(0.016, 1000);
  fx.spawnFootstepGlow(new T.Vector3(5, 0, 10));
  fx.update(0.1, 1100);

  const halo = fx.footstepPool![0];
  const beforeScale = halo.scale.x;
  const beforeOpacity = (halo.material as T.MeshBasicMaterial).opacity;
  fx.setReducedMotion!(true);
  fx.update(2, 3100);
  fx.spawnFootstepGlow(new T.Vector3(7, 0, 12));

  assert.strictEqual(halo.scale.x, beforeScale, 'An active halo must stop expanding while reduced motion is enabled');
  assert.strictEqual((halo.material as T.MeshBasicMaterial).opacity, beforeOpacity, 'An active halo must stop fading while reduced motion is enabled');
  assert.strictEqual(fx.footstepPool![1].visible, false, 'No new halo should spawn during reduced motion');

  fx.setReducedMotion!(false);
  fx.update(0.016, 3116);
  assert.ok(halo.visible, 'A paused halo must not expire during the reduced-motion interval');
  assert.ok(halo.scale.x >= beforeScale && halo.scale.x - beforeScale < 0.02, 'Halo age should resume from its paused age');
  assert.ok((halo.material as T.MeshBasicMaterial).opacity <= beforeOpacity, 'Halo fade should resume after reduced motion ends');
});

// =========================================================================
// Suite 8: Robustness, Clamping & Lifecycle Disposal
// =========================================================================

test('8.1: negative, zero, and huge delta times clamp safely without throwing or NaN propagation', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  assert.doesNotThrow(() => fx.update(-1.0, -500));
  assert.doesNotThrow(() => fx.update(0.0, 0));
  assert.doesNotThrow(() => fx.update(100.0, 99999999));
  assert.doesNotThrow(() => fx.update(NaN, NaN));
  assert.doesNotThrow(() => fx.updateRibbonTrails(new T.Vector3(NaN, NaN, NaN), new T.Vector3(0, 0, 0), true));
  assert.doesNotThrow(() => fx.setNightIntensity(-5));
  assert.doesNotThrow(() => fx.setNightIntensity(NaN));
  assert.doesNotThrow(() => fx.setNightIntensity(100));
});

test('8.2: system dispose() unhooks scene nodes and disposes all geometries and materials', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  assert.strictEqual(scene.children.length, 1);
  fx.dispose!();
  assert.strictEqual(scene.children.length, 0, 'Root group must be cleanly removed from scene');
});

test('8.3: spawnEmbraceWarmth spawns warm stars and respects reduced motion', () => {
  const scene = new T.Scene();
  const fx = createVisualFXSystem(scene);

  const initialCount = fx.activeStarCount ?? 0;
  fx.spawnEmbraceWarmth!(new T.Vector3(1, 2, 3));
  assert.ok((fx.activeStarCount ?? 0) >= initialCount);

  // When reducedMotion is enabled, does not spawn
  fx.setReducedMotion!(true);
  const beforeReduced = fx.activeStarCount ?? 0;
  fx.spawnEmbraceWarmth!(new T.Vector3(1, 2, 3));
  assert.strictEqual(fx.activeStarCount ?? 0, beforeReduced);
});
