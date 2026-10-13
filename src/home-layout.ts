import type { ObstacleCircle } from './interactions.ts';

export const homeArrangements = ['tea', 'reading'] as const;
export type HomeArrangement = typeof homeArrangements[number];
export function insideHome(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x + 22) < 2.5 && Math.abs(z + 10) < 1.95;
}
/** Thin sampled walls preserve a real south-facing doorway and a walkable room. */
export function homeObstacles(): ObstacleCircle[] {
  const walls: ObstacleCircle[] = [];
  for (let z = -2.1; z <= 2.15; z += .3) for (const x of [-2.7, 2.7]) walls.push({ x: -22 + x, z: -10 + z, radius: .16 });
  for (let x = -2.7; x <= 2.75; x += .3) {
    walls.push({ x: -22 + x, z: -12.1, radius: .16 });
    if (Math.abs(x) > .9) walls.push({ x: -22 + x, z: -7.9, radius: .16 });
  }
  // Keep the same unobstructed entry lane with either furnishing layout.
  walls.push({ x: -23.4, z: -10.9, radius: .65 }, { x: -20.4, z: -11.4, radius: .55 }, { x: -20.5, z: -9.4, radius: .6 });
  return walls;
}
