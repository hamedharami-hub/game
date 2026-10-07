/** Lightweight grid navigation for walking around circular world colliders. */

export interface NavigationPoint {
  readonly x: number;
  readonly z: number;
}

export interface NavigationObstacle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface NavigationBounds {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface NavigationOptions {
  /** Total distance to keep from collider centers, including actor radius. */
  readonly clearance?: number;
  /** Grid spacing. Finer grids route more precisely and cost more CPU on click. */
  readonly cellSize?: number;
  /** A landmark can be approached from anywhere within this distance. */
  readonly approachRadius?: number;
}

interface QueueEntry {
  readonly index: number;
  readonly score: number;
}

class MinQueue {
  private readonly entries: QueueEntry[] = [];

  get size(): number { return this.entries.length; }

  push(entry: QueueEntry): void {
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].score <= entry.score) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): QueueEntry | undefined {
    if (!this.entries.length) return undefined;
    const first = this.entries[0];
    const last = this.entries.pop()!;
    if (!this.entries.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const child = right < this.entries.length
        && this.entries[right].score < this.entries[left].score ? right : left;
      if (this.entries[child].score >= last.score) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

/**
 * Plans a walkable route to the nearest unblocked point near a destination.
 * Returns world-space waypoints (excluding the start), or null when no safe
 * approach can be reached inside the supplied world bounds.
 */
export function planWalkableRoute(
  start: NavigationPoint,
  destination: NavigationPoint,
  bounds: NavigationBounds,
  obstacles: readonly NavigationObstacle[],
  options: NavigationOptions = {},
): NavigationPoint[] | null {
  if (![start?.x, start?.z, destination?.x, destination?.z, bounds?.x, bounds?.z, bounds?.r]
    .every(Number.isFinite) || bounds.r <= 0 || !Array.isArray(obstacles)) return null;

  const cellSize = Number.isFinite(options.cellSize)
    ? Math.max(0.85, Math.min(2.5, options.cellSize!))
    : 1.25;
  const clearance = Number.isFinite(options.clearance)
    ? Math.max(0.1, Math.min(2, options.clearance!))
    : 0.62;
  const approachRadius = Number.isFinite(options.approachRadius)
    ? Math.max(0, Math.min(16, options.approachRadius!))
    : 7.5;
  const usableRadius = bounds.r - clearance;
  if (usableRadius <= 0) return null;

const safeObstacles = obstacles.filter(obstacle =>
    Number.isFinite(obstacle?.x)
    && Number.isFinite(obstacle?.z)
    && Number.isFinite(obstacle?.radius)
    && obstacle.radius >= 0,
  ).map(obstacle => ({ x: obstacle.x, z: obstacle.z, radius: obstacle.radius + clearance }));
  const actorRadius = 0.38;

  const minX = bounds.x - usableRadius;
  const minZ = bounds.z - usableRadius;
  const side = Math.ceil(usableRadius * 2 / cellSize) + 1;
  if (side > 280) return null;
  const total = side * side;
  const walkable = new Uint8Array(total);
  const positions = new Float64Array(total * 2);
  const indexOf = (x: number, z: number) => z * side + x;
  const pointAt = (index: number): NavigationPoint => ({
    x: positions[index * 2],
    z: positions[index * 2 + 1],
  });

  const isSafePoint = (x: number, z: number): boolean => {
    const dx = x - bounds.x;
    const dz = z - bounds.z;
    if (dx * dx + dz * dz > usableRadius * usableRadius) return false;
    for (const obstacle of safeObstacles) {
      const ox = x - obstacle.x;
      const oz = z - obstacle.z;
      if (ox * ox + oz * oz < obstacle.radius * obstacle.radius) return false;
    }
    return true;
  };
  const isSafeActorStart = (x: number, z: number): boolean => {
    const dx = x - bounds.x;
    const dz = z - bounds.z;
    if (dx * dx + dz * dz > (bounds.r - actorRadius) ** 2) return false;
    for (const obstacle of safeObstacles) {
      const ox = x - obstacle.x;
      const oz = z - obstacle.z;
      const physicalRadius = obstacle.radius - clearance + actorRadius;
      if (ox * ox + oz * oz < physicalRadius * physicalRadius) return false;
    }
    return true;
  };

  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      const index = indexOf(ix, iz);
      const x = minX + ix * cellSize;
      const z = minZ + iz * cellSize;
      positions[index * 2] = x;
      positions[index * 2 + 1] = z;
      if (isSafePoint(x, z)) walkable[index] = 1;
    }
  }

  const lineIsSafe = (a: NavigationPoint, b: NavigationPoint, allowSoftStart = false): boolean => {
    if (!(allowSoftStart ? isSafeActorStart(a.x, a.z) : isSafePoint(a.x, a.z))
      || !isSafePoint(b.x, b.z)) return false;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    for (const obstacle of safeObstacles) {
      const lowX = Math.min(a.x, b.x) - obstacle.radius;
      const highX = Math.max(a.x, b.x) + obstacle.radius;
      const lowZ = Math.min(a.z, b.z) - obstacle.radius;
      const highZ = Math.max(a.z, b.z) + obstacle.radius;
      if (obstacle.x < lowX || obstacle.x > highX || obstacle.z < lowZ || obstacle.z > highZ) continue;
      const amount = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.z - a.z) * dz) / lengthSquared))
        : 0;
      const nearX = a.x + dx * amount - obstacle.x;
      const nearZ = a.z + dz * amount - obstacle.z;
      if (nearX * nearX + nearZ * nearZ < obstacle.radius * obstacle.radius) {
        const startX = a.x - obstacle.x;
        const startZ = a.z - obstacle.z;
        const endX = b.x - obstacle.x;
        const endZ = b.z - obstacle.z;
        const startsOutsideNormalCollider = startX * startX + startZ * startZ >= (obstacle.radius - clearance + actorRadius) ** 2;
        const movesAwayImmediately = amount <= 1e-6 && endX * endX + endZ * endZ >= startX * startX + startZ * startZ;
        if (!allowSoftStart || !startsOutsideNormalCollider || !movesAwayImmediately) return false;
      }
    }
    return true;
  };

  // Snap the real character to the nearest safe grid point without crossing a
  // collider. Usually this examines only a handful of cells.
  const startIx = Math.round((start.x - minX) / cellSize);
  const startIz = Math.round((start.z - minZ) / cellSize);
  let startIndex = -1;
  let startDistance = Number.POSITIVE_INFINITY;
  for (let ring = 0; ring <= 4 && startIndex < 0; ring++) {
    for (let iz = startIz - ring; iz <= startIz + ring; iz++) {
      for (let ix = startIx - ring; ix <= startIx + ring; ix++) {
        if (Math.max(Math.abs(ix - startIx), Math.abs(iz - startIz)) !== ring
          || ix < 0 || iz < 0 || ix >= side || iz >= side) continue;
        const index = indexOf(ix, iz);
        if (!walkable[index]) continue;
        const point = pointAt(index);
        if (!lineIsSafe(start, point, true)) continue;
        const dx = point.x - start.x;
        const dz = point.z - start.z;
        const distance = dx * dx + dz * dz;
        if (distance < startDistance) {
          startIndex = index;
          startDistance = distance;
        }
      }
    }
  }
  if (startIndex < 0) return null;

  const goal = new Uint8Array(total);
  let goalCount = 0;
  for (let index = 0; index < total; index++) {
    if (!walkable[index]) continue;
    const point = pointAt(index);
    const dx = point.x - destination.x;
    const dz = point.z - destination.z;
    if (dx * dx + dz * dz <= approachRadius * approachRadius) {
      goal[index] = 1;
      goalCount++;
    }
  }
  if (!goalCount) return null;
  const startIsNearDestination = Math.hypot(start.x - destination.x, start.z - destination.z) <= approachRadius;
  if (startIsNearDestination) return [];
  if (goal[startIndex]) {
    goal[startIndex] = 0;
    goalCount--;
    if (!goalCount) return null;
  }

  const gScore = new Float64Array(total);
  gScore.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(total);
  previous.fill(-1);
  const closed = new Uint8Array(total);
  const queue = new MinQueue();
  const heuristic = (index: number) => {
    const dx = positions[index * 2] - destination.x;
    const dz = positions[index * 2 + 1] - destination.z;
    return Math.max(0, Math.hypot(dx, dz) - approachRadius);
  };
  gScore[startIndex] = 0;
  queue.push({ index: startIndex, score: heuristic(startIndex) });
  let found = -1;
  let expanded = 0;
  const directions = [
    [-1, -1, Math.SQRT2], [0, -1, 1], [1, -1, Math.SQRT2],
    [-1, 0, 1], [1, 0, 1],
    [-1, 1, Math.SQRT2], [0, 1, 1], [1, 1, Math.SQRT2],
  ] as const;

  while (queue.size && expanded < 50_000) {
    const entry = queue.pop()!;
    const current = entry.index;
    if (closed[current]) continue;
    if (entry.score > gScore[current] + heuristic(current) + 1e-6) continue;
    if (goal[current]) { found = current; break; }
    closed[current] = 1;
    expanded++;
    const ix = current % side;
    const iz = Math.floor(current / side);
    const from = pointAt(current);

    for (const [stepX, stepZ, multiplier] of directions) {
      const nextX = ix + stepX;
      const nextZ = iz + stepZ;
      if (nextX < 0 || nextZ < 0 || nextX >= side || nextZ >= side) continue;
      const next = indexOf(nextX, nextZ);
      if (!walkable[next] || closed[next]) continue;
      const to = pointAt(next);
      if (!lineIsSafe(from, to)) continue;
      const nextScore = gScore[current] + cellSize * multiplier;
      if (nextScore >= gScore[next]) continue;
      gScore[next] = nextScore;
      previous[next] = current;
      queue.push({ index: next, score: nextScore + heuristic(next) });
    }
  }

  if (found < 0) return null;

  const reversePath: number[] = [];
  for (let current = found; current !== -1; current = previous[current]) {
    reversePath.push(current);
    if (current === startIndex) break;
  }
  if (reversePath[reversePath.length - 1] !== startIndex) return null;
  reversePath.reverse();

  const rawPath = reversePath.map(pointAt);
  if (rawPath.length && Math.hypot(rawPath[0].x - start.x, rawPath[0].z - start.z) < 0.2) rawPath.shift();
  if (!rawPath.length) return [];

  // Collapse the A* grid into a few visible, direct walking legs.
  const route: NavigationPoint[] = [];
  let from: NavigationPoint = start;
  let cursor = 0;
  while (cursor < rawPath.length) {
    let farthest = cursor;
    for (let candidate = rawPath.length - 1; candidate > cursor; candidate--) {
      if (lineIsSafe(from, rawPath[candidate], route.length === 0)) {
        farthest = candidate;
        break;
      }
    }
    const waypoint = rawPath[farthest];
    route.push(waypoint);
    from = waypoint;
    cursor = farthest + 1;
  }
  return route;
}
