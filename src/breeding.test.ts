import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breedAt, breedingResult } from './breeding.ts';
import { decodeSave, harvest, initialState, movePlant, plantAt, type State } from './state.ts';
import { createEditingHistory } from './editing-history.ts';
import { useFlower } from './life.ts';

function parents(): State {
  return plantAt(plantAt(initialState(), 'moonflower', 0, 0, 0, 'mother'), 'sunblossom', 1, 0, 0, 'father');
}
test('breeding needs two ripe compatible living neighbors and valid time', () => {
  const s = parents();
  assert.equal(breedingResult(s, 'mother', 300000), 'dawnflower');
  assert.equal(breedingResult(s, 'father', 300000), 'dawnflower');
  assert.equal(breedingResult(s, 'mother', 1), null);
  assert.equal(breedingResult(s, 'missing', 300000), null);
  assert.equal(breedingResult(s, 'mother', NaN), null);
  assert.equal(breedingResult(movePlant(s, 'father', 4, 4), 'mother', 300000), null);
  assert.equal(breedingResult({ ...s, plants: [s.plants[0], { ...s.plants[1], species: 'moonflower' }] }, 'mother', 300000), null);
  assert.equal(breedingResult(harvest(s, 'father', 300000), 'mother', 300000), null);
});
test('child starts growing in empty soil, parents and inventory are unchanged', () => {
  const s = parents(), child = breedAt(s, 'mother', 0, 1, 300000, 'child');
  assert.equal(child.plants.at(-1)!.species, 'dawnflower');
  assert.equal(child.plants.at(-1)!.plantedAt, 300000);
  assert.deepEqual(child.plants.slice(0, 2), s.plants);
  assert.deepEqual(child.life, s.life);
  assert.equal(child.hybrids, true);
  assert.deepEqual(decodeSave(JSON.stringify(child)), child);
  assert.equal(breedAt(s, 'mother', 0, 0, 300000, 'child'), s);
  assert.equal(breedAt(s, 'mother', 99, 0, 300000, 'child'), s);
  assert.equal(breedAt(s, 'mother', 0, 1, 300000, 'mother'), s);
  const picked = harvest(child, 'child', 600000);
  assert.equal(picked.life.flowers.dawnflower, 1);
  assert.equal(useFlower(picked, 'dawnflower', 'gift').life.lastGift, 'dawnflower');
});
test('second cross and layout undo/redo preserve the same child growth', () => {
  const s = plantAt(plantAt(initialState(), 'spiritfern', 0, 0, 0, 'fern'), 'starlily', 1, 1, 0, 'lily');
  const next = breedAt(s, 'fern', 0, 1, 300000, 'mist');
  assert.equal(next.plants.at(-1)!.species, 'mistlily');
  const history = createEditingHistory(); history.record(s);
  const undone = history.undo(next);
  assert.equal(undone.plants.length, 2);
  assert.deepEqual(history.redo(undone).plants, next.plants);
});
