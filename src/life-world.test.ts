import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLifeWorld } from './life-world.ts';
import { initialState } from './state.ts';

test('64 flower vases batch into three draws and unchanged saves do not rebuild', () => {
  const scene = new T.Scene(); const world = createLifeWorld(scene); const s = initialState();
  s.life.vases = Array.from({ length: 64 }, (_, i) => ({ id: `vase-${i}`, species: 'moonflower', x: i % 8, z: Math.floor(i / 8) }));
  world.sync(s);
  const root = scene.children[0]; assert.equal(root.children.length, 3);
  const first = root.children[0]; world.sync(s); assert.equal(root.children[0], first);
  assert.equal((root.children[2] as T.InstancedMesh).count, 320);
  s.life.vases = []; world.sync(s); assert.equal(root.children.length, 0);
});
