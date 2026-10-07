/**
 * Detects calm arrivals at caller-supplied places using only position and
 * active-session time. It has no game, renderer, save, or wall-clock state.
 */

export interface ExplorationLandmark {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Horizontal distance at which entering the place counts as an arrival. */
  readonly radius: number;
  /** Optional caller-authored line to show for this quiet moment. */
  readonly cue?: string;
}

export interface LandmarkArrivalOptions {
  /** Minimum active-session seconds between emitted arrivals. Defaults to 12. */
  readonly cooldownSeconds?: number;
}

const DEFAULT_COOLDOWN_SECONDS = 12;

/**
 * Tracks entry into supplied landmark circles. Call `update` with the
 * character's resolved x/z and elapsed active-session seconds. It returns the
 * original landmark record once on an eligible entry, and `undefined` on all
 * other frames, without allocating per-frame output objects. The first valid
 * sample only primes inside/outside state, so starting in a landmark cannot
 * create an arrival.
 *
 * A landmark stays active until the character leaves its radius. Leaving it
 * rearms arrival detection; entering while the cooldown is active is silently
 * skipped until the character leaves and re-enters after the cooldown.
 * Overlapping places keep the current landmark active until it is exited.
 * Keep the supplied array and its records stable for this tracker's lifetime.
 */
export class LandmarkArrivalTracker {
  private currentIndex = -1;
  private hasObservedPosition = false;
  private lastArrivalSeconds = Number.NEGATIVE_INFINITY;
  private lastObservedSeconds = 0;
  private readonly cooldownSeconds: number;
  private readonly landmarks: readonly ExplorationLandmark[];

  constructor(
    landmarks: readonly ExplorationLandmark[],
    options: LandmarkArrivalOptions = {},
  ) {
    this.landmarks = landmarks;
    const requestedCooldown = options.cooldownSeconds;
    this.cooldownSeconds = typeof requestedCooldown === 'number'
      && Number.isFinite(requestedCooldown)
      && requestedCooldown >= 0
      ? requestedCooldown
      : DEFAULT_COOLDOWN_SECONDS;
  }

  /**
   * Advance arrival detection. Invalid coordinates or time leave tracker state
   * unchanged. Time is clamped to zero and never moves backwards.
   */
  update(x: number, z: number, elapsedSeconds: number): ExplorationLandmark | undefined {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(elapsedSeconds)) {
      return undefined;
    }

    const now = Math.max(this.lastObservedSeconds, Math.max(0, elapsedSeconds));
    this.lastObservedSeconds = now;

    if (!this.hasObservedPosition) {
      this.hasObservedPosition = true;
      this.currentIndex = this.findNearestContaining(x, z);
      return undefined;
    }

    // Keep one active place while inside it. This makes overlapping radii
    // stable instead of switching cues as the character crosses their overlap.
    if (this.currentIndex >= 0 && this.isInside(this.landmarks[this.currentIndex], x, z)) {
      return undefined;
    }
    this.currentIndex = -1;

    const nearestIndex = this.findNearestContaining(x, z);
    if (nearestIndex < 0) return undefined;
    this.currentIndex = nearestIndex;

    if (now - this.lastArrivalSeconds < this.cooldownSeconds) return undefined;

    this.lastArrivalSeconds = now;
    return this.landmarks[nearestIndex];
  }

  /** Reset entry and cooldown state, for an explicit session restart. */
  reset(): void {
    this.currentIndex = -1;
    this.hasObservedPosition = false;
    this.lastArrivalSeconds = Number.NEGATIVE_INFINITY;
    this.lastObservedSeconds = 0;
  }

  private isInside(landmark: ExplorationLandmark | undefined, x: number, z: number): boolean {
    if (!this.isValid(landmark)) return false;
    const dx = x - landmark.x;
    const dz = z - landmark.z;
    return dx * dx + dz * dz <= landmark.radius * landmark.radius;
  }

  /** Select the nearest containing landmark; array order breaks exact ties. */
  private findNearestContaining(x: number, z: number): number {
    let nearestIndex = -1;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.landmarks.length; index++) {
      const landmark = this.landmarks[index];
      if (!this.isValid(landmark)) continue;
      const dx = x - landmark.x;
      const dz = z - landmark.z;
      const distanceSquared = dx * dx + dz * dz;
      const radiusSquared = landmark.radius * landmark.radius;
      if (distanceSquared <= radiusSquared && distanceSquared < nearestDistanceSquared) {
        nearestIndex = index;
        nearestDistanceSquared = distanceSquared;
      }
    }
    return nearestIndex;
  }

  private isValid(landmark: ExplorationLandmark | undefined): landmark is ExplorationLandmark {
    return landmark !== undefined
      && Number.isFinite(landmark.x)
      && Number.isFinite(landmark.z)
      && Number.isFinite(landmark.radius)
      && landmark.radius >= 0;
  }
}

/** Convenience factory for callers that prefer a named constructor function. */
export function createLandmarkArrivalTracker(
  landmarks: readonly ExplorationLandmark[],
  options?: LandmarkArrivalOptions,
): LandmarkArrivalTracker {
  return new LandmarkArrivalTracker(landmarks, options);
}
