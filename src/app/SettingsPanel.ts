import { byId } from './dom';
import type { Difficulty } from '../engine/difficulty';
import type { Quality, Settings } from './progress';

/** Binds the settings screen's controls to a settings object; every change is reported immediately. */
export class SettingsPanel {
  private readonly music = byId<HTMLInputElement>('setting-music');
  private readonly effects = byId<HTMLInputElement>('setting-effects');
  private readonly hints = byId<HTMLInputElement>('setting-hints');
  private readonly reducedMotion = byId<HTMLInputElement>('setting-reduced-motion');
  private readonly highContrast = byId<HTMLInputElement>('setting-high-contrast');
  private readonly quality = byId<HTMLSelectElement>('setting-quality');
  private readonly difficulty = byId<HTMLSelectElement>('setting-difficulty');

  constructor(onChange: (changes: Partial<Settings>) => void) {
    this.music.addEventListener('input', () => onChange({ musicVolume: Number(this.music.value) / 100 }));
    this.effects.addEventListener('input', () => onChange({ effectsVolume: Number(this.effects.value) / 100 }));
    this.hints.addEventListener('change', () => onChange({ hints: this.hints.checked }));
    this.reducedMotion.addEventListener('change', () => onChange({ reducedMotion: this.reducedMotion.checked }));
    this.highContrast.addEventListener('change', () => onChange({ highContrast: this.highContrast.checked }));
    this.quality.addEventListener('change', () => onChange({ quality: this.quality.value as Quality }));
    this.difficulty.addEventListener('change', () => onChange({ difficulty: this.difficulty.value as Difficulty }));
  }

  show(settings: Settings): void {
    this.music.value = String(Math.round(settings.musicVolume * 100));
    this.effects.value = String(Math.round(settings.effectsVolume * 100));
    this.hints.checked = settings.hints;
    this.reducedMotion.checked = settings.reducedMotion;
    this.highContrast.checked = settings.highContrast;
    this.quality.value = settings.quality;
    this.difficulty.value = settings.difficulty;
    this.difficulty.focus();
  }
}
