/** Leave CPU time for input/layout when a software renderer becomes expensive. */
export function createRenderBudget() {
  let readyAt = 0;
  return {
    ready(now: number) { return now >= readyAt; },
    rendered(start: number, end: number) {
      const work = Math.max(0, Number.isFinite(end - start) ? end - start : 0);
      // Match expensive drawing with an equal idle window, capped at 200ms.
      readyAt = end + Math.min(200, work);
    },
  };
}
