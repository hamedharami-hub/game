import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residentGreeting, residentRoutine } from './resident-routine.ts';

test('resident routines walk between stops then pause, without jumps at boundaries', () => {
  for (const seconds of [0, 12, 60, 120, 180]) {
    const before = residentRoutine(0, Math.max(0, seconds - .001));
    const after = residentRoutine(0, seconds);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < .001);
  }
  assert.equal(residentRoutine(0, 1).moving, true);
  assert.equal(residentRoutine(0, 20).moving, false);
  assert.equal(residentRoutine(0, 20).activity, 'flowers');
  assert.equal(residentRoutine(0, 80).activity, 'social');
  assert.equal(residentRoutine(0, 140).activity, 'rest');
  assert.deepEqual(residentRoutine(0, 20), residentRoutine(0, 200));
  assert.notDeepEqual(residentRoutine(0, 20), residentRoutine(3, 20));
  assert.deepEqual(residentRoutine(NaN, Infinity), residentRoutine(0, 0));
});
test('resident dialogue responds to activity, vases and actual hybrid plants', () => {
  assert.match(residentGreeting('flowers', false, false), /پیوند/);
  assert.match(residentGreeting('rest', false, false), /مکث/);
  assert.match(residentGreeting('social', true, false), /گلدان/);
  assert.match(residentGreeting('social', false, true), /پیوندی/);
});
