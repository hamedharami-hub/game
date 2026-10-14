import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoRenderPolicy } from './photo-render-policy.ts';

test('static photo renders first and changed frames, while live views always render', () => {
  const shouldRender = createPhotoRenderPolicy();
  assert.equal(shouldRender(true, 'frame-a'), true);
  assert.equal(shouldRender(true, 'frame-a'), false);
  assert.equal(shouldRender(true, 'frame-b'), true);
  assert.equal(shouldRender(false, 'frame-b'), true);
  assert.equal(shouldRender(false, 'frame-b'), true);
  assert.equal(shouldRender(true, 'frame-b'), true);
});
