/** Shared scenery coordinates: drawing the map must not invent a different river. */
export const GROVE_STREAM = [[-7, -8], [-4, -5], [2, -2], [3, 2], [-1, 6], [-4, 9]] as const;
export const GROVE_INLET = [[2.8, -1.4], [4.6, -2.7], [5.8, -4.5], [7.15, -6.15]] as const;
export const SPIRIT_TREE = { x: -10.8, z: -9.8 };
export const DREAM_POOL = { x: 7.55, z: -6.55, radius: 2.2 };
export const MEADOW_ROUTES = ['greenhouse', 'home', 'village', 'grove', 'sanctuary'] as const;
