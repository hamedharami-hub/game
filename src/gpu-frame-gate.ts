type FenceContext = Pick<WebGL2RenderingContext, 'fenceSync' | 'clientWaitSync' | 'deleteSync' | 'flush' | 'isContextLost'
  | 'SYNC_GPU_COMMANDS_COMPLETE' | 'ALREADY_SIGNALED' | 'CONDITION_SATISFIED' | 'WAIT_FAILED'>;

/** At most one unfinished scene frame. Poll only: never wait on the main thread. */
export function createGpuFrameGate(gl: FenceContext) {
  let pending: WebGLSync | null = null;
  const clear = () => { if (pending) gl.deleteSync(pending); pending = null; };
  return {
    ready() {
      if (gl.isContextLost()) { clear(); return false; }
      if (!pending) return true;
      const status = gl.clientWaitSync(pending, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.WAIT_FAILED) {
        clear();
        return true;
      }
      return false;
    },
    rendered() {
      // Explicit photo capture can render outside the animation gate. Its newer
      // fence must cover all preceding commands, rather than retain an old one.
      clear();
      if (gl.isContextLost()) return;
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    },
    dispose: clear,
  };
}
