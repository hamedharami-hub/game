import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as T from 'three';
import { gardenTangentEuler } from './garden-transform.ts';
import { planetElevation } from './interactions.ts';

test('garden tangent alignment matches the terrain normal and preserves requested yaw', () => {
  for (const [x, z, yaw] of [[0, 0, 0], [-2, 14, 0], [70, -15, 0.73], [-62, 38, -1.8]] as const) {
    const transform = gardenTangentEuler(x, z, yaw);
    const euler = new T.Euler(transform.x, transform.y, transform.z, transform.order);
    const gardenUp = new T.Vector3(0, 1, 0).applyEuler(euler).normalize();
    const step = 0.01;
    const slopeX = (planetElevation(x + step, z) - planetElevation(x - step, z)) / (2 * step);
    const slopeZ = (planetElevation(x, z + step) - planetElevation(x, z - step)) / (2 * step);
    const surfaceNormal = new T.Vector3(-slopeX, 1, -slopeZ).normalize();
    assert.ok(gardenUp.distanceTo(surfaceNormal) < 1e-10, `normal mismatch at ${x},${z}`);

    const forward = new T.Vector3(0, 0, 1).applyEuler(euler);
    const horizontalHeading = Math.atan2(forward.x, forward.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(horizontalHeading - yaw), Math.cos(horizontalHeading - yaw))) < 1e-10);
    assert.equal(transform.y, yaw);
  }
});
