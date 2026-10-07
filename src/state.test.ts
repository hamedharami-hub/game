import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  SAVE_KEY, initialState, decodeSave, storageKey, species, cellUnlocked,
  plantAt, movePlant, growthStage, growthDurationMs, growRemaining, waterPlant, harvest,
  expandPlot, expansionRequirement, gatherLight, buildProject, upgradeHouse,
  discoverHybrid, awakenAura, visitDistrict, projects, furnishings,
  expandRegion, regionRadius, regionSlots, placeDecoration, moveDecoration,
  removeDecoration, decorationPosition, setAppearance, hairColors, outfits,
  LANDSCAPE_RADIUS, landscapeKinds, isLandscapePositionValid,
  landscapeFootprintRadii, LANDSCAPE_PLACEMENT_CLEARANCE,
  placeLandscapePlacement, moveLandscapePlacement, removeLandscapePlacement,
} from './state.ts';

test('a new save opens one complete planting garden', () => {
  const state = initialState();
  assert.equal(state.plotLevel, 5);
  assert.equal(cellUnlocked(state.plotLevel, -2, -2), true);
  assert.equal(cellUnlocked(state.plotLevel, 9, 9), true);
  assert.equal(expansionRequirement(1), 0);
  assert.equal(expandPlot(state), state);
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);
});

test('flowers bloom quickly, keep growing offline, and can be tended repeatedly', () => {
  let state = plantAt(initialState(), 'moonflower', 2, 2, 1_000, 'moon-1');
  assert.equal(state.plants.length, 1);
  assert.equal(growthStage(state.plants[0], 1_000), 0);
  const moonDuration = growthDurationMs(state.plants[0]);
  const otherBloom = plantAt(initialState(), 'moonflower', 3, 2, 1_000, 'moon-2');
  assert.notEqual(growthDurationMs(otherBloom.plants[0]), moonDuration);
  assert.equal(growthStage(state.plants[0], 1_000 + Math.ceil(moonDuration / 3)), 1);
  assert.equal(growthStage(state.plants[0], 1_000 + Math.ceil(moonDuration * 2 / 3)), 2);
  assert.equal(growthStage(state.plants[0], 1_000 + Math.ceil(moonDuration)), 3);
  assert.ok(growRemaining(state.plants[0], 31_000) > 0);

  state = plantAt(state, 'sunblossom', 3, 2, 1_000, 'sun-1');
  assert.equal(growthStage(state.plants[1], 1_000 + Math.ceil(growthDurationMs(state.plants[1]) / 3)), 1);
  state = waterPlant(state, 'sun-1', 2_000);
  state = waterPlant(state, 'sun-1', 2_001);
  state = waterPlant(state, 'sun-1', 2_002);
  assert.equal(growthStage(state.plants[1], 2_002), 3);
  assert.equal(state.plants[1].lastWaterAt, 2_002);
  assert.equal(waterPlant(state, 'sun-1', 2_003), state);
});

test('planting and relocation stay free, bounded, and preserve plant age', () => {
  let state = plantAt(initialState(), 'moonflower', 2, 2, 5_000, 'p1');
  assert.equal(plantAt(state, 'sunblossom', 2, 2, 5_000, 'p2'), state);
  assert.equal(plantAt(state, 'sunblossom', 99, 99, 5_000, 'p2'), state);
  assert.equal(plantAt(state, 'moonflower', 3, 2, -1, 'p2'), state);
  state = movePlant(state, 'p1', 3, 2);
  assert.equal(state.plants[0].plantedAt, 5_000);
  assert.deepEqual([state.plants[0].col, state.plants[0].row], [3, 2]);
  assert.equal(movePlant(state, 'p1', 3, 2), state);
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);
});

test('planting accepts only species and ids that survive v1 save decoding', () => {
  const state = initialState();
  for (const id of ['', 'bad id', 'x'.repeat(65)]) {
    assert.equal(plantAt(state, 'moonflower', 2, 2, 1_000, id), state);
  }
  assert.equal(plantAt(state, 'toString' as keyof typeof species, 2, 2, 1_000, 'valid-id'), state);

  const planted = plantAt(state, 'moonflower', 2, 2, 1_000, 'plant-1');
  assert.deepEqual(decodeSave(JSON.stringify(planted)), planted);
});

test('harvesting keeps saved essence and starts another short growth cycle', () => {
  let state = plantAt({ ...initialState(), essence: 7 }, 'moonflower', 2, 2, 1_000, 'p1');
  const firstBloomAt = 1_000 + Math.ceil(growthDurationMs(state.plants[0]));
  assert.equal(harvest(state, 'p1', firstBloomAt - 1), state);
  state = harvest(state, 'p1', firstBloomAt);
  assert.equal(state.essence, 7);
  assert.equal(state.plants.length, 1);
  assert.equal(state.plants[0].plantedAt, firstBloomAt);
  assert.equal(state.plants[0].lastHarvestAt, firstBloomAt);
  assert.equal(growthStage(state.plants[0], firstBloomAt), 0);
  const secondBloomAt = firstBloomAt + Math.ceil(growthDurationMs(state.plants[0]));
  assert.equal(harvest(state, 'p1', secondBloomAt).essence, 7);
  assert.equal(harvest(state, 'p1', secondBloomAt).plants[0].plantedAt, secondBloomAt);
});

test('building and decorating never require stored light', () => {
  let state = initialState();
  for (const id of Object.keys(projects) as (keyof typeof projects)[]) state = buildProject(state, id);
  assert.equal(state.projects.length, Object.keys(projects).length);
  assert.equal(state.essence, 0);
  assert.equal(buildProject(state, 'lamps'), state);
  for (let i = 0; i < 3; i++) state = upgradeHouse(state);
  assert.equal(state.houseLevel, 3);
  assert.equal(upgradeHouse(state), state);
  state = placeDecoration(state, 'garden', 0, 'arbor');
  assert.equal(state.decorations.length, 1);
  assert.equal(state.decorations[0].kind, 'arbor');
  assert.equal(furnishings.arbor.cost, 0);
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);
});

test('all garden discoveries and lighting can be enjoyed without gates or timers', () => {
  let state = initialState();
  state = plantAt(state, 'starlily', 2, 2, 0, 'star');
  assert.equal(state.plants.length, 1);
  assert.equal(discoverHybrid(initialState()).hybrids, true);
  state = gatherLight(state, 0);
  state = gatherLight(state, 1);
  assert.equal(state.essence, 6);
  state = awakenAura(state);
  state = awakenAura(state);
  state = awakenAura(state);
  assert.equal(state.aura, 3);
  assert.equal(awakenAura(state), state);
  state = visitDistrict(state, 'grove');
  assert.deepEqual(state.visited, ['garden', 'grove']);
});

test('landscaping expands freely while preserving placed objects and layout', () => {
  let state = initialState();
  state = placeDecoration(state, 'home', 0, 'pool');
  for (let i = 0; i < 20; i++) state = expandRegion(state, 'home');
  assert.equal(state.regionLevels.home, 20);
  assert.equal(state.regionLevels.garden, 0);
  assert.equal(state.decorations[0].slot, 0);
  assert.equal(expandRegion(state, 'home'), state);
  assert.equal(regionSlots(20), 88);
  assert.ok(regionRadius('garden', 20) > 100);
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);

  state = placeDecoration(state, 'home', 1, 'crystal');
  assert.equal(state.decorations.length, 2);
  state = moveDecoration(state, 'home', 0, 2);
  assert.equal(state.decorations.find(d => d.kind === 'pool')?.slot, 2);
  state = removeDecoration(state, 'home', 2);
  assert.equal(state.decorations.some(d => d.kind === 'pool'), false);
  assert.notDeepEqual(decorationPosition('village', 0, 123), decorationPosition('village', 0, 456));
});

test('older saves retain plants, progress, personal style, and account isolation', () => {
  const old = decodeSave(JSON.stringify({
    version: 1,
    collected: ['seed'],
    plotLevel: 1,
    plants: [{ id: 'old', species: 'moonflower', col: 2, row: 2, plantedAt: 0, boostMs: 0, lastWaterAt: 0 }],
    essence: 4,
    gorHair: 'brown',
    projects: ['lamps'],
    visited: ['grove'],
  }));
  assert.equal(old.plotLevel, 5);
  assert.equal(old.plants.length, 1);
  assert.equal(old.plants[0].lastHarvestAt, null);
  assert.equal(old.gorHair, 'brown');
  assert.equal(old.essence, 4);
  assert.deepEqual(old.projects, ['lamps']);
  assert.deepEqual(old.visited, ['garden', 'grove']);
  assert.deepEqual(old.landscapePlacements, []);
  assert.notEqual(storageKey('a'), storageKey('b'));
  assert.equal(storageKey(null), SAVE_KEY);
});

test('freeform landscape props persist by stable id across the full usable land', () => {
  let state = initialState();
  assert.equal(LANDSCAPE_RADIUS, 82);
  assert.equal(landscapeKinds.includes('spirit-tree'), true);
  assert.equal(isLandscapePositionValid(70, 30), true);
  assert.equal(isLandscapePositionValid(82, 0), true);
  assert.equal(isLandscapePositionValid(82.01, 0), false);
  assert.equal(isLandscapePositionValid(Number.NaN, 0), false);
  assert.equal(isLandscapePositionValid(0, Number.POSITIVE_INFINITY), false);

  state = placeLandscapePlacement(state, {
    id: 'spirit-oak-1', kind: 'spirit-tree', x: 70, z: 30, rotation: -Math.PI / 2,
  });
  state = placeLandscapePlacement(state, {
    id: 'bed-1', kind: 'garden-bed', x: -47, z: 55.5, rotation: 9 * Math.PI,
  });
  assert.equal(state.landscapePlacements.length, 2);
  assert.equal(state.landscapePlacements[0].id, 'spirit-oak-1');
  assert.equal(state.landscapePlacements[0].rotation, Math.PI * 1.5);
  assert.equal(state.landscapePlacements[1].rotation, Math.PI);

  const beforeInvalid = state;
  assert.equal(placeLandscapePlacement(state, {
    id: 'outside', kind: 'tree', x: LANDSCAPE_RADIUS + 1, z: 0, rotation: 0,
  }), beforeInvalid);
  assert.equal(placeLandscapePlacement(state, {
    id: 'spirit-oak-1', kind: 'tree', x: 1, z: 1, rotation: 0,
  }), beforeInvalid);
  assert.equal(placeLandscapePlacement(state, {
    id: 'bad id', kind: 'tree', x: 1, z: 1, rotation: 0,
  }), beforeInvalid);
  assert.equal(placeLandscapePlacement(state, {
    id: 'bad-rotation', kind: 'tree', x: 1, z: 1, rotation: Number.NaN,
  }), beforeInvalid);

  state = moveLandscapePlacement(state, 'spirit-oak-1', -78, 0, Math.PI * 4 + 0.25);
  assert.deepEqual(state.landscapePlacements[0], {
    id: 'spirit-oak-1', kind: 'spirit-tree', x: -78, z: 0, rotation: 0.25,
  });
  assert.equal(moveLandscapePlacement(state, 'spirit-oak-1', 83, 0), state);
  assert.equal(moveLandscapePlacement(state, 'missing', 0, 0), state);
  assert.deepEqual(decodeSave(JSON.stringify(state)), state);

  state = removeLandscapePlacement(state, 'bed-1');
  assert.deepEqual(state.landscapePlacements.map(p => p.id), ['spirit-oak-1']);
  assert.equal(removeLandscapePlacement(state, 'missing'), state);
});

test('landscape edge clearance follows kind footprint for placement, moving, and decoding', () => {
  assert.equal(landscapeFootprintRadii.flower < landscapeFootprintRadii.tree, true);
  assert.equal(landscapeFootprintRadii.cottage > landscapeFootprintRadii.tree, true);
  assert.equal(isLandscapePositionValid(81.5, 0, 'flower'), true);
  assert.equal(isLandscapePositionValid(81.5, 0, 'tree'), false);
  assert.equal(isLandscapePositionValid(78, 0, 'cottage'), false);

  let state = placeLandscapePlacement(initialState(), {
    id: 'edge-flower', kind: 'flower', x: 81.5, z: 0, rotation: 0,
  });
  assert.equal(state.landscapePlacements.length, 1);
  assert.equal(placeLandscapePlacement(state, {
    id: 'edge-tree', kind: 'tree', x: 81.5, z: 0, rotation: 0,
  }), state);
  assert.equal(placeLandscapePlacement(state, {
    id: 'edge-cottage', kind: 'cottage', x: 78, z: 0, rotation: 0,
  }), state);

  state = removeLandscapePlacement(state, 'edge-flower');
  state = placeLandscapePlacement(state, {
    id: 'move-tree', kind: 'tree', x: 0, z: 0, rotation: 0,
  });
  assert.equal(moveLandscapePlacement(state, 'move-tree', 80, 0), state);
  assert.equal(moveLandscapePlacement(state, 'move-tree', 79, 0).landscapePlacements[0].x, 79);

  const restored = decodeSave(JSON.stringify({
    ...initialState(),
    landscapePlacements: [
      { id: 'valid-flower', kind: 'flower', x: 81.5, z: 0, rotation: 0 },
      { id: 'overhang-tree', kind: 'tree', x: 80, z: 0, rotation: 0 },
      { id: 'overhang-house', kind: 'cottage', x: 78, z: 0, rotation: 0 },
    ],
  }));
  assert.deepEqual(restored.landscapePlacements.map(p => p.id), ['valid-flower']);
});

test('landscape placement and relocation enforce pairwise footprints including the live garden', () => {
  assert.equal(LANDSCAPE_PLACEMENT_CLEARANCE, 0.12);
  const tree = { id: 'tree-a', kind: 'tree' as const, x: 0, z: 0, rotation: 0 };
  let state = placeLandscapePlacement(initialState(), tree);
  assert.equal(placeLandscapePlacement(state, {
    id: 'cottage-too-close', kind: 'cottage', x: 8, z: 0, rotation: 0,
  }), state);
  state = placeLandscapePlacement(state, {
    id: 'cottage-clear', kind: 'cottage', x: 8.25, z: 0, rotation: 0,
  });
  assert.equal(state.landscapePlacements.length, 2);

  let garden = placeLandscapePlacement(initialState(), {
    id: 'main-garden', kind: 'garden-bed', x: 0, z: 0, rotation: 0,
  });
  assert.equal(placeLandscapePlacement(garden, {
    id: 'tree-inside-garden', kind: 'tree', x: 10, z: 0, rotation: 0,
  }), garden);
  garden = placeLandscapePlacement(garden, {
    id: 'tree-clear-of-garden', kind: 'tree', x: 11.25, z: 0, rotation: 0,
  });
  assert.equal(garden.landscapePlacements.length, 2);

  const withTree = placeLandscapePlacement(initialState(), tree);
  const withCottage = placeLandscapePlacement(withTree, {
    id: 'moving-cottage', kind: 'cottage', x: 30, z: 0, rotation: 0,
  });
  assert.equal(moveLandscapePlacement(withCottage, 'moving-cottage', 8, 0), withCottage);
  assert.equal(moveLandscapePlacement(withCottage, 'moving-cottage', 9, 0).landscapePlacements[1].x, 9);
});

test('v1 decoding keeps the first valid non-overlapping placement and discards later conflicts', () => {
  const restored = decodeSave(JSON.stringify({
    ...initialState(),
    landscapePlacements: [
      { id: 'bed', kind: 'garden-bed', x: 0, z: 0, rotation: 0 },
      { id: 'tree-overlaps-bed', kind: 'tree', x: 10, z: 0, rotation: 0 },
      { id: 'flower-overlaps-bed', kind: 'flower', x: 5, z: 0, rotation: 0 },
      { id: 'tree-clear', kind: 'tree', x: 12, z: 0, rotation: 0 },
      { id: 'bad', kind: 'tree', x: Number.NaN, z: 0, rotation: 0 },
    ],
  }));
  assert.deepEqual(restored.landscapePlacements.map(p => p.id), ['bed', 'tree-clear']);
});

test('v1 landscape placement decoding drops malformed entries without disturbing old save data', () => {
  const old = initialState();
  const restored = decodeSave(JSON.stringify({
    ...old,
    plants: [{ id: 'kept', species: 'moonflower', col: 2, row: 2, plantedAt: 0, boostMs: 0, lastWaterAt: 0 }],
    essence: 19,
    gorHair: 'brown',
    landscapePlacements: [
      { id: 'tree-1', kind: 'tree', x: 77, z: 0, rotation: Math.PI / 4 },
      { id: 'tree-1', kind: 'cabin', x: 0, z: 0, rotation: 0 },
      { id: 'too-far', kind: 'tree', x: 82.001, z: 0, rotation: 0 },
      { id: 'bad-kind', kind: 'moon', x: 0, z: 0, rotation: 0 },
      { id: 'bad-coord', kind: 'flower-clump', x: '1', z: 0, rotation: 0 },
      { id: 'bad-angle', kind: 'well', x: 0, z: 0, rotation: null },
      { id: 'bad id', kind: 'tree', x: 0, z: 0, rotation: 0 },
    ],
  }));
  assert.deepEqual(restored.landscapePlacements, [
    { id: 'tree-1', kind: 'tree', x: 77, z: 0, rotation: Math.PI / 4 },
  ]);
  assert.equal(restored.plants[0].id, 'kept');
  assert.equal(restored.essence, 19);
  assert.equal(restored.gorHair, 'brown');
});

test('a legacy v1 garden keeps offline growth and never loses saved belongings', () => {
  const beforeBreak = decodeSave(JSON.stringify({
    version: 1,
    collected: ['seed'],
    plotLevel: 1,
    plants: [{ id: 'offline-bloom', species: 'moonflower', col: 2, row: 2, plantedAt: 1_000, boostMs: 0, lastWaterAt: 0 }],
    essence: 23,
    projects: ['lamps'],
    decorations: [{ district: 'garden', slot: 0, kind: 'pool' }],
    gorHair: 'brown',
    visited: ['grove'],
  }));

  const returnedAt = 24 * 60 * 60 * 1_000;
  assert.equal(beforeBreak.plants.length, 1);
  assert.equal(growthStage(beforeBreak.plants[0], returnedAt), 3);
  assert.equal(growRemaining(beforeBreak.plants[0], returnedAt), 0);
  assert.equal(beforeBreak.essence, 23);
  assert.deepEqual(beforeBreak.projects, ['lamps']);
  assert.deepEqual(beforeBreak.decorations, [{ district: 'garden', slot: 0, kind: 'pool' }]);

  const tended = harvest(beforeBreak, 'offline-bloom', returnedAt);
  assert.equal(tended.plants.length, 1);
  assert.equal(growthStage(tended.plants[0], returnedAt), 0);
  assert.ok(tended.essence >= beforeBreak.essence);
  assert.deepEqual(tended.projects, beforeBreak.projects);
  assert.deepEqual(tended.decorations, beforeBreak.decorations);
  assert.deepEqual(decodeSave(JSON.stringify(tended)), tended);
});

test('corrupt saves stay safe and appearance choices persist per character', () => {
  for (const raw of ['bad', '{"version":9}', '{"version":1,"collected":["unknown"]}']) {
    assert.deepEqual(decodeSave(raw), initialState());
  }
  const malformed = decodeSave(JSON.stringify({
    ...initialState(),
    essence: -4,
    houseLevel: 99,
    aura: Infinity,
    projects: ['lamps', 'unknown', 'lamps'],
    visited: ['unknown', 'grove', 'grove'],
    plants: [
      { id: 'same', species: 'moonflower', col: 2, row: 2, plantedAt: 0, boostMs: 0, lastWaterAt: 0 },
      { id: 'same', species: 'sunblossom', col: 3, row: 2, plantedAt: 0, boostMs: 0, lastWaterAt: 0 },
    ],
  }));
  assert.equal(malformed.essence, 0);
  assert.equal(malformed.houseLevel, 3);
  assert.equal(malformed.aura, 0);
  assert.deepEqual(malformed.projects, ['lamps']);
  assert.deepEqual(malformed.visited, ['garden', 'grove']);
  assert.equal(malformed.plants.length, 1);

  let state = initialState();
  for (const hair of hairColors) for (const outfit of outfits) {
    state = setAppearance(state, 'angel', hair, outfit);
    assert.equal(state.gorHair, 'white');
    assert.equal(state.gorOutfit, 'classic');
    assert.deepEqual(decodeSave(JSON.stringify(state)), state);
  }
  state = setAppearance(state, 'gor', 'black', 'traveler');
  assert.equal(state.angelOutfit, 'celestial');
});
