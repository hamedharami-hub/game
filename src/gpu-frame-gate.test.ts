import test from 'node:test';
import assert from 'node:assert/strict';
import { createGpuFrameGate } from './gpu-frame-gate.ts';

function fixture() {
  let status = 0x911b, lost = false, deleted = 0, flushed = 0;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117 as const, ALREADY_SIGNALED: 0x911a as const,
    CONDITION_SATISFIED: 0x911c as const, WAIT_FAILED: 0x911d as const,
    isContextLost: () => lost,
    fenceSync: () => ({} as WebGLSync),
    clientWaitSync: (_sync: WebGLSync, flags: number, timeout: number) => {
      assert.equal(flags, 0); assert.equal(timeout, 0); return status;
    },
    deleteSync: () => { deleted++; }, flush: () => { flushed++; },
  };
  return { gate: createGpuFrameGate(gl), status: (value: number) => { status = value; },
    lost: (value: boolean) => { lost = value; }, counts: () => ({ deleted, flushed }) };
}

test('GPU gate does not queue another frame while a zero-timeout fence is pending', () => {
  const f = fixture();
  assert.equal(f.gate.ready(), true);
  f.gate.rendered();
  assert.equal(f.gate.ready(), false);
  assert.equal(f.gate.ready(), false);
  assert.deepEqual(f.counts(), { deleted: 0, flushed: 1 });
  f.status(0x911c);
  assert.equal(f.gate.ready(), true);
  assert.deepEqual(f.counts(), { deleted: 1, flushed: 1 });
});

test('GPU gate releases replaced capture fences and disposes without leaking', () => {
  const f = fixture();
  f.gate.rendered(); f.gate.rendered(); f.gate.dispose(); f.gate.dispose();
  assert.deepEqual(f.counts(), { deleted: 2, flushed: 2 });
  assert.equal(f.gate.ready(), true);
});

test('GPU gate handles failed waits and context loss/restoration', () => {
  const f = fixture();
  f.gate.rendered(); f.status(0x911d);
  assert.equal(f.gate.ready(), true);
  f.gate.rendered(); f.lost(true);
  assert.equal(f.gate.ready(), false);
  f.gate.rendered();
  assert.deepEqual(f.counts(), { deleted: 2, flushed: 2 });
  f.lost(false);
  assert.equal(f.gate.ready(), true);
});
