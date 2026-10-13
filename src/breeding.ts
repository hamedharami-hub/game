import { growthStage, plantAt, type Species, type State } from './state.ts';

export const crosses = [
  { parents: ['moonflower', 'sunblossom'], child: 'dawnflower' },
  { parents: ['spiritfern', 'starlily'], child: 'mistlily' },
] as const;
/** Explicit pollination, not a random reward. Both living parents remain intact. */
export function breedingResult(s: State, parentId: string, now: number): Species | null {
  if (!Number.isFinite(now) || now < 0) return null;
  const parent = s.plants.find(p => p.id === parentId);
  if (!parent || growthStage(parent, now) !== 3) return null;
  for (const recipe of crosses) {
    if (!(recipe.parents as readonly string[]).includes(parent.species)) continue;
    if (s.plants.some(p => p.id !== parent.id && (recipe.parents as readonly string[]).includes(p.species)
      && p.species !== parent.species && Math.hypot(p.col - parent.col, p.row - parent.row) <= 1.5
      && growthStage(p, now) === 3)) return recipe.child;
  }
  return null;
}
export function breedAt(s: State, parentId: string, col: number, row: number, now: number, id: string): State {
  const child = breedingResult(s, parentId, now);
  if (!child) return s;
  const next = plantAt(s, child, col, row, now, id);
  return next === s ? s : { ...next, hybrids: true };
}
