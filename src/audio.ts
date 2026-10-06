/**
 * Dream Caravan (کاروان رؤیاها) - Audio Synthesizer Engine
 * Pure procedural Web Audio API synthesis for felt piano, crystal chimes,
 * and soothing ambient soundscapes (wind, rain, and flowing water).
 */

export interface AudioEngine {
  enable(context?: AudioContext): void;
  updateAmbience(windFactor: number, rainFactor: number, waterDistance: number): void;
  playHandholdChime(): void;
  playFlightTakeoff(): void;
  playFlightLanding(): void;
  playBloomChime(): void;
  playEmbraceHarmony(): void;
}

// ============================================================================
// Mathematical Helpers & Acoustic Tuning Tables
// ============================================================================

/** Converts standard MIDI note number to frequency in Hertz (A4 = 440 Hz, 12-TET). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Converts pitch detune offset in musical cents to frequency ratio. */
export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Strictly bounds linear gain between min and max; safely converts non-finite inputs to min. */
export function clampGain(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates spatial water murmur gain using a smooth Hermite curve.
 * Center pond at (0, 0, 0); full presence up to minDistance, zero beyond maxDistance.
 */
export function calculateWaterGain(
  distance: number,
  maxGain = 0.016,
  minDistance = 6.0,
  maxDistance = 24.0,
): number {
  if (!Number.isFinite(distance) || distance >= maxDistance) return 0;
  if (distance <= minDistance) return maxGain;
  const u = (distance - minDistance) / (maxDistance - minDistance);
  const smooth = 1 - u * u * (3 - 2 * u);
  return Math.max(0, smooth * maxGain);
}

/** Normalized water factor between 0.0 and 1.0 based on distance. */
export function calculateWaterFactor(
  distance: number,
  minDistance = 6.0,
  maxDistance = 24.0,
): number {
  return calculateWaterGain(distance, 1.0, minDistance, maxDistance);
}

/** Alias matching mathematical naming in design documents. */
export const computeWaterMurmurGain = calculateWaterGain;

/** Computes dynamic lowpass filter cutoff and gain for ambient wind. */
export function calculateWindParams(windStrength: number): { cutoff: number; gain: number } {
  const safe = clampGain(windStrength);
  return {
    cutoff: 320 + safe * 400,
    gain: 0.0035 + safe * 0.005,
  };
}

/** Computes dynamic gain for ambient rain. */
export function calculateRainParams(rainStrength: number): { gain: number } {
  const safe = clampGain(rainStrength);
  return {
    gain: safe * 0.008,
  };
}

/** Standard frequencies (Hz) for D Major Pentatonic & D Lydian harmonies. */
export const NOTE_FREQUENCIES = {
  D3: 146.83,
  Fs3: 185.00,
  A3: 220.00,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  G4: 392.00,
  A4: 440.00,
  B4: 493.88,
  C5: 523.25,
  Cs5: 554.37,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  G5: 783.99,
  A5: 880.00,
  B5: 987.77,
  Cs6: 1108.73,
  D6: 1174.66,
  E6: 1318.51,
  Fs6: 1479.98,
  G6: 1567.98,
  Cs7: 2217.46,
} as const;

export const PENTATONIC_FREQUENCIES = [
  NOTE_FREQUENCIES.D4,
  NOTE_FREQUENCIES.E4,
  NOTE_FREQUENCIES.Fs4,
  NOTE_FREQUENCIES.A4,
  NOTE_FREQUENCIES.B4,
  NOTE_FREQUENCIES.D5,
  NOTE_FREQUENCIES.E5,
  NOTE_FREQUENCIES.Fs5,
  NOTE_FREQUENCIES.A5,
  NOTE_FREQUENCIES.B5,
  NOTE_FREQUENCIES.D6,
] as const;

// Choreographed motif notes (publicly exported for inspection and testing)
export const HANDHOLD_NOTES = [
  { note: 'A4', freq: 440.00, time: 0.000, dur: 0.80, gain: 0.09 },
  { note: 'D5', freq: 587.33, time: 0.075, dur: 0.90, gain: 0.11 },
  { note: 'Fs5', freq: 739.99, time: 0.150, dur: 1.00, gain: 0.13 },
  { note: 'A5', freq: 880.00, time: 0.225, dur: 1.10, gain: 0.15 },
  { note: 'D6', freq: 1174.66, time: 0.300, dur: 1.50, gain: 0.18 },
] as const;

export const TAKEOFF_NOTES = [
  { freq: 146.83, targetFreq: 185.00, time: 0.000, dur: 0.35, gain: 0.12, type: 'sub' },
  { freq: 293.66, time: 0.100, dur: 0.90, gain: 0.10, type: 'piano' },
  { freq: 440.00, time: 0.180, dur: 1.10, gain: 0.12, type: 'piano' },
  { freq: 659.26, time: 0.280, dur: 1.30, gain: 0.14, type: 'chime' },
  { freq: 739.99, time: 0.380, dur: 1.50, gain: 0.16, type: 'chime' },
  { freq: 987.77, time: 0.480, dur: 1.70, gain: 0.17, type: 'chime' },
  { freq: 1174.66, time: 0.580, dur: 2.20, gain: 0.20, type: 'bell' },
] as const;

export const LANDING_NOTES = [
  { freq: 880.00, time: 0.000, dur: 0.55, gain: 0.12, type: 'chime' },
  { freq: 739.99, time: 0.120, dur: 0.55, gain: 0.11, type: 'chime' },
  { freq: 659.26, time: 0.240, dur: 0.55, gain: 0.10, type: 'chime' },
  { freq: 587.33, time: 0.360, dur: 0.65, gain: 0.10, type: 'piano' },
  { freq: 293.66, time: 0.500, dur: 1.80, gain: 0.14, type: 'chord' },
  { freq: 369.99, time: 0.500, dur: 1.80, gain: 0.12, type: 'chord' },
  { freq: 440.00, time: 0.500, dur: 1.80, gain: 0.11, type: 'chord' },
] as const;

export const BLOOM_NOTES = [
  { freq: 1318.51, time: 0.000, dur: 0.05, gain: 0.07, type: 'grace' },
  { freq: 1479.98, time: 0.035, dur: 1.40, gain: 0.16, type: 'strike' },
  { freq: 2217.46, time: 0.035, dur: 0.90, gain: 0.08, type: 'shimmer' },
] as const;

export const EMBRACE_NOTES = [
  { freq: 146.83, time: 0.000, dur: 2.60, gain: 0.15 },
  { freq: 220.00, time: 0.030, dur: 2.50, gain: 0.14 },
  { freq: 329.63, time: 0.060, dur: 2.40, gain: 0.13 },
  { freq: 369.99, time: 0.090, dur: 2.30, gain: 0.13 },
  { freq: 554.37, time: 0.120, dur: 2.20, gain: 0.11 },
  { freq: 880.00, time: 0.150, dur: 1.80, gain: 0.08 },
] as const;

// ============================================================================
// Procedural Audio Engine Implementation
// ============================================================================

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let ambienceBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;

  // Ambience channel nodes
  let windFilter: BiquadFilterNode | null = null;
  let windGain: GainNode | null = null;
  let rainHP: BiquadFilterNode | null = null;
  let rainLP: BiquadFilterNode | null = null;
  let rainGain: GainNode | null = null;
  let waterPre: BiquadFilterNode | null = null;
  let waterBP1: BiquadFilterNode | null = null;
  let waterGain1: GainNode | null = null;
  let waterBP2: BiquadFilterNode | null = null;
  let waterGain2: GainNode | null = null;
  let waterMasterGain: GainNode | null = null;
  let waterLfo1: OscillatorNode | null = null;
  let waterLfo2: OscillatorNode | null = null;
  let noiseSource: AudioBufferSourceNode | null = null;

  let lastAmbienceUpdate = -10000;
  let isEnabled = false;

  function duckAmbience(duration = 1.5, duckGain = 0.42) {
    if (!ambienceBus || !ctx) return;
    try {
      const t = ctx.currentTime;
      const param = ambienceBus.gain;
      param.cancelScheduledValues?.(t);
      param.setValueAtTime?.(param.value, t);
      param.linearRampToValueAtTime?.(duckGain, t + 0.04);
      param.setTargetAtTime?.(1.0, t + 0.12, duration * 0.45);
    } catch {
      // Audio automation errors must never interrupt gameplay
    }
  }

  function playFeltPianoVoice(
    freq: number,
    startTime: number,
    duration: number,
    gainPeak: number,
    isDampedChord = false,
  ) {
    if (!ctx || !sfxBus) return;
    try {
      // Osc 1: Triangle body (fundamental harmonic rolloff -12 dB/oct)
      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, startTime);

      // Osc 2: Sine sub/unison with warm +2.2 cents acoustic detune
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * centsToRatio(2.2), startTime);

      // Dynamic Felt Damper Lowpass Filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.85;

      if (isDampedChord) {
        filter.frequency.setValueAtTime(480, startTime);
        filter.frequency.linearRampToValueAtTime?.(600, startTime + 0.05);
        filter.frequency.exponentialRampToValueAtTime?.(220, startTime + duration);
      } else {
        const fRest = Math.min(650, 1.8 * freq);
        const fPeak = Math.min(1800, 3.2 * freq);
        const fDecay = Math.max(180, 0.75 * freq);
        filter.frequency.setValueAtTime(fRest, startTime);
        filter.frequency.linearRampToValueAtTime?.(fPeak, startTime + 0.015);
        filter.frequency.exponentialRampToValueAtTime?.(fDecay, startTime + duration * 0.75);
      }

      // Voice Amplitude Envelope (18ms click-free attack + exponential decay)
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainPeak * 0.001), startTime + duration);

      // Graph wiring: dual osc -> filter -> noteGain -> sfxBus
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(sfxBus);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + 0.05);
      osc2.stop(startTime + duration + 0.05);

      // Clean node lifecycle disconnection
      osc1.onended = () => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          filter.disconnect();
          noteGain.disconnect();
        } catch {}
      };
    } catch {}
  }

  function playCrystalChimeVoice(
    freq: number,
    startTime: number,
    duration: number,
    gainPeak: number,
  ) {
    if (!ctx || !sfxBus) return;
    try {
      // Fundamental carrier sine
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(freq, startTime);

      // Inharmonic crystalline partial (Mode 2 rod/plate vibration at 2.756 * f0)
      const partial = ctx.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(freq * 2.756, startTime);

      // Crystal Highpass shaping (removes low-frequency mud)
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(680, startTime);
      hpf.Q.value = 0.7;

      // Amplitude Envelope: 3ms transient strike + shimmering exponential decay
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0, startTime);
      voiceGain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.004);
      voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainPeak * 0.001), startTime + duration);

      // Partial sub-gain at -14 dB
      const partialGain = ctx.createGain();
      partialGain.gain.value = 0.20;

      carrier.connect(hpf);
      partial.connect(partialGain);
      partialGain.connect(hpf);
      hpf.connect(voiceGain);
      voiceGain.connect(sfxBus);

      carrier.start(startTime);
      partial.start(startTime);
      carrier.stop(startTime + duration + 0.05);
      partial.stop(startTime + duration + 0.05);

      carrier.onended = () => {
        try {
          carrier.disconnect();
          partial.disconnect();
          partialGain.disconnect();
          hpf.disconnect();
          voiceGain.disconnect();
        } catch {}
      };
    } catch {}
  }

  function playSubGlide(
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    gainPeak: number,
  ) {
    if (!ctx || !sfxBus) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime?.(endFreq, startTime + duration * 0.7);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainPeak * 0.001), startTime + duration);

      osc.connect(gain);
      gain.connect(sfxBus);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  const engine: AudioEngine = {
    enable(customContext?: AudioContext) {
      if (isEnabled && ctx && ctx.state !== 'closed') {
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        return;
      }

      try {
        if (customContext) {
          ctx = customContext;
        } else if (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)) {
          const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ctx = new AudioContextCtor();
        } else {
          // In environments without AudioContext (e.g. Node tests without mock), safely return
          return;
        }

        if (!ctx) return;

        // Master bus with transparent compression limiter
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.60;

        if (typeof ctx.createDynamicsCompressor === 'function') {
          limiter = ctx.createDynamicsCompressor();
          limiter.threshold.setValueAtTime(-12, ctx.currentTime);
          limiter.knee.setValueAtTime(20, ctx.currentTime);
          limiter.ratio.setValueAtTime(4, ctx.currentTime);
          limiter.attack.setValueAtTime(0.003, ctx.currentTime);
          limiter.release.setValueAtTime(0.25, ctx.currentTime);

          masterGain.connect(limiter);
          limiter.connect(ctx.destination);
        } else {
          masterGain.connect(ctx.destination);
        }

        // Submix busses
        ambienceBus = ctx.createGain();
        ambienceBus.gain.value = 1.0;
        ambienceBus.connect(masterGain);

        sfxBus = ctx.createGain();
        sfxBus.gain.value = 0.85;
        sfxBus.connect(masterGain);

        // Decorrelated noise buffer (2.0s looped with deterministic LCG)
        const sampleRate = ctx.sampleRate || 44100;
        const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
        const noise = buffer.getChannelData(0);
        let seed = 0x731a4d;
        for (let i = 0; i < noise.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          noise[i] = (seed / 4294967296 - 0.5) * 0.48;
        }

        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = buffer;
        noiseSource.loop = true;

        // Wind Channel (Dynamic lowpass 320 - 720 Hz)
        windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.setValueAtTime(520, ctx.currentTime);
        windFilter.Q.setValueAtTime(1.2, ctx.currentTime);

        windGain = ctx.createGain();
        windGain.gain.setValueAtTime(0, ctx.currentTime);

        noiseSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(ambienceBus);

        // Rain Channel (1400 Hz HPF + 7500 Hz LPF)
        rainHP = ctx.createBiquadFilter();
        rainHP.type = 'highpass';
        rainHP.frequency.setValueAtTime(1400, ctx.currentTime);

        rainLP = ctx.createBiquadFilter();
        rainLP.type = 'lowpass';
        rainLP.frequency.setValueAtTime(7500, ctx.currentTime);

        rainGain = ctx.createGain();
        rainGain.gain.setValueAtTime(0, ctx.currentTime);

        noiseSource.connect(rainHP);
        rainHP.connect(rainLP);
        rainLP.connect(rainGain);
        rainGain.connect(ambienceBus);

        // Water Murmur Channel (Pre-filter + Dual Resonant Bandpass + LFO ripple modulation)
        waterPre = ctx.createBiquadFilter();
        waterPre.type = 'lowpass';
        waterPre.frequency.setValueAtTime(2200, ctx.currentTime);
        waterPre.Q.setValueAtTime(0.707, ctx.currentTime);

        // Pond body deep resonance (580 Hz, Q 3.0)
        waterBP1 = ctx.createBiquadFilter();
        waterBP1.type = 'bandpass';
        waterBP1.frequency.setValueAtTime(580, ctx.currentTime);
        waterBP1.Q.setValueAtTime(3.0, ctx.currentTime);

        waterGain1 = ctx.createGain();
        waterGain1.gain.setValueAtTime(0.65, ctx.currentTime);

        // Surface ripple droplet resonance (920 Hz, Q 2.4)
        waterBP2 = ctx.createBiquadFilter();
        waterBP2.type = 'bandpass';
        waterBP2.frequency.setValueAtTime(920, ctx.currentTime);
        waterBP2.Q.setValueAtTime(2.4, ctx.currentTime);

        waterGain2 = ctx.createGain();
        waterGain2.gain.setValueAtTime(0.35, ctx.currentTime);

        waterMasterGain = ctx.createGain();
        waterMasterGain.gain.setValueAtTime(0, ctx.currentTime);

        noiseSource.connect(waterPre);
        waterPre.connect(waterBP1);
        waterBP1.connect(waterGain1);
        waterGain1.connect(waterMasterGain);

        waterPre.connect(waterBP2);
        waterBP2.connect(waterGain2);
        waterGain2.connect(waterMasterGain);

        waterMasterGain.connect(ambienceBus);

        // Liquid bubbling LFOs (subtle organic pitch modulation)
        try {
          waterLfo1 = ctx.createOscillator();
          waterLfo1.type = 'triangle';
          waterLfo1.frequency.setValueAtTime(0.38, ctx.currentTime);
          const lfo1Gain = ctx.createGain();
          lfo1Gain.gain.setValueAtTime(65, ctx.currentTime);
          waterLfo1.connect(lfo1Gain);
          lfo1Gain.connect(waterBP1.frequency as unknown as AudioNode);
          waterLfo1.start();

          waterLfo2 = ctx.createOscillator();
          waterLfo2.type = 'triangle';
          waterLfo2.frequency.setValueAtTime(0.65, ctx.currentTime);
          const lfo2Gain = ctx.createGain();
          lfo2Gain.gain.setValueAtTime(90, ctx.currentTime);
          waterLfo2.connect(lfo2Gain);
          lfo2Gain.connect(waterBP2.frequency as unknown as AudioNode);
          waterLfo2.start();
        } catch {
          // LFO modulation is an acoustic enhancement; safe to continue if unsupported
        }

        noiseSource.start();
        isEnabled = true;
        void ctx.resume().catch(() => {});

        // Background tab suspension handling
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            if (!ctx) return;
            if (document.hidden) {
              void ctx.suspend().catch(() => {});
            } else {
              void ctx.resume().catch(() => {});
            }
          });
        }
      } catch {
        // Fallback gracefully; visual atmosphere remains intact
      }
    },

    updateAmbience(windFactor: number, rainFactor: number, waterDistance: number) {
      if (!ctx || !isEnabled) return;
      const now = performance.now ? performance.now() : Date.now();
      if (now - lastAmbienceUpdate < 400) return;
      lastAmbienceUpdate = now;

      try {
        const at = ctx.currentTime;
        const windParams = calculateWindParams(windFactor);
        const rainParams = calculateRainParams(rainFactor);
        const waterGainValue = calculateWaterGain(waterDistance);

        windFilter?.frequency.setTargetAtTime?.(windParams.cutoff, at, 0.7);
        windGain?.gain.setTargetAtTime?.(windParams.gain, at, 0.7);

        rainGain?.gain.setTargetAtTime?.(rainParams.gain, at, 0.9);

        waterMasterGain?.gain.setTargetAtTime?.(waterGainValue, at, 0.4);
      } catch {}
    },

    playHandholdChime() {
      if (!ctx || !isEnabled) return;
      duckAmbience(1.8, 0.40);
      const t0 = ctx.currentTime;

      // Ascending 5-step celestial harmony in D Major Pentatonic
      for (const item of HANDHOLD_NOTES) {
        if (item.note === 'A4') {
          playFeltPianoVoice(item.freq, t0 + item.time, item.dur, item.gain * 0.75);
          playCrystalChimeVoice(item.freq, t0 + item.time, item.dur, item.gain * 0.75);
        } else {
          playCrystalChimeVoice(item.freq, t0 + item.time, item.dur, item.gain);
        }
      }
    },

    playFlightTakeoff() {
      if (!ctx || !isEnabled) return;
      duckAmbience(2.6, 0.35);
      const t0 = ctx.currentTime;

      for (const item of TAKEOFF_NOTES) {
        const t = t0 + item.time;
        if (item.type === 'sub' && 'targetFreq' in item) {
          playSubGlide(item.freq, item.targetFreq, t, item.dur, item.gain);
        } else if (item.type === 'piano') {
          playFeltPianoVoice(item.freq, t, item.dur, item.gain);
        } else {
          playCrystalChimeVoice(item.freq, t, item.dur, item.gain);
        }
      }
    },

    playFlightLanding() {
      if (!ctx || !isEnabled) return;
      duckAmbience(2.2, 0.38);
      const t0 = ctx.currentTime;

      for (const item of LANDING_NOTES) {
        const t = t0 + item.time;
        if (item.type === 'chime') {
          playCrystalChimeVoice(item.freq, t, item.dur, item.gain);
        } else if (item.type === 'piano') {
          playFeltPianoVoice(item.freq, t, item.dur, item.gain);
        } else if (item.type === 'chord') {
          playFeltPianoVoice(item.freq, t, item.dur, item.gain, true);
        }
      }
    },

    playBloomChime() {
      if (!ctx || !isEnabled) return;
      duckAmbience(1.5, 0.45);
      const t0 = ctx.currentTime;

      for (const item of BLOOM_NOTES) {
        const t = t0 + item.time;
        if (item.type === 'grace') {
          playCrystalChimeVoice(item.freq, t, item.dur, item.gain);
        } else {
          playCrystalChimeVoice(item.freq, t, item.dur, item.gain);
        }
      }
    },

    playEmbraceHarmony() {
      if (!ctx || !isEnabled) return;
      duckAmbience(2.8, 0.32);
      const t0 = ctx.currentTime;

      // Rolled Dadd9 / Dmaj7sus2 felt piano chord
      for (let i = 0; i < EMBRACE_NOTES.length; i++) {
        const item = EMBRACE_NOTES[i];
        const t = t0 + item.time;
        if (i === EMBRACE_NOTES.length - 1) {
          // Highest note accompanied by delicate crystal whisper
          playFeltPianoVoice(item.freq, t, item.dur, item.gain * 0.7);
          playCrystalChimeVoice(item.freq, t, item.dur, item.gain * 0.5);
        } else {
          playFeltPianoVoice(item.freq, t, item.dur, item.gain);
        }
      }
    },
  };

  return engine;
}
