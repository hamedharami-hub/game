import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, plantAt, harvest, growthDurationMs, decodeSave, movePlant } from './state.ts';
import { decodeLife, useFlower } from './life.ts';
import { createEditingHistory } from './editing-history.ts';
import { importSaveFile } from './save-files.ts';
import { controlKey } from './input.ts';

test('legacy saves gain empty life without losing flowers or appearance', () => {
  const planted = plantAt(initialState(), 'moonflower', 0, 0, 100, 'flower');
  const { life, ...legacy } = planted;
  const restored = decodeSave(JSON.stringify(legacy));
  assert.deepEqual(restored.plants, planted.plants);
  assert.equal(restored.gorHair, 'white'); assert.deepEqual(restored.life.flowers, {});
});
test('harvest, vase and gift form a persistent loop without changing essence', () => {
  let s = plantAt(initialState(), 'moonflower', 0, 0, 100, 'flower');
  const bloom = 100 + growthDurationMs(s.plants[0]);
  s = harvest(s, 'flower', bloom); assert.equal(s.life.flowers.moonflower, 1);
  assert.equal(s.essence, 0);
  assert.equal(harvest(s, 'flower', bloom), s);
  s = useFlower(s, 'moonflower', 'vase', { id: 'vase-1', species: 'moonflower', x: 2, z: 3 });
  assert.equal(s.life.flowers.moonflower, 0); assert.equal(s.life.vases.length, 1);
  assert.equal(useFlower(s, 'moonflower', 'gift'), s);
  s = harvest(s, 'flower', bloom * 2);
  s = useFlower(s, 'moonflower', 'gift'); assert.equal(s.life.lastGift, 'moonflower');
  assert.deepEqual(decodeSave(JSON.stringify(s)), s);
});
test('life decoder rejects hostile, duplicated and out-of-world vases', () => {
  const life = decodeLife({ flowers: { moonflower: Infinity, starlily: 500 }, vases: [
    { id: 'ok', species: 'moonflower', x: 0, z: 1 }, { id: 'ok', species: 'moonflower', x: 0, z: 1 },
    { id: '<script>', species: 'moonflower', x: 0, z: 0 }, { id: 'far', species: 'moonflower', x: 999, z: 0 },
  ] });
  assert.equal(life.vases.length, 1); assert.equal(life.flowers.starlily, 99); assert.equal(life.flowers.moonflower, undefined);
});
test('layout undo and redo preserve elapsed growth and wardrobe', () => {
  const history = createEditingHistory();
  let s = plantAt(initialState(), 'moonflower', 0, 0, 100, 'flower');
  history.record(s); s = movePlant(s, 'flower', 1, 0);
  s = { ...s, gorHair: 'brown', plants: s.plants.map(p => ({ ...p, boostMs: 500 })) };
  s = history.undo(s); assert.equal(s.plants[0].col, 0); assert.equal(s.plants[0].boostMs, 500); assert.equal(s.gorHair, 'brown');
  s = history.redo(s); assert.equal(s.plants[0].col, 1);
  history.clear(); assert.equal(history.canUndo, false);
});
test('save file import rejects malformed files instead of resetting a garden', () => {
  assert.throws(() => importSaveFile('{}')); assert.throws(() => importSaveFile('oops'));
  const s = plantAt(initialState(), 'moonflower', 0, 0, 100, 'flower');
  assert.deepEqual(importSaveFile(JSON.stringify(s)), s);
  assert.throws(() => importSaveFile(JSON.stringify({ ...s, plants: [{ ...s.plants[0], col: 999 }] })));
});
test('physical movement works independently of Persian keyboard layout', () => {
  assert.equal(controlKey({ code: 'KeyW', key: 'ص' }), 'w');
  assert.equal(controlKey({ code: 'KeyD', key: 'ی' }), 'd');
  assert.equal(controlKey({ code: 'ArrowUp', key: 'ArrowUp' }), 'ArrowUp');
});
