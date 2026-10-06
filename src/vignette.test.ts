import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVignetteState,
  triggerVignette,
  calculateVignetteOpacity,
  updateVignetteState,
  ADULT_VIGNETTE_ASSETS,
} from './vignette.ts';

test('createVignetteState initializes inactive with zero opacity', () => {
  const v = createVignetteState();
  assert.equal(v.active, false);
  assert.equal(v.opacity, 0);
  assert.equal(v.caption, '');
});

test('triggerVignette activates state and selects valid adult asset', () => {
  const v0 = createVignetteState();
  const v1 = triggerVignette(v0, 0, 1000, 2000);
  assert.equal(v1.active, true);
  assert.equal(v1.imageSrc, ADULT_VIGNETTE_ASSETS[0].image);
  assert.equal(v1.startedAt, 1000);
  assert.equal(v1.durationMs, 2000);
});

test('calculateVignetteOpacity follows smooth ease-in peak and ease-out', () => {
  const v = triggerVignette(createVignetteState(), 0, 1000, 2000);
  // At start
  assert.equal(calculateVignetteOpacity(v, 1000), 0);
  // At 12.5% (mid fade-in)
  const fadeIn = calculateVignetteOpacity(v, 1250);
  assert.ok(fadeIn > 0 && fadeIn < 0.92);
  // At 50% (peak sustain)
  assert.equal(calculateVignetteOpacity(v, 2000), 0.92);
  // At 87.5% (mid fade-out)
  const fadeOut = calculateVignetteOpacity(v, 2750);
  assert.ok(fadeOut > 0 && fadeOut < 0.92);
  // After completion
  assert.equal(calculateVignetteOpacity(v, 3050), 0);
});

test('updateVignetteState resets to inactive once duration expires', () => {
  let v = triggerVignette(createVignetteState(), 1, 1000, 1000);
  assert.equal(v.active, true);
  v = updateVignetteState(v, 1500);
  assert.equal(v.active, true);
  assert.ok(v.opacity > 0);
  v = updateVignetteState(v, 2100);
  assert.equal(v.active, false);
  assert.equal(v.opacity, 0);
});
