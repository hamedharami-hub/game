/**
 * A small, deterministic atmosphere model for one active play session.
 * Callers should pass time accumulated while the game is open; wall-clock time
 * is intentionally not used, so nothing changes or expires while the game is
 * closed. The repeating cycle keeps the meadow welcoming on later visits too.
 */

export type AmbiencePhase = 'morning' | 'day' | 'evening' | 'night';
export type AmbienceWeather = 'clear' | 'breeze' | 'rain';

export interface AmbienceSample {
  phase: AmbiencePhase;
  weather: AmbienceWeather;
  skyColor: string;
  fogColor: string;
  hemisphereColor: string;
  sunColor: string;
  /** Directional light level intended for the sun or key light. */
  sunIntensity: number;
  /** Normalized wind amount, from 0 (still) to 1 (strong breeze). */
  windStrength: number;
  /** Normalized light-rain amount, from 0 (dry) to 1 (heavier rain). */
  rainStrength: number;
  /** Linear progress through the current 4 minute 30 second phase. */
  phaseProgress: number;
}

const PHASES: readonly AmbiencePhase[] = ['morning', 'day', 'evening', 'night'];
const PHASE_SECONDS = 4 * 60 + 30;
const CYCLE_SECONDS = PHASE_SECONDS * PHASES.length;

interface Palette {
  sky: string;
  fog: string;
  hemisphere: string;
  sun: string;
  intensity: number;
}

// Each row is a color/light anchor. Interpolating to the next anchor makes
// dawn, daylight, dusk, and night move gradually instead of switching as a filter.
const PALETTES: readonly Palette[] = [
  { sky: '#e8aa94', fog: '#d8b4ad', hemisphere: '#d9b698', sun: '#ffd7a2', intensity: 0.62 },
  { sky: '#8bc9e8', fog: '#c1d8d2', hemisphere: '#b6d19e', sun: '#fff0c5', intensity: 1.08 },
  { sky: '#e69a83', fog: '#d4a89f', hemisphere: '#d4ad8b', sun: '#ffd09a', intensity: 0.68 },
  { sky: '#333859', fog: '#55586c', hemisphere: '#586179', sun: '#aebbed', intensity: 0.28 },
];

interface WeatherWindow {
  kind: Exclude<AmbienceWeather, 'clear'>;
  start: number;
  end: number;
}

// The two short breezes and one gentle shower repeat with the 18 minute cycle.
// Their fixed active-time windows are learnable and never depend on a login or RNG.
const WEATHER_WINDOWS: readonly WeatherWindow[] = [
  { kind: 'breeze', start: 3 * 60, end: 4 * 60 + 30 },
  { kind: 'rain', start: 9 * 60, end: 11 * 60 },
  { kind: 'breeze', start: 14 * 60, end: 15 * 60 + 30 },
];

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function mixNumber(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function mixColor(from: string, to: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  const fromValue = Number.parseInt(from.slice(1), 16);
  const toValue = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number) => {
    const a = (fromValue >> shift) & 0xff;
    const b = (toValue >> shift) & 0xff;
    return Math.round(mixNumber(a, b, t)).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function weatherAmount(time: number, start: number, end: number, fadeSeconds: number): number {
  if (time < start || time >= end) return 0;
  const fade = Math.min(fadeSeconds, (end - start) / 2);
  const fadeIn = smoothstep((time - start) / fade);
  const fadeOut = smoothstep((end - time) / fade);
  return Math.min(fadeIn, fadeOut);
}

/**
 * Sample the world atmosphere from active session time in seconds.
 * Negative, non-finite, or not-yet-initialized times safely sample the start.
 */
export function sampleAmbience(elapsedSeconds: number): AmbienceSample {
  const activeTime = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const cycleTime = activeTime % CYCLE_SECONDS;
  const phaseIndex = Math.min(PHASES.length - 1, Math.floor(cycleTime / PHASE_SECONDS));
  const phaseProgress = (cycleTime - phaseIndex * PHASE_SECONDS) / PHASE_SECONDS;
  const from = PALETTES[phaseIndex];
  const to = PALETTES[(phaseIndex + 1) % PALETTES.length];
  const colorProgress = smoothstep(phaseProgress);

  let weather: AmbienceWeather = 'clear';
  let breeze = 0;
  let rain = 0;
  for (const window of WEATHER_WINDOWS) {
    const amount = weatherAmount(cycleTime, window.start, window.end, 24);
    if (amount > 0 || (cycleTime >= window.start && cycleTime < window.end)) {
      weather = window.kind;
      if (window.kind === 'breeze') breeze = amount;
      else rain = amount;
      break;
    }
  }

  // Weather subtly cools the sky and dims direct sunlight while keeping each
  // time of day legible. Wind and rain ease in/out over 24 seconds.
  const rainSky = rain * 0.28;
  const rainFog = rain * 0.34;
  const rainHemisphere = rain * 0.2;
  const rainSun = rain * 0.2;
  const skyColor = mixColor(mixColor(from.sky, to.sky, colorProgress), '#8299ad', rainSky);
  const fogColor = mixColor(mixColor(from.fog, to.fog, colorProgress), '#aab8c0', rainFog);
  const hemisphereColor = mixColor(
    mixColor(from.hemisphere, to.hemisphere, colorProgress),
    '#8798a4',
    rainHemisphere,
  );
  const sunColor = mixColor(mixColor(from.sun, to.sun, colorProgress), '#dce3e9', rainSun);

  return {
    phase: PHASES[phaseIndex],
    weather,
    skyColor,
    fogColor,
    hemisphereColor,
    sunColor,
    sunIntensity: mixNumber(from.intensity, to.intensity, colorProgress) * (1 - rain * 0.24),
    windStrength: Math.min(1, 0.08 + breeze * 0.72 + rain * 0.16),
    rainStrength: rain * 0.56,
    phaseProgress,
  };
}
