/** Chord roots (Hz) for the ambient pad: Am – F – C – G. */
const PAD_CHORDS = [
  [110, 130.81, 164.81],
  [87.31, 110, 130.81],
  [130.81, 164.81, 196],
  [98, 123.47, 146.83],
];
const PAD_CHORD_SECONDS = 6;

/**
 * Every sound is synthesized with Web Audio: no asset files. The context is created on the
 * first user gesture because browsers refuse to start audio before one.
 */
export class Sound {
  private context?: AudioContext;
  private master?: GainNode;
  private hum?: { gain: GainNode; filter: BiquadFilterNode; oscillator: OscillatorNode };
  private padVoices: OscillatorNode[] = [];
  private alarmCooldown = 0;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.context.destination);
    this.startHum();
    this.startPad();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.context.currentTime, 0.05);
  }

  /** The laser drone: louder while firing, brighter and higher as overload builds. */
  updateLaser(active: boolean, overload: number, seconds: number): void {
    if (!this.context || !this.hum) return;
    const now = this.context.currentTime;
    this.hum.gain.gain.setTargetAtTime(active ? 0.05 + overload * 0.06 : 0, now, 0.08);
    this.hum.filter.frequency.setTargetAtTime(300 + overload * 2200, now, 0.08);
    this.hum.oscillator.frequency.setTargetAtTime(55 + overload * 55, now, 0.1);
    this.alarmCooldown -= seconds;
    if (active && overload > 0.45 && this.alarmCooldown <= 0) {
      this.tone({ type: 'square', from: 880, to: 880, duration: 0.07, volume: 0.05 });
      this.alarmCooldown = 0.45 - overload * 0.3;
    }
  }

  chargeUp(): void {
    this.tone({ type: 'sawtooth', from: 110, to: 880, duration: 1.9, volume: 0.05 });
  }

  mirrorTick(): void {
    this.tone({ type: 'triangle', from: 1400, to: 900, duration: 0.03, volume: 0.05 });
  }

  podPop(): void {
    this.tone({ type: 'sine', from: 300, to: 1300, duration: 0.18, volume: 0.18 });
    this.noise(0.12, 0.08, 3000);
  }

  levelComplete(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) =>
      this.tone({ type: 'triangle', from: frequency, to: frequency, duration: 0.35, volume: 0.12, delay: index * 0.09 }),
    );
  }

  lifeLost(): void {
    this.tone({ type: 'sawtooth', from: 440, to: 55, duration: 0.9, volume: 0.15 });
    this.noise(0.6, 0.18, 900);
  }

  uiClick(): void {
    this.tone({ type: 'sine', from: 660, to: 990, duration: 0.06, volume: 0.06 });
  }

  private startHum(): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 55;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = context.createGain();
    gain.gain.value = 0;
    oscillator.connect(filter).connect(gain).connect(this.master!);
    oscillator.start();
    this.hum = { gain, filter, oscillator };
  }

  private startPad(): void {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = context.createGain();
    gain.gain.value = 0.045;
    filter.connect(gain).connect(this.master!);
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.frequency.value = 0.07;
    lfoDepth.gain.value = 350;
    lfo.connect(lfoDepth).connect(filter.frequency);
    lfo.start();
    this.padVoices = PAD_CHORDS[0].flatMap((frequency) =>
      [-6, 6].map((detune) => {
        const voice = context.createOscillator();
        voice.type = 'sawtooth';
        voice.frequency.value = frequency;
        voice.detune.value = detune;
        voice.connect(filter);
        voice.start();
        return voice;
      }),
    );
    let chord = 0;
    window.setInterval(() => {
      chord = (chord + 1) % PAD_CHORDS.length;
      this.padVoices.forEach((voice, index) =>
        voice.frequency.setTargetAtTime(PAD_CHORDS[chord][Math.floor(index / 2)], context.currentTime, 0.8),
      );
    }, PAD_CHORD_SECONDS * 1000);
  }

  private tone(options: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    volume: number;
    delay?: number;
  }): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + (options.delay ?? 0);
    const oscillator = this.context.createOscillator();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(options.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + options.duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number): void {
    if (!this.context || !this.master) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) samples[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }
}
