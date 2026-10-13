import type { State } from './state.ts';

/** Layout history must not rewind harvests, growth or appearance. */
type Layout = Pick<State, 'plants' | 'landscapePlacements'>;
export function createEditingHistory(limit = 30) {
  const undo: Layout[] = [], redo: Layout[] = [];
  const snapshot = (s: State): Layout => structuredClone({ plants: s.plants, landscapePlacements: s.landscapePlacements });
  const apply = (s: State, layout: Layout): State => ({ ...s,
    plants: layout.plants.map(p => {
      const current = s.plants.find(item => item.id === p.id);
      return current ? { ...current, col: p.col, row: p.row } : p;
    }),
    landscapePlacements: layout.landscapePlacements,
  });
  return {
    record(before: State) { undo.push(snapshot(before)); if (undo.length > limit) undo.shift(); redo.length = 0; },
    undo(s: State) { const previous = undo.pop(); if (!previous) return s; redo.push(snapshot(s)); return apply(s, previous); },
    redo(s: State) { const next = redo.pop(); if (!next) return s; undo.push(snapshot(s)); return apply(s, next); },
    clear() { undo.length = redo.length = 0; },
    get canUndo() { return undo.length > 0; }, get canRedo() { return redo.length > 0; },
  };
}
