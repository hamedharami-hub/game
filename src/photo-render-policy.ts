/** In reduced motion, reuse an unchanged photo frame rather than redraw it. */
export function createPhotoRenderPolicy() {
  let previous: string | null = null;
  return (staticPhoto: boolean, signature: string): boolean => {
    if (!staticPhoto) { previous = null; return true; }
    if (signature === previous) return false;
    previous = signature;
    return true;
  };
}
