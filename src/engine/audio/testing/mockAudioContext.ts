/**
 * Minimal Web Audio mock for unit tests (node environment). It records graph construction and scheduling so
 * tests can assert what was built, without producing sound. Only the surface used by src/engine/audio is mocked.
 */

export type ParamEvent = { type: string; value: number; time: number };

export class MockAudioParam {
  value: number;
  events: ParamEvent[] = [];
  /** Nodes connected into this param (modulation). */
  inputs: MockAudioNode[] = [];
  constructor(v = 0) {
    this.value = v;
  }
  private rec(type: string, value: number, time: number): this {
    if (!Number.isFinite(value) || !Number.isFinite(time)) throw new TypeError(`${type}: non-finite ${value} @ ${time}`);
    this.events.push({ type, value, time });
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    this.value = v;
    return this.rec('set', v, t);
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    return this.rec('linear', v, t);
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (v === 0) throw new RangeError('exponentialRampToValueAtTime: value must be non-zero');
    this.value = v;
    return this.rec('exp', v, t);
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    if (!(tau > 0)) throw new RangeError('setTargetAtTime: timeConstant must be > 0');
    this.value = v;
    return this.rec('target', v, t);
  }
  cancelScheduledValues(t: number): this {
    return this.rec('cancel', 0, t);
  }
  cancelAndHoldAtTime(t: number): this {
    return this.rec('cancelHold', 0, t);
  }
}

export class MockAudioNode {
  outputs: (MockAudioNode | MockAudioParam)[] = [];
  disconnected = false;
  constructor(
    readonly context: MockAudioContext,
    readonly nodeType: string,
  ) {
    context.created.push(this);
  }
  connect<T extends MockAudioNode | MockAudioParam>(dest: T): T {
    this.outputs.push(dest);
    if (dest instanceof MockAudioParam) dest.inputs.push(this);
    return dest;
  }
  disconnect(): void {
    this.outputs = [];
    this.disconnected = true;
  }
}

export class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
  constructor(c: MockAudioContext) {
    super(c, 'gain');
  }
}

export class MockScheduledSource extends MockAudioNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0): void {
    if (this.startTime !== null) throw new Error('InvalidStateError: start() called twice');
    if (!Number.isFinite(when)) throw new TypeError('start: non-finite');
    this.startTime = when;
    this.context.started.push(this);
  }
  stop(when = 0): void {
    if (this.startTime === null) throw new Error('InvalidStateError: stop() before start()');
    this.stopTime = when;
  }
}

export class MockOscillatorNode extends MockScheduledSource {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam(440);
  detune = new MockAudioParam(0);
  constructor(c: MockAudioContext) {
    super(c, 'oscillator');
  }
}

export class MockBufferSourceNode extends MockScheduledSource {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  playbackRate = new MockAudioParam(1);
  detune = new MockAudioParam(0);
  constructor(c: MockAudioContext) {
    super(c, 'bufferSource');
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockAudioParam(350);
  Q = new MockAudioParam(1);
  gain = new MockAudioParam(0);
  detune = new MockAudioParam(0);
  constructor(c: MockAudioContext) {
    super(c, 'biquad');
  }
}

export class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam(0);
  constructor(c: MockAudioContext) {
    super(c, 'panner');
  }
}

export class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-24);
  knee = new MockAudioParam(30);
  ratio = new MockAudioParam(12);
  attack = new MockAudioParam(0.003);
  release = new MockAudioParam(0.25);
  reduction = 0;
  constructor(c: MockAudioContext) {
    super(c, 'compressor');
  }
}

export class MockConvolverNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  normalize = true;
  constructor(c: MockAudioContext) {
    super(c, 'convolver');
  }
}

export class MockWaveShaperNode extends MockAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
  constructor(c: MockAudioContext) {
    super(c, 'waveshaper');
  }
}

export class MockAudioBuffer {
  private readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    const d = this.data[ch];
    if (!d) throw new RangeError('channel');
    return d;
  }
}

export class MockAudioContext {
  currentTime = 0;
  /** Low sample rate keeps generated buffers (noise, impulse) small in tests. */
  sampleRate = 8000;
  state: AudioContextState = 'suspended';
  created: MockAudioNode[] = [];
  started: MockScheduledSource[] = [];
  readonly destination: MockAudioNode;
  resumeCalls = 0;
  closed = false;

  constructor() {
    this.destination = new MockAudioNode(this, 'destination');
  }

  /** Advance the clock (tests). */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const s of this.started) {
      if (s.stopTime !== null && s.stopTime <= this.currentTime && s.onended) {
        const cb = s.onended;
        s.onended = null;
        cb();
      }
    }
  }

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }

  createGain(): MockGainNode {
    return new MockGainNode(this);
  }
  createOscillator(): MockOscillatorNode {
    return new MockOscillatorNode(this);
  }
  createBufferSource(): MockBufferSourceNode {
    return new MockBufferSourceNode(this);
  }
  createBiquadFilter(): MockBiquadFilterNode {
    return new MockBiquadFilterNode(this);
  }
  createStereoPanner(): MockStereoPannerNode {
    return new MockStereoPannerNode(this);
  }
  createDynamicsCompressor(): MockDynamicsCompressorNode {
    return new MockDynamicsCompressorNode(this);
  }
  createConvolver(): MockConvolverNode {
    return new MockConvolverNode(this);
  }
  createWaveShaper(): MockWaveShaperNode {
    return new MockWaveShaperNode(this);
  }
  createBuffer(channels: number, length: number, rate: number): MockAudioBuffer {
    return new MockAudioBuffer(channels, length, rate);
  }

  /** Count of created nodes by type. */
  count(type: string): number {
    return this.created.filter((n) => n.nodeType === type).length;
  }

  /** Cast for APIs typed against the real Web Audio interfaces. */
  asContext(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}
