import { planetElevation } from './interactions.ts';

export interface GardenEulerTransform {
  x: number;
  y: number;
  z: number;
  order: 'YXZ';
}

/**
 * Orient a garden's local up axis to the terrain normal while keeping its yaw
 * as the requested world-space heading. Central differences follow the same
 * surface function used to place the garden and its companions.
 */
export function gardenTangentEuler(x: number, z: number, yaw: number): GardenEulerTransform {
  if (![x, z, yaw].every(Number.isFinite)) return { x: 0, y: Number.isFinite(yaw) ? yaw : 0, z: 0, order: 'YXZ' };

  const sample = 0.01;
  const slopeX = (planetElevation(x + sample, z) - planetElevation(x - sample, z)) / (2 * sample);
  const slopeZ = (planetElevation(x, z + sample) - planetElevation(x, z - sample)) / (2 * sample);
  const normalLength = Math.hypot(slopeX, 1, slopeZ);
  const nx = -slopeX / normalLength;
  const ny = 1 / normalLength;
  const nz = -slopeZ / normalLength;

  // Three's YXZ order applies Ry * Rx * Rz. Solving its local-up column with
  // yaw fixed preserves the requested heading exactly while matching the
  // terrain normal, instead of extracting a slightly altered Euler yaw.
  const sinZ = Math.sin(yaw) * nz - Math.cos(yaw) * nx;
  const cosZ = Math.sqrt(Math.max(0, 1 - sinZ * sinZ));
  const sinX = (Math.sin(yaw) * nx + Math.cos(yaw) * nz) / cosZ;
  const cosX = ny / cosZ;

  return {
    x: Math.atan2(sinX, cosX),
    y: yaw,
    z: Math.atan2(sinZ, cosZ),
    order: 'YXZ',
  };
}
