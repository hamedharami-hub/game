import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import { createWorld, districts } from './world.ts';
import { planWalkableRoute, type NavigationObstacle, type NavigationPoint } from './navigation.ts';

function segmentDistanceSquared(point: NavigationPoint, start: NavigationPoint, end: NavigationPoint): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const amount = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0;
  const nearX = start.x + dx * amount - point.x;
  const nearZ = start.z + dz * amount - point.z;
  return nearX * nearX + nearZ * nearZ;
}

test('routes around a blocking grove of colliders with clear walking legs', () => {
  const obstacles = [{ x: 0, z: 0, radius: 2 }];
  const route = planWalkableRoute(
    { x: -8, z: 0 },
    { x: 8, z: 0 },
    { x: 0, z: 0, r: 18 },
    obstacles,
    { approachRadius: 0.5 },
  );

  assert.ok(route && route.length >= 2, 'the route should turn around the obstruction');
  let from: NavigationPoint = { x: -8, z: 0 };
  for (const point of route) {
    assert.ok(segmentDistanceSquared({ x: 0, z: 0 }, from, point) >= (2 + 0.62) ** 2 - 1e-6);
    from = point;
  }
  assert.ok(Math.hypot(from.x - 8, from.z) <= 0.5);
});

test('chooses a safe approach when a landmark center is obstructed', () => {
  const destination = { x: 0, z: 0 };
  const obstacle = { x: 0, z: 0, radius: 2 };
  const route = planWalkableRoute(
    { x: -9, z: 0 }, destination, { x: 0, z: 0, r: 18 }, [obstacle], { approachRadius: 5 },
  );

  assert.ok(route?.length);
  const arrival = route!.at(-1)!;
  assert.ok(Math.hypot(arrival.x, arrival.z) <= 5);
  assert.ok(Math.hypot(arrival.x, arrival.z) >= obstacle.radius + 0.62);
});

test('can route away from an obstacle when the player is inside the planner margin but physically clear', () => {
  const route = planWalkableRoute(
    { x: -2.4, z: 0 },
    { x: -10, z: 0 },
    { x: 0, z: 0, r: 18 },
    [{ x: 0, z: 0, radius: 2 }],
  );
  assert.ok(route?.length, 'a player standing 0.4m outside the trunk can step away safely');
  assert.ok(route![0].x < -2.4);
});

test('returns null when the destination has no reachable safe approach inside the world', () => {
  const route = planWalkableRoute(
    { x: 0, z: 0 },
    { x: 25, z: 0 },
    { x: 0, z: 0, r: 10 },
    [],
    { approachRadius: 1 },
  );
  assert.equal(route, null);
  assert.equal(planWalkableRoute({ x: Number.NaN, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0, r: 10 }, []), null);
});

test('all six existing landmarks have safe approaches reachable from the starting garden', () => {
  const world = createWorld(new THREE.Scene());
  const start = { x: -3.5, z: 15.4 };
  const clearance = 0.62;

  for (const [id, landmark] of Object.entries(districts)) {
    const route = planWalkableRoute(start, landmark, world.bounds(), world.obstacles);
    assert.ok(route, `${id} should be reachable`);
    let from: NavigationPoint = start;
    for (const point of route!) {
      const distanceToWorldCenter = Math.hypot(point.x - world.bounds().x, point.z - world.bounds().z);
      assert.ok(distanceToWorldCenter <= world.bounds().r - clearance + 1e-6, `${id} route stays in the meadow`);
      for (const obstacle of world.obstacles as readonly NavigationObstacle[]) {
        const minimum = obstacle.radius + clearance;
        assert.ok(
          segmentDistanceSquared(obstacle, from, point) >= minimum * minimum - 1e-5,
          `${id} walking leg avoids obstacle at (${obstacle.x}, ${obstacle.z})`,
        );
      }
      from = point;
    }
    assert.ok(Math.hypot(from.x - landmark.x, from.z - landmark.z) <= 7.5 + 1e-6, `${id} ends near its marker`);
  }
});
