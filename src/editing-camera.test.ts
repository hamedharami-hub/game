import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panEditingCamera } from './editing-camera.ts';

test('editing camera pans without mutating its input and stays on the land', () => {
  const start = { x: -2, z: 14 };
  assert.deepEqual(panEditingCamera(start, 4, -4, 82), { x: 2, z: 10 });
  assert.deepEqual(start, { x: -2, z: 14 });
  const edge = panEditingCamera(start, 1000, 1000, 82);
  assert.ok(Math.abs(Math.hypot(edge.x, edge.z) - 82) < 1e-9);
});
test('editing camera rejects non-finite deltas and invalid land bounds', () => {
  const start = { x: 0, z: 0 };
  assert.equal(panEditingCamera(start, NaN, 1, 82), start);
  assert.equal(panEditingCamera(start, 1, Infinity, 82), start);
  assert.equal(panEditingCamera(start, 1, 1, -1), start);
});
