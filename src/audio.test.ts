import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createAudioEngine,
  midiToFreq,
  centsToRatio,
  clampGain,
  calculateWaterGain,
  calculateWaterFactor,
  calculateWindParams,
  calculateRainParams,
  NOTE_FREQUENCIES,
  PENTATONIC_FREQUENCIES,
  HANDHOLD_NOTES,
  TAKEOFF_NOTES,
  LANDING_NOTES,
  BLOOM_NOTES,
  EMBRACE_NOTES,
} from './audio.ts';

// ============================================================================
// Zero-Dependency Web Audio API Mocks for Node.js Runner
// ============================================================================

export interface MockParamCall {
  method: string;
  args: unknown[];
}

export class MockAudioParam {
  value: number;
  readonly calls: MockParamCall[] = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', args: [value, time] });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', args: [value, time] });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'exponentialRampToValueAtTime', args: [value, time] });
    return this;
  }

  setTargetAtTime(target: number, time: number, constant: number): this {
    this.calls.push({ method: 'setTargetAtTime', args: [target, time, constant] });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.calls.push({ method: 'cancelScheduledValues', args: [time] });
    return this;
  }
}

export class MockAudioNode {
  readonly connections: unknown[] = [];
  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

export class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
}

export class MockOscillatorNode extends MockAudioNode {
  type = 'sine';
  readonly frequency = new MockAudioParam(440);
  readonly detune = new MockAudioParam(0);
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  type = 'lowpass';
  readonly frequency = new MockAudioParam(350);
  readonly Q = new MockAudioParam(1);
  readonly gain = new MockAudioParam(0);
}

export class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class MockDynamicsCompressorNode extends MockAudioNode {
  readonly threshold = new MockAudioParam(-24);
  readonly knee = new MockAudioParam(30);
  readonly ratio = new MockAudioParam(12);
  readonly attack = new MockAudioParam(0.003);
  readonly release = new MockAudioParam(0.25);
}

export class MockAudioContext {
  state = 'running';
  currentTime = 1.0;
  sampleRate = 44100;
  readonly destination = new MockAudioNode();
  readonly createdOscillators: MockOscillatorNode[] = [];
  readonly createdGains: MockGainNode[] = [];
  readonly createdFilters: MockBiquadFilterNode[] = [];
  readonly createdBufferSources: MockAudioBufferSourceNode[] = [];
  readonly createdCompressors: MockDynamicsCompressorNode[] = [];

  createGain(): MockGainNode {
    const g = new MockGainNode();
    this.createdGains.push(g);
    return g;
  }

  createOscillator(): MockOscillatorNode {
    const osc = new MockOscillatorNode();
    this.createdOscillators.push(osc);
    return osc;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const f = new MockBiquadFilterNode();
    this.createdFilters.push(f);
    return f;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    const channel = new Float32Array(length);
    return {
      numberOfChannels,
      length,
      sampleRate,
      getChannelData: () => channel,
    };
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const src = new MockAudioBufferSourceNode();
    this.createdBufferSources.push(src);
    return src;
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const comp = new MockDynamicsCompressorNode();
    this.createdCompressors.push(comp);
    return comp;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

// ============================================================================
// Comprehensive Unit Test Matrix
// ============================================================================

test('equal temperament notes match standard pitch table', () => {
  // Standard 12-TET check: A4 = 440 Hz
  assert.equal(Math.round(midiToFreq(69) * 100) / 100, 440.00);

  // Middle C (C4) = ~261.63 Hz
  assert.equal(Math.round(midiToFreq(60) * 100) / 100, 261.63);

  // High C (C5) = ~523.25 Hz
  assert.equal(Math.round(midiToFreq(72) * 100) / 100, 523.25);

  // A3 = 220.00 Hz
  assert.equal(Math.round(midiToFreq(57) * 100) / 100, 220.00);

  // Exact octave frequency doubling
  assert.equal(midiToFreq(81) / midiToFreq(69), 2.0);
  assert.equal(midiToFreq(69) / midiToFreq(57), 2.0);

  // Public scale tables verify expected peaceful tones
  assert.equal(NOTE_FREQUENCIES.A4, 440.00);
  assert.equal(PENTATONIC_FREQUENCIES.length, 11);
});

test('cents to frequency ratio formula produces accurate microtonal intervals', () => {
  // 0 cents = unison 1.0
  assert.equal(centsToRatio(0), 1.0);

  // 1200 cents = 1 octave = 2.0
  assert.equal(centsToRatio(1200), 2.0);

  // -1200 cents = 1 octave down = 0.5
  assert.equal(centsToRatio(-1200), 0.5);

  // Warm acoustic piano unison detune (+2.2 cents)
  const detune = centsToRatio(2.2);
  assert.ok(Math.abs(detune - 1.001272) < 0.0001);
});

test('gain clamping strictly bounds audio levels between zero and safe ceiling', () => {
  // Below min
  assert.equal(clampGain(-0.75), 0);
  // Above max
  assert.equal(clampGain(1.4), 1);
  // Custom range
  assert.equal(clampGain(0.7, 0, 0.5), 0.5);
  // Safe pass-through
  assert.equal(clampGain(0.42), 0.42);

  // Non-finite values safely return min
  assert.equal(clampGain(Number.NaN), 0);
  assert.equal(clampGain(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampGain(Number.NEGATIVE_INFINITY), 0);
});

test('water proximity decay calculates smooth distance falloff', () => {
  // Within core presence zone (<= 6m): full murmur gain
  assert.equal(calculateWaterGain(0), 0.016);
  assert.equal(calculateWaterGain(3.5), 0.016);
  assert.equal(calculateWaterGain(6.0), 0.016);

  // Beyond boundary (>= 24m): silent
  assert.equal(calculateWaterGain(24.0), 0);
  assert.equal(calculateWaterGain(35.0), 0);

  // Negative distances clamp safely to max
  assert.equal(calculateWaterGain(-5.0), 0.016);

  // Non-finite values safely yield 0
  assert.equal(calculateWaterGain(Number.NaN), 0);
  assert.equal(calculateWaterGain(Number.POSITIVE_INFINITY), 0);

  // Midpoint at 15m (halfway between 6m and 24m) produces ~0.008
  const midGain = calculateWaterGain(15.0);
  assert.ok(Math.abs(midGain - 0.008) < 0.0001);

  // Strictly monotonic decreasing from 6m to 24m
  const g7 = calculateWaterGain(7.0);
  const g10 = calculateWaterGain(10.0);
  const g15 = calculateWaterGain(15.0);
  const g20 = calculateWaterGain(20.0);
  const g23 = calculateWaterGain(23.0);
  assert.ok(g7 > g10 && g10 > g15 && g15 > g20 && g20 > g23);

  // Normalized water factor
  assert.equal(calculateWaterFactor(0), 1.0);
  assert.equal(calculateWaterFactor(24.0), 0.0);
});

test('audio engine initializes safely with mock context', () => {
  const mock = new MockAudioContext();
  const engine = createAudioEngine();

  engine.enable(mock as unknown as AudioContext);

  // Graph nodes created: master, limiter, ambienceBus, sfxBus, windGain, rainGain, waterGain1, waterGain2, waterMasterGain
  assert.ok(mock.createdGains.length >= 5);
  assert.ok(mock.createdFilters.length >= 4);
  assert.ok(mock.createdBufferSources.length >= 1);

  // Master compressor limiter configured
  assert.equal(mock.createdCompressors.length, 1);
  const comp = mock.createdCompressors[0];
  assert.ok(comp.threshold.calls.some(c => c.args[0] === -12));

  // Ambient noise loop started
  const noise = mock.createdBufferSources[0];
  assert.equal(noise.loop, true);
  assert.notEqual(noise.startedAt, null);

  // Calling enable again is idempotent (does not duplicate graph)
  const initialGainsCount = mock.createdGains.length;
  engine.enable(mock as unknown as AudioContext);
  assert.equal(mock.createdGains.length, initialGainsCount);
});

test('audio engine gracefully no-ops when AudioContext is unavailable', () => {
  const engine = createAudioEngine();

  // In Node environment without mock, enable safely returns without throwing
  assert.doesNotThrow(() => {
    engine.enable();
  });

  // All motif and ambience calls safely no-op
  assert.doesNotThrow(() => {
    engine.updateAmbience(0.5, 0.5, 12);
    engine.playHandholdChime();
    engine.playFlightTakeoff();
    engine.playFlightLanding();
    engine.playBloomChime();
    engine.playEmbraceHarmony();
  });
});

test('updateAmbience modulates wind, rain, and water gain nodes', () => {
  const mock = new MockAudioContext();
  const engine = createAudioEngine();
  engine.enable(mock as unknown as AudioContext);

  // Advance time and update ambience
  mock.currentTime = 5.0;
  engine.updateAmbience(0.6, 0.4, 15.0);

  // Find wind filter and gain automations
  const windFilter = mock.createdFilters.find(f => f.type === 'lowpass' && f.frequency.value === 520);
  assert.ok(windFilter, 'Wind filter should exist');
  const windFreqCalls = windFilter.frequency.calls.filter(c => c.method === 'setTargetAtTime');
  assert.ok(windFreqCalls.length >= 1);
  const expectedCutoff = 320 + 0.6 * 400; // 560 Hz
  assert.equal(windFreqCalls[0].args[0], expectedCutoff);

  // Water master gain setTargetAtTime called with midpoint gain (0.008)
  const allGainCalls = mock.createdGains.flatMap(g => g.gain.calls.filter(c => c.method === 'setTargetAtTime'));
  const waterCalls = allGainCalls.filter(c => Math.abs(Number(c.args[0]) - 0.008) < 0.0001);
  assert.ok(waterCalls.length >= 1, 'Water master gain should automate towards distance attenuation');
});

test('playHandholdChime schedules ascending pentatonic notes', () => {
  const mock = new MockAudioContext();
  const engine = createAudioEngine();
  engine.enable(mock as unknown as AudioContext);

  const prevOscCount = mock.createdOscillators.length;
  engine.playHandholdChime();

  const newOscs = mock.createdOscillators.slice(prevOscCount);
  assert.ok(newOscs.length >= 5, 'Handhold chime should schedule at least 5 voice oscillators');

  // Verify all scheduled oscillators have start() and stop() called
  for (const osc of newOscs) {
    assert.notEqual(osc.startedAt, null);
    assert.notEqual(osc.stoppedAt, null);
    assert.ok(osc.stoppedAt! >= osc.startedAt!);
  }

  // Verify frequencies cover D Major Pentatonic ascent (440, 587.33, 739.99, 880, 1174.66)
  const freqs = newOscs.map(o => o.frequency.value);
  assert.ok(freqs.some(f => Math.abs(f - 440) < 1));
  assert.ok(freqs.some(f => Math.abs(f - 1174.66) < 1));
});

test('playFlightTakeoff and playFlightLanding trigger soaring and grounding envelopes', () => {
  const mock = new MockAudioContext();
  const engine = createAudioEngine();
  engine.enable(mock as unknown as AudioContext);

  // 1. Takeoff soaring glissando
  let prevOscCount = mock.createdOscillators.length;
  engine.playFlightTakeoff();
  const takeoffOscs = mock.createdOscillators.slice(prevOscCount);
  assert.ok(takeoffOscs.length >= 6, 'Flight takeoff should create ascending voice oscillators');
  // Includes low sub glide (146.83) and high apex bell (1174.66)
  const takeoffFreqs = takeoffOscs.map(o => (o.frequency.calls[0]?.args[0] as number) ?? o.frequency.value);
  assert.ok(takeoffFreqs.some(f => Math.abs(f - 146.83) < 1));
  assert.ok(takeoffFreqs.some(f => Math.abs(f - 1174.66) < 1));

  // 2. Landing grounding cadence
  prevOscCount = mock.createdOscillators.length;
  engine.playFlightLanding();
  const landingOscs = mock.createdOscillators.slice(prevOscCount);
  assert.ok(landingOscs.length >= 5, 'Flight landing should create descending steps and chord');
  // Descending chimes start at A5 (880) and resolve to D4 (293.66)
  const landingFreqs = landingOscs.map(o => o.frequency.value);
  assert.ok(landingFreqs.some(f => Math.abs(f - 880) < 1));
  assert.ok(landingFreqs.some(f => Math.abs(f - 293.66) < 1));
});

test('playBloomChime and playEmbraceHarmony produce crystal ping and warm chord', () => {
  const mock = new MockAudioContext();
  const engine = createAudioEngine();
  engine.enable(mock as unknown as AudioContext);

  // 1. Bloom Chime (High sparkle)
  let prevOscCount = mock.createdOscillators.length;
  engine.playBloomChime();
  const bloomOscs = mock.createdOscillators.slice(prevOscCount);
  assert.ok(bloomOscs.length >= 3, 'Bloom chime should schedule grace note and main crystal partials');
  const bloomFreqs = bloomOscs.map(o => o.frequency.value);
  assert.ok(bloomFreqs.some(f => Math.abs(f - 1318.51) < 1));
  assert.ok(bloomFreqs.some(f => Math.abs(f - 1479.98) < 1));

  // 2. Embrace Harmony (Lush rolled chord)
  prevOscCount = mock.createdOscillators.length;
  engine.playEmbraceHarmony();
  const embraceOscs = mock.createdOscillators.slice(prevOscCount);
  assert.ok(embraceOscs.length >= 6, 'Embrace should schedule multi-voice chord');
  const embraceFreqs = embraceOscs.map(o => o.frequency.value);
  assert.ok(embraceFreqs.some(f => Math.abs(f - 146.83) < 1));
  assert.ok(embraceFreqs.some(f => Math.abs(f - 880.00) < 1));
});

test('calculateWindParams and calculateRainParams provide accurate acoustic parameters', () => {
  const windZero = calculateWindParams(0);
  assert.equal(windZero.cutoff, 320);
  assert.equal(windZero.gain, 0.0035);

  const windFull = calculateWindParams(1.0);
  assert.equal(windFull.cutoff, 720);
  assert.equal(windFull.gain, 0.0085);

  const rainZero = calculateRainParams(0);
  assert.equal(rainZero.gain, 0);

  const rainFull = calculateRainParams(1.0);
  assert.equal(rainFull.gain, 0.008);
});
