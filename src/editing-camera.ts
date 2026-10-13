export interface CameraPoint { x: number; z: number }
/** Session-only camera focus: never writes player coordinates or save data. */
export function panEditingCamera(point: CameraPoint, dx: number, dz: number, radius: number): CameraPoint {
  if (![point.x, point.z, dx, dz, radius].every(Number.isFinite) || radius <= 0) return point;
  const x = point.x + dx, z = point.z + dz;
  const length = Math.hypot(x, z);
  const scale = length > radius ? radius / length : 1;
  return { x: x * scale, z: z * scale };
}
