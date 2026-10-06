import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateButterflyPosition,
  calculateButterflyWingFlap,
  calculateCelestialBirdPosition,
  calculateFishPondPosition,
  createSpiritDeerState,
  updateSpiritDeerState,
} from './fauna.ts';

test('calculateButterflyPosition calculates valid non-NaN 3D position in orbit', () => {
  const center = { x: 10, y: 0, z: -5 };
  const pos = calculateButterflyPosition(center, Math.PI / 4, 1.5, 0.1);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
  assert.ok(pos.y >= 0.4);
});

test('calculateButterflyPosition handles NaN and zero inputs safely', () => {
  const pos = calculateButterflyPosition({ x: NaN, y: NaN, z: NaN }, NaN, NaN, NaN);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
});

test('calculateButterflyWingFlap produces continuous sinusoidal flap', () => {
  const flap0 = calculateButterflyWingFlap(0, 10);
  assert.equal(flap0, 0);
  const flapPeak = calculateButterflyWingFlap(Math.PI / 20, 10);
  assert.ok(flapPeak > 0.7);
  assert.ok(flapPeak <= 0.75);
});

test('createSpiritDeerState initializes at specified home position', () => {
  const deer = createSpiritDeerState(-15, 25);
  assert.equal(deer.position.x, -15);
  assert.equal(deer.position.z, 25);
  assert.equal(deer.isGrazing, true);
});

test('updateSpiritDeerState transitions between grazing and wandering', () => {
  let deer = createSpiritDeerState(-21, 19);
  // Advance while grazing across multiple frames
  for (let i = 0; i < 15; i++) {
    deer = updateSpiritDeerState(deer, 0.5);
  }
  // After 7.5s (> 6.0s threshold), deer should transition to wandering
  assert.equal(deer.isGrazing, false);
  assert.ok(Number.isFinite(deer.targetPosition.x));
  assert.ok(Number.isFinite(deer.targetPosition.z));
});

test('calculateCelestialBirdPosition calculates valid high altitude soaring coordinates', () => {
  const center = { x: 0, y: 0, z: 0 };
  const pos = calculateCelestialBirdPosition(center, Math.PI / 3, 20, 11, 0.2);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
  assert.ok(pos.y >= 10.0);
});

test('calculateCelestialBirdPosition handles NaN inputs safely with bounded altitude', () => {
  const pos = calculateCelestialBirdPosition({ x: NaN, y: NaN, z: NaN }, NaN, NaN, NaN, NaN);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
  assert.ok(pos.y >= 2.0);
});

test('calculateFishPondPosition calculates planar elliptical trajectory just below surface', () => {
  const center = { x: 0, y: 0, z: 0 };
  const pos = calculateFishPondPosition(center, Math.PI / 2, 2.5, 1.8);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
  assert.equal(pos.y, 0.16);
});

test('calculateFishPondPosition handles invalid inputs safely without NaN', () => {
  const pos = calculateFishPondPosition({ x: NaN, y: NaN, z: NaN }, NaN, NaN, NaN);
  assert.ok(Number.isFinite(pos.x));
  assert.ok(Number.isFinite(pos.y));
  assert.ok(Number.isFinite(pos.z));
});
