import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sampleAmbience } from './ambience.ts';

const CYCLE_SECONDS = 18 * 60;

test('active-session ambience is deterministic and repeats every full cycle', () => {
  for (const elapsed of [0, 41.5, 180, 220, 480, 600, 870, 1079.5]) {
    const sample = sampleAmbience(elapsed);
    assert.deepEqual(sampleAmbience(elapsed), sample);
    assert.deepEqual(sampleAmbience(elapsed + CYCLE_SECONDS), sample);
    assert.ok(sample.phaseProgress >= 0 && sample.phaseProgress < 1);
    assert.match(sample.skyColor, /^#[0-9a-f]{6}$/i);
    assert.match(sample.fogColor, /^#[0-9a-f]{6}$/i);
    assert.match(sample.hemisphereColor, /^#[0-9a-f]{6}$/i);
    assert.match(sample.sunColor, /^#[0-9a-f]{6}$/i);
  }
});

test('four soft light phases turn over every four and a half active minutes', () => {
  assert.equal(sampleAmbience(0).phase, 'morning');
  assert.equal(sampleAmbience(269.999).phase, 'morning');
  assert.equal(sampleAmbience(270).phase, 'day');
  assert.equal(sampleAmbience(540).phase, 'evening');
  assert.equal(sampleAmbience(810).phase, 'night');
  assert.equal(sampleAmbience(1080).phase, 'morning');
  assert.equal(sampleAmbience(1080 + 270).phase, 'day');

  const justBefore = sampleAmbience(270 - 0.001).skyColor;
  const atBoundary = sampleAmbience(270).skyColor;
  const channels = (color: string) => color.slice(1).match(/../g)!.map(value => Number.parseInt(value, 16));
  assert.ok(channels(justBefore).every((channel, index) => Math.abs(channel - channels(atBoundary)[index]) <= 1));
});

test('breeze, light rain, and clear weather follow the fixed active-time windows', () => {
  const breezeStart = sampleAmbience(180);
  const breezeRising = sampleAmbience(192);
  const earlyBreeze = sampleAmbience(210);
  const breezeFading = sampleAmbience(258);
  assert.equal(breezeStart.weather, 'breeze');
  assert.ok(breezeStart.windStrength < breezeRising.windStrength);
  assert.ok(breezeRising.windStrength < earlyBreeze.windStrength);
  assert.ok(breezeFading.windStrength < earlyBreeze.windStrength);
  assert.equal(earlyBreeze.weather, 'breeze');
  assert.ok(earlyBreeze.windStrength > 0.7);
  assert.equal(earlyBreeze.rainStrength, 0);

  const rainStart = sampleAmbience(540);
  const rainRising = sampleAmbience(552);
  const rain = sampleAmbience(600);
  const rainFading = sampleAmbience(648);
  assert.equal(rainStart.weather, 'rain');
  assert.ok(rainStart.rainStrength < rainRising.rainStrength);
  assert.ok(rainRising.rainStrength < rain.rainStrength);
  assert.ok(rainFading.rainStrength < rain.rainStrength);
  assert.equal(rain.weather, 'rain');
  assert.ok(rain.rainStrength > 0.5);
  assert.ok(rain.windStrength > 0);

  const lateBreeze = sampleAmbience(870);
  assert.equal(lateBreeze.weather, 'breeze');
  assert.ok(lateBreeze.windStrength > 0.7);

  for (const elapsed of [0, 300, 520, 720, 930]) {
    const clear = sampleAmbience(elapsed);
    assert.equal(clear.weather, 'clear');
    assert.equal(clear.rainStrength, 0);
  }
});

test('invalid and negative elapsed values safely sample the start of a session', () => {
  const start = sampleAmbience(0);
  assert.deepEqual(sampleAmbience(-1), start);
  assert.deepEqual(sampleAmbience(Number.NaN), start);
  assert.deepEqual(sampleAmbience(Number.POSITIVE_INFINITY), start);
});

test('sampling never reads the machine wall clock', () => {
  const originalNow = Date.now;
  try {
    Date.now = () => { throw new Error('ambience must use active elapsed seconds'); };
    assert.equal(sampleAmbience(600).weather, 'rain');
    assert.equal(sampleAmbience(600).phase, 'evening');
  } finally {
    Date.now = originalNow;
  }
});
