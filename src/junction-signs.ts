import type { District } from './state.ts';

export interface JunctionSignPlacement {
  readonly destination: District;
  readonly x: number;
  readonly z: number;
  readonly orientation: number;
}

/** Low waymarkers off each existing garden path, facing their destination. */
export const JUNCTION_SIGNS = [
  { destination: 'greenhouse', x: 8.0187, z: 16.0958, orientation: Math.PI / 2 },
  { destination: 'home', x: -5.8063, z: 6.0827, orientation: -2.4469 },
  { destination: 'village', x: 6.3992, z: 8.3688, orientation: 2.3751 },
  { destination: 'grove', x: -10.4742, z: 14.1314, orientation: -1.3135 },
  { destination: 'sanctuary', x: 0.6496, z: 4.4571, orientation: 3.0951 },
] as const satisfies readonly JunctionSignPlacement[];
