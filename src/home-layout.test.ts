import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeObstacles, insideHome } from './home-layout.ts';
import { decodeLife } from './life.ts';
import { decodeSave, initialState } from './state.ts';
import { planWalkableRoute } from './navigation.ts';

test('home has a clear continuous doorway and collision-protected walls', () => {
  const walls = homeObstacles();
  for (let z = -6; z >= -11.3; z -= .1) assert.ok(walls.every(w => Math.hypot(w.x + 22, w.z - z) >= w.radius + .38));
  assert.ok(walls.some(w => Math.hypot(w.x + 24.7, w.z + 10) < .3));
  assert.equal(insideHome(-22, -10), true);
  assert.equal(insideHome(-22, -7), false);
  assert.equal(insideHome(NaN, -10), false);
  const route = planWalkableRoute({ x: -22, z: -6 }, { x: -22, z: -10 }, { x: 0, z: 0, r: 82 }, walls, { cellSize: .5, approachRadius: .2 });
  assert.ok(route?.length, 'entry action must route through the door rather than teleport');
  assert.ok(insideHome(route.at(-1)!.x, route.at(-1)!.z));
});
test('home arrangements default safely in legacy saves and persist without changing plants', () => {
  assert.equal(decodeLife({ homeArrangement: '<script>' }).homeArrangement, 'tea');
  const state = initialState(); state.life.homeArrangement = 'reading';
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);
  assert.equal(decodeLife({}).homeArrangement, 'tea');
});
