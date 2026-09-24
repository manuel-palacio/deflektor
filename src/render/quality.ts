export type EffectsLevel = 'high' | 'low';

const WINDOW_SECONDS = 2;
const MIN_FRAMES_PER_SECOND = 45;
/** Ignore the first moments after start-up, when shaders compile and frames are always slow. */
const WARM_UP_SECONDS = 3;

/**
 * Picks how heavy the effects can be. 'auto' starts high and drops to low for good if the frame
 * rate stays below 45 fps for a couple of seconds (typically a mid-range phone with bloom on).
 */
export class QualityGovernor {
  private elapsed = 0;
  private windowTime = 0;
  private windowFrames = 0;
  private degraded = false;

  constructor(private preference: 'auto' | EffectsLevel = 'auto') {}

  get level(): EffectsLevel {
    if (this.preference !== 'auto') return this.preference;
    return this.degraded ? 'low' : 'high';
  }

  setPreference(preference: 'auto' | EffectsLevel): void {
    this.preference = preference;
  }

  /** Feeds one frame's duration; returns the effects level to use. */
  sample(frameSeconds: number): EffectsLevel {
    this.elapsed += frameSeconds;
    if (this.preference === 'auto' && !this.degraded && this.elapsed > WARM_UP_SECONDS) {
      this.windowTime += frameSeconds;
      this.windowFrames++;
      if (this.windowTime >= WINDOW_SECONDS) {
        if (this.windowFrames / this.windowTime < MIN_FRAMES_PER_SECOND) this.degraded = true;
        this.windowTime = 0;
        this.windowFrames = 0;
      }
    }
    return this.level;
  }
}
