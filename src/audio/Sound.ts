/** Chord roots (Hz) for the ambient pad: Am – F – C – G. */
const PAD_CHORDS = [
  [110, 130.81, 164.81],
  [87.31, 110, 130.81],
  [130.81, 164.81, 196],
  [98, 123.47, 146.83],
];
const PAD_CHORD_SECONDS = 6;
const MASTER_LEVEL = 0.6;

export interface AudioSettings {
  muted: boolean;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  effectsVolume: number;
}

export type SoundName =
  | 'chargeUp'
  | 'mirrorTick'
  | 'connect'
  | 'podPop'
  | 'gateOpen'
  | 'levelComplete'
  | 'lifeLost'
  | 'alarm'
  | 'locked'
  | 'shatter'
  | 'uiClick';

/**
 * Every sound is synthesized with Web Audio: no asset files. Music and effects run through separate
 * buses so each has its own volume. The context is created on the first user gesture because
 * browsers refuse to start audio before one.
 */
export class Sound {
  /** Names of the effects triggered so far (newest last), so feedback can be verified in tests. */
  readonly played: SoundName[] = [];
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private hum?: { gain: GainNode; filter: BiquadFilterNode; oscillator: OscillatorNode };
  private padVoices: OscillatorNode[] = [];
  private alarmCooldown = 0;
  private settings: AudioSettings;

  constructor(settings: AudioSettings) {
    this.settings = { ...settings };
  }

  get isMuted(): boolean {
    return this.settings.muted;
  }

  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.effectsBus = this.context.createGain();
    this.musicBus.connect(this.master);
    this.effectsBus.connect(this.master);
    this.master.connect(this.context.destination);
    this.applySettings();
    this.startHum();
    this.startPad();
  }

  /** Silences music and effects while the game is out of sight; browsers otherwise keep playing it. */
  suspend(): void {
    void this.context?.suspend();
  }

  resume(): void {
    void this.context?.resume();
  }

  get state(): AudioContextState | 'not started' {
    return this.context?.state ?? 'not started';
  }

  update(settings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.applySettings();
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
      this.effect('alarm', () => this.tone({ type: 'square', from: 880, to: 880, duration: 0.07, volume: 0.05 }));
      this.alarmCooldown = 0.45 - overload * 0.3;
    }
  }

  chargeUp(): void {
    this.effect('chargeUp', () => this.tone({ type: 'sawtooth', from: 110, to: 880, duration: 1.9, volume: 0.05 }));
  }

  /** A short mechanical ratchet: a click of noise over a falling blip. */
  mirrorTick(): void {
    this.effect('mirrorTick', () => {
      this.tone({ type: 'triangle', from: 1500, to: 800, duration: 0.035, volume: 0.06 });
      this.noise(0.025, 0.05, 6000);
    });
  }

  /** The beam has just been lined up on something worth hitting. */
  connect(): void {
    this.effect('connect', () => {
      this.tone({ type: 'sine', from: 880, to: 880, duration: 0.12, volume: 0.07 });
      this.tone({ type: 'sine', from: 1318.5, to: 1318.5, duration: 0.2, volume: 0.06, delay: 0.06 });
    });
  }

  /** A dull buzz: that mirror has no turns left. */
  locked(): void {
    this.effect('locked', () => this.tone({ type: 'square', from: 140, to: 110, duration: 0.12, volume: 0.06 }));
  }

  shatter(): void {
    this.effect('shatter', () => {
      this.noise(0.35, 0.16, 7000);
      this.tone({ type: 'triangle', from: 2400, to: 600, duration: 0.25, volume: 0.05 });
    });
  }

  podPop(): void {
    this.effect('podPop', () => {
      this.tone({ type: 'sine', from: 300, to: 1300, duration: 0.18, volume: 0.18 });
      this.noise(0.12, 0.08, 3000);
    });
  }

  gateOpen(): void {
    this.effect('gateOpen', () => this.tone({ type: 'triangle', from: 220, to: 660, duration: 0.5, volume: 0.1 }));
  }

  levelComplete(): void {
    this.effect('levelComplete', () =>
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) =>
        this.tone({ type: 'triangle', from: frequency, to: frequency, duration: 0.35, volume: 0.12, delay: index * 0.09 }),
      ),
    );
  }

  lifeLost(): void {
    this.effect('lifeLost', () => {
      this.tone({ type: 'sawtooth', from: 440, to: 55, duration: 0.9, volume: 0.15 });
      this.noise(0.6, 0.18, 900);
    });
  }

  uiClick(): void {
    this.effect('uiClick', () => this.tone({ type: 'sine', from: 660, to: 990, duration: 0.06, volume: 0.06 }));
  }

  private effect(name: SoundName, play: () => void): void {
    this.played.push(name);
    if (this.played.length > 50) this.played.shift();
    play();
  }

  private applySettings(): void {
    if (!this.context || !this.master || !this.musicBus || !this.effectsBus) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : MASTER_LEVEL, now, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume, now, 0.05);
    this.effectsBus.gain.setTargetAtTime(this.settings.effectsVolume, now, 0.05);
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
    oscillator.connect(filter).connect(gain).connect(this.effectsBus!);
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
    filter.connect(gain).connect(this.musicBus!);
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
    if (!this.context || !this.effectsBus) return;
    const start = this.context.currentTime + (options.delay ?? 0);
    const oscillator = this.context.createOscillator();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(options.to, start + options.duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(options.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
    oscillator.connect(gain).connect(this.effectsBus);
    oscillator.start(start);
    oscillator.stop(start + options.duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number): void {
    if (!this.context || !this.effectsBus) return;
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
    source.connect(filter).connect(gain).connect(this.effectsBus);
    source.start();
  }
}
