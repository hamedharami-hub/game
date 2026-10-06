import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from './world.ts';
import { initialState } from './state.ts';
import { resolveObstacleCollision } from './interactions.ts';

test('a saved wooden bridge removes the covered river circle from movement blockers', () => {
  const world = createWorld(new THREE.Scene());
  const initialWaterway = [...world.waterwayObstacles];

  assert.ok(initialWaterway.length > 0, 'the river should contribute waterway collision circles');
  const crossing = initialWaterway[0];
  const movementBlockersBefore = [...world.obstacles];
  assert.ok(movementBlockersBefore.includes(crossing), 'the uncovered river circle should block movement');

  world.sync({
    ...initialState(),
    landscapePlacements: [{
      id: 'test-bridge',
      kind: 'wooden-bridge',
      x: crossing.x,
      z: crossing.z,
      rotation: 0,
    }],
  });

  assert.ok(world.waterwayObstacles.includes(crossing), 'the river remains present beneath the bridge');
  assert.ok(!world.obstacles.includes(crossing), 'the bridge opens this circle for movement');
  assert.ok(world.obstacles.length < movementBlockersBefore.length, 'the bridge reduces movement blockers');
  assert.ok(
    world.landscapeRoot.children.some(child => child.userData.placementId === 'test-bridge'),
    'the saved bridge is present in the landscape',
  );
});

test('fixed bridge endpoints stay clear of overlapping river collision circles', () => {
  const world = createWorld(new THREE.Scene());
  world.sync(initialState());
  const stream = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-7, 0.035, -8), new THREE.Vector3(-4, 0.035, -5),
    new THREE.Vector3(2, 0.035, -2), new THREE.Vector3(3, 0.035, 2),
    new THREE.Vector3(-1, 0.035, 6), new THREE.Vector3(-4, 0.035, 9),
  ]);

  // These two sample centers land at the exposed ends of the seven-plank fixed bridge.
  for (const sampleIndex of [7, 10]) {
    const sample = stream.getPointAt(sampleIndex / 14);
    const result = resolveObstacleCollision(
      { x: -21 + sample.x, z: 19 + sample.z },
      0.38,
      world.waterwayObstacles,
    );
    assert.equal(result.collided, false, `fixed bridge endpoint sample ${sampleIndex} should be walkable`);
  }
});

test('a newly synced landscape object can be picked before another render tick', () => {
  const world = createWorld(new THREE.Scene());
  world.sync({
    ...initialState(),
    landscapePlacements: [{ id: 'fresh-tree', kind: 'tree', x: 3, z: 5, rotation: Math.PI / 12 }],
  });
  const ray = new THREE.Raycaster(
    new THREE.Vector3(3, 8, 5),
    new THREE.Vector3(0, -1, 0),
  );

  assert.equal(world.pickLandscape(ray), 'fresh-tree');
});

test('placement previews bake to at most two click-through meshes and release owned resources', () => {
  const scene = new THREE.Scene();
  const world = createWorld(scene);
  world.sync(initialState());

  const placement = { id: 'preview-clump', kind: 'flower-clump' as const, x: 3, z: 5, rotation: 0.2 };
  world.setLandscapePreview(placement, true);
  const preview = world.landscapeRoot.children.find(child => child.name === 'landscape-placement-preview') as THREE.Group;
  assert.ok(preview, 'placement preview should be attached');
  const meshes: THREE.Mesh[] = [];
  preview.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
  assert.equal(meshes.length, 1, 'a multi-flower preview should use one mesh');

  const mesh = meshes[0];
  const geometry = mesh.geometry;
  const material = mesh.material as THREE.MeshStandardMaterial;
  const validColor = material.color.getHexString();
  const validEmissive = material.emissive.getHexString();
  assert.deepEqual(new THREE.Raycaster().intersectObject(preview, true), [], 'the preview must not intercept world picking');
  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  material.addEventListener('dispose', () => { materialDisposed = true; });

  const invalidPlacement = { ...placement, x: 4, rotation: 0.8 };
  world.setLandscapePreview(invalidPlacement, false);
  assert.equal(preview.rotation.y, invalidPlacement.rotation, 'the merged preview should follow placement rotation');
  assert.equal(preview.children.length, 1, 'validity updates should reuse the baked preview');
  assert.notEqual(material.color.getHexString(), validColor, 'invalid previews should change the tint');
  assert.notEqual(material.emissive.getHexString(), validEmissive, 'invalid previews should change the emissive tint');
  assert.deepEqual(new THREE.Raycaster().intersectObject(preview, true), [], 'the retinted preview must remain click-through');

  world.setLandscapePreview(null);
  assert.ok(geometryDisposed, 'clearing a preview should dispose its owned baked geometry');
  assert.ok(materialDisposed, 'clearing a preview should dispose its owned material');

  world.setLandscapePreview({ id: 'main-garden', kind: 'garden-bed', x: -2, z: 14, rotation: 0 }, true);
  const gardenPreview = world.landscapeRoot.children.find(child => child.name === 'landscape-placement-preview') as THREE.Group;
  const gardenMeshes: THREE.Mesh[] = [];
  gardenPreview.traverse(object => { if ((object as THREE.Mesh).isMesh) gardenMeshes.push(object as THREE.Mesh); });
  assert.equal(gardenMeshes.length, 2, 'the garden footprint and rim should stay within two preview meshes');
  gardenPreview.updateWorldMatrix(true, true);
  const rimWorldPoint = gardenPreview.localToWorld(new THREE.Vector3(8.25, 0.07, 0));
  const rimRay = new THREE.Raycaster(
    new THREE.Vector3(rimWorldPoint.x, rimWorldPoint.y + 3, rimWorldPoint.z),
    new THREE.Vector3(0, -1, 0),
  );
  assert.deepEqual(rimRay.intersectObject(gardenPreview, true), [], 'the garden rim must remain click-through at its world-space surface');
});
