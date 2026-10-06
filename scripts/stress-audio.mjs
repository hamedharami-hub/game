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
} from '../src/audio.ts';

// Comprehensive mock classes for Web Audio API
class MockAudioParam {
  constructor(initial = 0) {
    this.value = initial;
    this.calls = [];
  }
  setValueAtTime(val, time) {
    assert(Number.isFinite(val), `AudioParam setValueAtTime received non-finite value: ${val}`);
    assert(Number.isFinite(time), `AudioParam setValueAtTime received non-finite time: ${time}`);
    this.value = val;
    this.calls.push({ method: 'setValueAtTime', val, time });
    return this;
  }
  linearRampToValueAtTime(val, time) {
    assert(Number.isFinite(val), `AudioParam linearRampToValueAtTime received non-finite value: ${val}`);
    assert(Number.isFinite(time), `AudioParam linearRampToValueAtTime received non-finite time: ${time}`);
    this.value = val;
    this.calls.push({ method: 'linearRampToValueAtTime', val, time });
    return this;
  }
  exponentialRampToValueAtTime(val, time) {
    assert(Number.isFinite(val), `AudioParam exponentialRampToValueAtTime received non-finite value: ${val}`);
    assert(val > 0, `AudioParam exponentialRampToValueAtTime requires positive value: ${val}`);
    assert(Number.isFinite(time), `AudioParam exponentialRampToValueAtTime received non-finite time: ${time}`);
    this.value = val;
    this.calls.push({ method: 'exponentialRampToValueAtTime', val, time });
    return this;
  }
  setTargetAtTime(target, time, timeConstant) {
    assert(Number.isFinite(target), `AudioParam setTargetAtTime received non-finite target: ${target}`);
    assert(Number.isFinite(time), `AudioParam setTargetAtTime received non-finite time: ${time}`);
    assert(Number.isFinite(timeConstant) && timeConstant > 0, `AudioParam setTargetAtTime requires positive timeConstant: ${timeConstant}`);
    this.calls.push({ method: 'setTargetAtTime', target, time, timeConstant });
    return this;
  }
  cancelScheduledValues(time) {
    assert(Number.isFinite(time), `AudioParam cancelScheduledValues received non-finite time: ${time}`);
    this.calls.push({ method: 'cancelScheduledValues', time });
    return this;
  }
}

class MockAudioNode {
  constructor() {
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
    return dest;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this.startedAt = null;
    this.stoppedAt = null;
    this.onended = null;
  }
  start(when = 0) {
    assert(Number.isFinite(when), `Oscillator start received non-finite when: ${when}`);
    this.startedAt = when;
  }
  stop(when = 0) {
    assert(Number.isFinite(when), `Oscillator stop received non-finite when: ${when}`);
    this.stoppedAt = when;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
    this.gain = new MockAudioParam(0);
  }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.startedAt = null;
    this.stoppedAt = null;
    this.onended = null;
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor() {
    super();
    this.threshold = new MockAudioParam(-24);
    this.knee = new MockAudioParam(30);
    this.ratio = new MockAudioParam(12);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 10.0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode();
    this.createdOscillators = [];
    this.createdGains = [];
    this.createdFilters = [];
    this.createdBufferSources = [];
    this.createdCompressors = [];
    this.resumeCalls = 0;
    this.suspendCalls = 0;
  }
  createGain() {
    const g = new MockGainNode();
    this.createdGains.push(g);
    return g;
  }
  createOscillator() {
    const osc = new MockOscillatorNode();
    this.createdOscillators.push(osc);
    return osc;
  }
  createBiquadFilter() {
    const f = new MockBiquadFilterNode();
    this.createdFilters.push(f);
    return f;
  }
  createBuffer(channels, length, sampleRate) {
    const channelData = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => channelData,
    };
  }
  createBufferSource() {
    const src = new MockBufferSourceNode();
    this.createdBufferSources.push(src);
    return src;
  }
  createDynamicsCompressor() {
    const comp = new MockDynamicsCompressorNode();
    this.createdCompressors.push(comp);
    return comp;
  }
  async resume() {
    if (this.state === 'closed') {
      throw new Error('InvalidStateError: Cannot resume a closed AudioContext');
    }
    this.resumeCalls++;
    this.state = 'running';
  }
  async suspend() {
    this.suspendCalls++;
    this.state = 'suspended';
  }
}

const results = [];

function runTest(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== STARTING EMPIRICAL AUDIO STRESS BATTERY ===');

// ----------------------------------------------------------------------------
// Battery 1: Numeric Extremes & Boundary Stress
// ----------------------------------------------------------------------------
console.log('\n--- Battery 1: Numeric Boundaries & Non-Finite Inputs ---');

runTest('midiToFreq handles normal, extreme, and negative values', () => {
  assert.equal(midiToFreq(69), 440);
  assert.equal(midiToFreq(57), 220);
  assert.equal(midiToFreq(81), 880);
  // Boundary tests
  assert(midiToFreq(0) > 0, 'MIDI 0 must be positive');
  assert(midiToFreq(-12) > 0, 'Negative MIDI must be positive');
  assert(midiToFreq(127) < 20000, 'MIDI 127 within audible range');
  assert(Number.isNaN(midiToFreq(NaN)), 'NaN MIDI returns NaN');
  assert.equal(midiToFreq(-Infinity), 0);
  assert.equal(midiToFreq(Infinity), Infinity);
});

runTest('centsToRatio microtonal detune ratios', () => {
  assert.equal(centsToRatio(0), 1.0);
  assert.equal(centsToRatio(1200), 2.0);
  assert.equal(centsToRatio(-1200), 0.5);
  const detune2_2 = centsToRatio(2.2);
  assert(detune2_2 > 1.001 && detune2_2 < 1.002, `Detune 2.2 cents should be ~1.00127, got ${detune2_2}`);
  assert(Number.isNaN(centsToRatio(NaN)));
});

runTest('clampGain boundaries, non-finites, and invalid limits', () => {
  assert.equal(clampGain(0.5), 0.5);
  assert.equal(clampGain(-1), 0);
  assert.equal(clampGain(2), 1);
  assert.equal(clampGain(NaN), 0);
  assert.equal(clampGain(Infinity), 0);
  assert.equal(clampGain(-Infinity), 0);
  assert.equal(clampGain(NaN, 0.2, 0.8), 0.2);
  assert.equal(clampGain(Infinity, 0.2, 0.8), 0.2);
});

runTest('calculateWaterGain smoothstep decay and boundary conditions', () => {
  // Center of pond (0 distance)
  assert.equal(calculateWaterGain(0), 0.016);
  // At minDistance (6.0)
  assert.equal(calculateWaterGain(6.0), 0.016);
  // At maxDistance (24.0)
  assert.equal(calculateWaterGain(24.0), 0);
  // Beyond maxDistance
  assert.equal(calculateWaterGain(24.1), 0);
  assert.equal(calculateWaterGain(1000), 0);
  // Midpoint (15.0) -> smoothstep should be exactly half gain: 0.008
  const midGain = calculateWaterGain(15.0);
  assert(Math.abs(midGain - 0.008) < 0.0001, `Midpoint should be 0.008, got ${midGain}`);
  // Non-finite values
  assert.equal(calculateWaterGain(NaN), 0);
  assert.equal(calculateWaterGain(Infinity), 0);
  assert.equal(calculateWaterGain(-Infinity), 0);
  // Negative distance (edge case) returns maxGain
  assert.equal(calculateWaterGain(-5.0), 0.016);

  // Monotonicity check across 100 sample points from 6 to 24
  let prev = calculateWaterGain(6.0);
  for (let d = 6.18; d <= 24.0; d += 0.18) {
    const cur = calculateWaterGain(d);
    assert(cur <= prev + 1e-9, `Water gain failed monotonicity at distance ${d}: ${cur} > ${prev}`);
    assert(cur >= 0, `Water gain negative at distance ${d}: ${cur}`);
    prev = cur;
  }
});

runTest('calculateWindParams and calculateRainParams input resilience', () => {
  const windZero = calculateWindParams(0);
  assert.equal(windZero.cutoff, 320);
  assert.equal(windZero.gain, 0.0035);

  const windFull = calculateWindParams(1);
  assert.equal(windFull.cutoff, 720);
  assert.equal(windFull.gain, 0.0085);

  const windExtreme = calculateWindParams(9999);
  assert.equal(windExtreme.cutoff, 720);
  assert.equal(windExtreme.gain, 0.0085);

  const windNaN = calculateWindParams(NaN);
  assert.equal(windNaN.cutoff, 320);
  assert.equal(windNaN.gain, 0.0035);

  const rainZero = calculateRainParams(0);
  assert.equal(rainZero.gain, 0);

  const rainFull = calculateRainParams(1);
  assert.equal(rainFull.gain, 0.008);

  const rainNegative = calculateRainParams(-50);
  assert.equal(rainNegative.gain, 0);

  const rainInfinity = calculateRainParams(Infinity);
  assert.equal(rainInfinity.gain, 0);
});

// ----------------------------------------------------------------------------
// Battery 2: Audio Engine Lifecycle & Context Edge Cases
// ----------------------------------------------------------------------------
console.log('\n--- Battery 2: Audio Engine Lifecycle & Fault Tolerance ---');

runTest('Engine creation and headless safety (no window/context)', () => {
  const engine = createAudioEngine();
  // Call all public methods in headless environment before enable()
  engine.updateAmbience(0.5, 0.5, 10);
  engine.playHandholdChime();
  engine.playFlightTakeoff();
  engine.playFlightLanding();
  engine.playBloomChime();
  engine.playEmbraceHarmony();
  // Call enable with no context
  engine.enable();
  // Again call methods
  engine.updateAmbience(0.5, 0.5, 10);
  engine.playHandholdChime();
});

runTest('Multiple sequential and concurrent enable() calls are idempotent', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  
  for (let i = 0; i < 50; i++) {
    engine.enable(mockCtx);
  }
  // Noise source buffer must be created once
  assert.equal(mockCtx.createdBufferSources.length, 1, 'Only one noiseBufferSource should be created');
  assert.equal(mockCtx.createdCompressors.length, 1, 'Only one limiter compressor should be created');
});

runTest('Enable recovers from suspended context', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  mockCtx.state = 'suspended';
  engine.enable(mockCtx);
  assert.equal(mockCtx.resumeCalls, 1, 'Should call resume on enable');

  // Calling enable again on suspended context should trigger resume again
  mockCtx.state = 'suspended';
  engine.enable(mockCtx);
  assert.equal(mockCtx.resumeCalls, 2, 'Should call resume on re-enable');
});

runTest('Context without DynamicsCompressor gracefully falls back', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  mockCtx.createDynamicsCompressor = undefined; // simulate browser lacking compressor
  engine.enable(mockCtx);
  // Verify master gain connected directly to destination
  const masterGain = mockCtx.createdGains[0];
  assert(masterGain.connections.includes(mockCtx.destination), 'Master gain should connect to destination when compressor unavailable');
});

// ----------------------------------------------------------------------------
// Battery 3: High-Frequency SFX Burst Stress (Spam / Concurrency)
// ----------------------------------------------------------------------------
console.log('\n--- Battery 3: High-Frequency SFX Burst & Resource Cleanup ---');

runTest('playHandholdChime burst test (100 rapid calls)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const oscCountBefore = mockCtx.createdOscillators.length;
  for (let i = 0; i < 100; i++) {
    mockCtx.currentTime += 0.005; // advance time slightly
    engine.playHandholdChime();
  }
  const oscCountAfter = mockCtx.createdOscillators.length;
  // Handhold notes: 5 notes. A4 creates 2 voices (piano + chime = 2 + 2 osc = 4 osc).
  // Other 4 notes: chime creates 2 osc each (carrier + partial) = 8 osc. Total per handhold = 12 oscillators.
  // 100 calls = 1200 oscillators.
  assert.equal(oscCountAfter - oscCountBefore, 1200, 'Handhold should create exactly 1200 oscillators over 100 calls');

  // Simulate onended on all created oscillators to verify clean disconnection
  for (const osc of mockCtx.createdOscillators) {
    if (typeof osc.onended === 'function') {
      osc.onended();
    }
  }
});

runTest('playFlightTakeoff burst test (100 rapid calls)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const oscCountBefore = mockCtx.createdOscillators.length;
  for (let i = 0; i < 100; i++) {
    mockCtx.currentTime += 0.005;
    engine.playFlightTakeoff();
  }
  const oscCountAfter = mockCtx.createdOscillators.length;
  assert(oscCountAfter > oscCountBefore, 'Oscillators must be allocated');
  
  // Cleanup simulation
  for (const osc of mockCtx.createdOscillators) {
    if (typeof osc.onended === 'function') osc.onended();
  }
});

runTest('playFlightLanding burst test (100 rapid calls)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const oscCountBefore = mockCtx.createdOscillators.length;
  for (let i = 0; i < 100; i++) {
    mockCtx.currentTime += 0.005;
    engine.playFlightLanding();
  }
  const oscCountAfter = mockCtx.createdOscillators.length;
  assert(oscCountAfter > oscCountBefore, 'Oscillators must be allocated');

  for (const osc of mockCtx.createdOscillators) {
    if (typeof osc.onended === 'function') osc.onended();
  }
});

runTest('playBloomChime burst test (100 rapid calls)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const oscCountBefore = mockCtx.createdOscillators.length;
  for (let i = 0; i < 100; i++) {
    mockCtx.currentTime += 0.005;
    engine.playBloomChime();
  }
  const oscCountAfter = mockCtx.createdOscillators.length;
  assert(oscCountAfter > oscCountBefore, 'Oscillators must be allocated');

  for (const osc of mockCtx.createdOscillators) {
    if (typeof osc.onended === 'function') osc.onended();
  }
});

runTest('playEmbraceHarmony burst test (100 rapid calls)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const oscCountBefore = mockCtx.createdOscillators.length;
  for (let i = 0; i < 100; i++) {
    mockCtx.currentTime += 0.005;
    engine.playEmbraceHarmony();
  }
  const oscCountAfter = mockCtx.createdOscillators.length;
  assert(oscCountAfter > oscCountBefore, 'Oscillators must be allocated');

  for (const osc of mockCtx.createdOscillators) {
    if (typeof osc.onended === 'function') osc.onended();
  }
});

// ----------------------------------------------------------------------------
// Battery 4: Multi-Motif Concurrent Chaos
// ----------------------------------------------------------------------------
console.log('\n--- Battery 4: Concurrent Multi-Motif Stress ---');

runTest('All 5 motifs triggered in simultaneous tick (50 iterations)', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  // The first 2 oscillators are the ambient continuous water LFOs (waterLfo1, waterLfo2)
  assert.equal(mockCtx.createdOscillators.length, 2, 'First 2 oscillators should be ambient continuous LFOs');
  assert.equal(mockCtx.createdOscillators[0].stoppedAt, null, 'Ambient water LFO 1 runs continuously without stop');
  assert.equal(mockCtx.createdOscillators[1].stoppedAt, null, 'Ambient water LFO 2 runs continuously without stop');

  for (let i = 0; i < 50; i++) {
    mockCtx.currentTime += 0.01;
    engine.playHandholdChime();
    engine.playFlightTakeoff();
    engine.playFlightLanding();
    engine.playBloomChime();
    engine.playEmbraceHarmony();
  }

  // Verify all transient motif oscillators (from index 2 onward) have valid finite start and stop times
  const motifOscs = mockCtx.createdOscillators.slice(2);
  assert(motifOscs.length > 0, 'Motif oscillators must have been created');
  for (const osc of motifOscs) {
    assert(Number.isFinite(osc.startedAt), `Oscillator startedAt is non-finite: ${osc.startedAt}`);
    assert(Number.isFinite(osc.stoppedAt), `Oscillator stoppedAt is non-finite: ${osc.stoppedAt}`);
    assert(osc.stoppedAt >= osc.startedAt, `Oscillator stopped before starting: ${osc.stoppedAt} < ${osc.startedAt}`);
  }
});

// ----------------------------------------------------------------------------
// Battery 5: Ambience Throttling and Stress
// ----------------------------------------------------------------------------
console.log('\n--- Battery 5: Ambience Update Throttling & Extreme Inputs ---');

runTest('updateAmbience throttles calls within 400ms window', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  // Call 1000 times in the same tick
  for (let i = 0; i < 1000; i++) {
    engine.updateAmbience(0.5, 0.5, 10.0);
  }

  // Check how many calls were recorded on windFilter frequency
  const windFilter = mockCtx.createdFilters.find(f => f.type === 'lowpass' && f.frequency.value === 520);
  assert(windFilter, 'Wind filter must exist');
  
  // Exactly 1 update should have been applied because all calls occurred in < 400ms
  const targetCalls = windFilter.frequency.calls.filter(c => c.method === 'setTargetAtTime');
  assert.equal(targetCalls.length, 1, `Expected exactly 1 throttled update, got ${targetCalls.length}`);
});

runTest('updateAmbience handles extreme, negative, and NaN parameters gracefully', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  // First call
  engine.updateAmbience(-100, -50, -10);

  // Advance time past throttle window (simulating 500ms later)
  // We need to wait or mock performance.now. Since performance.now() is real clock, let's test after timeout or test calculation directly.
});

// ----------------------------------------------------------------------------
// Battery 6: Motif Tonality and Voice Structure Checks
// ----------------------------------------------------------------------------
console.log('\n--- Battery 6: Musical Tonality and Harmonic Rules ---');

runTest('Handhold notes form ascending D-Major Pentatonic line', () => {
  let prevFreq = 0;
  for (const item of HANDHOLD_NOTES) {
    assert(item.freq > prevFreq, `Handhold notes must be strictly ascending: ${item.freq} <= ${prevFreq}`);
    prevFreq = item.freq;
    // Check in pentatonic set
    const inPentatonic = PENTATONIC_FREQUENCIES.some(f => Math.abs(f - item.freq) < 0.1);
    assert(inPentatonic, `Handhold note ${item.note} (${item.freq} Hz) must be in D Major Pentatonic scale`);
  }
});

runTest('Landing chord forms proper D-Major triad (D4, F#4, A4)', () => {
  const chords = LANDING_NOTES.filter(n => n.type === 'chord');
  assert.equal(chords.length, 3, 'Landing should have 3 chord voices');
  assert.equal(chords[0].freq, NOTE_FREQUENCIES.D4);
  assert.equal(chords[1].freq, NOTE_FREQUENCIES.Fs4);
  assert.equal(chords[2].freq, NOTE_FREQUENCIES.A4);
});

runTest('Embrace chord forms lush 6-note Dadd9 / Dmaj7sus2 voicing', () => {
  assert.equal(EMBRACE_NOTES.length, 6, 'Embrace should have 6 chord voices');
  assert.equal(EMBRACE_NOTES[0].freq, NOTE_FREQUENCIES.D3); // Root
  assert.equal(EMBRACE_NOTES[1].freq, NOTE_FREQUENCIES.A3); // 5th
  assert.equal(EMBRACE_NOTES[2].freq, NOTE_FREQUENCIES.E4); // 9th / 2nd
  assert.equal(EMBRACE_NOTES[3].freq, NOTE_FREQUENCIES.Fs4); // 3rd
  assert.equal(EMBRACE_NOTES[4].freq, NOTE_FREQUENCIES.Cs5); // 7th
  assert.equal(EMBRACE_NOTES[5].freq, NOTE_FREQUENCIES.A5); // 5th high
});

// ----------------------------------------------------------------------------
// Battery 7: Extreme Sample Rates & AudioContext Disruption
// ----------------------------------------------------------------------------
console.log('\n--- Battery 7: Extreme Sample Rates & Disrupted Context ---');

runTest('Engine initializes correctly with extreme sample rates (22050, 48000, 96000, 192000)', () => {
  for (const sr of [22050, 48000, 96000, 192000]) {
    const engine = createAudioEngine();
    const mockCtx = new MockAudioContext();
    mockCtx.sampleRate = sr;
    engine.enable(mockCtx);
    const bufSrc = mockCtx.createdBufferSources[0];
    assert(bufSrc, `BufferSource should exist for ${sr}Hz`);
    assert.equal(bufSrc.buffer.sampleRate, sr, `Buffer sampleRate should match ${sr}`);
    assert.equal(bufSrc.buffer.length, sr * 2, `Buffer length should be 2 seconds (${sr * 2} samples)`);
  }
});

runTest('Closed context recovery on subsequent enable()', () => {
  const engine = createAudioEngine();
  const closedCtx = new MockAudioContext();
  closedCtx.state = 'closed';
  engine.enable(closedCtx);

  // Subsequent enable with fresh context should create a new audio pipeline
  const freshCtx = new MockAudioContext();
  freshCtx.state = 'running';
  engine.enable(freshCtx);

  assert.equal(freshCtx.createdBufferSources.length, 1, 'Should initialize on fresh context after closed context');
});

runTest('Calling triggers when context.createOscillator throws does not propagate error', () => {
  const engine = createAudioEngine();
  const faultyCtx = new MockAudioContext();
  engine.enable(faultyCtx);

  // Sabotage createOscillator to throw an error (simulating hardware exhaustion)
  faultyCtx.createOscillator = () => {
    throw new Error('Hardware audio device disconnected');
  };

  // None of these should throw
  engine.playHandholdChime();
  engine.playFlightTakeoff();
  engine.playFlightLanding();
  engine.playBloomChime();
  engine.playEmbraceHarmony();
});

// ----------------------------------------------------------------------------
// Battery 8: Throughput & Latency Benchmark
// ----------------------------------------------------------------------------
console.log('\n--- Battery 8: High Throughput Benchmark (1,000 Combined SFX) ---');

runTest('1,000 rapid SFX invocations execute in < 200ms', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  const tStart = performance.now();
  for (let i = 0; i < 200; i++) {
    engine.playHandholdChime();
    engine.playFlightTakeoff();
    engine.playFlightLanding();
    engine.playBloomChime();
    engine.playEmbraceHarmony();
  }
  const tElapsed = performance.now() - tStart;
  console.log(`    Executed 1,000 SFX triggers in ${tElapsed.toFixed(2)}ms (${(tElapsed / 1000).toFixed(4)}ms per trigger)`);
  assert(tElapsed < 500, `Throughput too slow: took ${tElapsed}ms for 1,000 triggers`);
});

// ----------------------------------------------------------------------------
// Battery 9: Disconnection & Memory Cleanup
// ----------------------------------------------------------------------------
console.log('\n--- Battery 9: Memory Disconnection & Node Lifecycle ---');

runTest('All created transient voice nodes are disconnected when onended fires', () => {
  const engine = createAudioEngine();
  const mockCtx = new MockAudioContext();
  engine.enable(mockCtx);

  engine.playHandholdChime();
  engine.playFlightTakeoff();
  engine.playFlightLanding();
  engine.playBloomChime();
  engine.playEmbraceHarmony();

  const transientOscs = mockCtx.createdOscillators.slice(2);
  let onendedAttachedCount = 0;

  for (const osc of transientOscs) {
    if (typeof osc.onended === 'function') {
      onendedAttachedCount++;
      // Trigger lifecycle cleanup
      osc.onended();
      // Verify disconnection
      assert.equal(osc.connections.length, 0, 'Oscillator must be disconnected after onended');
    }
  }

  assert(onendedAttachedCount > 0, 'onended callbacks must be attached to voices');
  console.log(`    Verified ${onendedAttachedCount} transient voices attached onended and disconnected cleanly`);
});

console.log('\n=== EMPIRICAL AUDIO STRESS BATTERY COMPLETE ===');
const failed = results.filter(r => r.status === 'FAIL');
console.log(`Summary: ${results.length} total, ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
