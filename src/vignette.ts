/**
 * Adult Romance Vignettes & Memory Flashes.
 *
 * Subtle, non-blocking ethereal memory flashes that momentarily reveal
 * the eternal adult forms of Angel and Gorastakh during tender intimacy moments
 * (hugs, rare flower blooms, soaring apex).
 */

export interface VignetteState {
  active: boolean;
  opacity: number;
  imageSrc: string;
  caption: string;
  startedAt: number;
  durationMs: number;
}

export const ADULT_VIGNETTE_ASSETS = [
  {
    image: '/art/story-adults.webp',
    caption: 'خاطره‌ای از پیوند ابدی در دنیای دوشاخ‌ها',
  },
  {
    image: '/art/cards-angel-adult.webp',
    caption: 'فرشته در درخشش سپیده و آسمان ابدی',
  },
  {
    image: '/art/cards-gor-adult.webp',
    caption: 'گوراستاخ در آیین آرامش و دانایی نور',
  },
] as const;

export function createVignetteState(): VignetteState {
  return {
    active: false,
    opacity: 0,
    imageSrc: '',
    caption: '',
    startedAt: 0,
    durationMs: 2400,
  };
}

export function triggerVignette(
  state: VignetteState,
  assetIndex: number = 0,
  now: number = performance.now(),
  durationMs: number = 2400,
): VignetteState {
  const chosen = ADULT_VIGNETTE_ASSETS[Math.abs(assetIndex) % ADULT_VIGNETTE_ASSETS.length];
  return {
    active: true,
    opacity: 0.01,
    imageSrc: chosen.image,
    caption: chosen.caption,
    startedAt: now,
    durationMs: Math.max(800, durationMs),
  };
}

/**
 * Calculates current vignette opacity using a smooth bell-shaped curve:
 * gentle ease-in (25% of time), peak sustain (50%), and gentle fade-out (25%).
 */
export function calculateVignetteOpacity(state: VignetteState, now: number): number {
  if (!state.active) return 0;
  const elapsed = now - state.startedAt;
  if (elapsed >= state.durationMs || elapsed < 0) return 0;

  const progress = elapsed / state.durationMs; // 0.0 to 1.0

  if (progress < 0.25) {
    // Fade in
    const t = progress / 0.25;
    return t * t * (3 - 2 * t) * 0.92;
  } else if (progress < 0.75) {
    // Peak hold
    return 0.92;
  } else {
    // Fade out
    const t = (progress - 0.75) / 0.25;
    return (1 - t * t * (3 - 2 * t)) * 0.92;
  }
}

export function updateVignetteState(state: VignetteState, now: number): VignetteState {
  if (!state.active) return state;
  const opacity = calculateVignetteOpacity(state, now);
  if (opacity <= 0.001) {
    return {
      ...state,
      active: false,
      opacity: 0,
    };
  }
  return {
    ...state,
    opacity,
  };
}
