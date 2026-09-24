import { RULES, type Game } from '../engine/game';
import { byId } from './dom';

const DANGER_OVERLOAD = 0.6;
const LOW_ENERGY = 0.25;

/** How the current run labels its levels and lives. */
export interface RunLabels {
  /** e.g. "07" in the campaign, "T2" in training. */
  level: string;
  unlimitedLives: boolean;
}

/** The DOM heads-up display: meters, score, lives, level number and the action buttons. */
export class Hud {
  private readonly root = byId('hud');
  private readonly levelNumber = byId('hud-level-number');
  private readonly energy = byId('hud-energy');
  private readonly energyBar = byId('hud-energy-bar');
  private readonly overload = byId('hud-overload');
  private readonly overloadBar = byId('hud-overload-bar');
  private readonly overloadMeter = byId('hud-overload-meter');
  private readonly energyMeter = this.energy.closest('.meter') as HTMLElement;
  private readonly energyLabel = this.energyMeter.querySelector('.meter-label') as HTMLElement;
  private readonly pods = byId('hud-pods');
  private readonly score = byId('hud-score');
  private readonly lives = byId('hud-lives');
  private readonly mute = byId('hud-mute');
  private readonly undo = byId<HTMLButtonElement>('hud-undo');
  private readonly redo = byId<HTMLButtonElement>('hud-redo');

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setMuted(muted: boolean): void {
    this.mute.classList.toggle('off', muted);
    this.mute.setAttribute('aria-pressed', String(muted));
  }

  update(game: Game, labels: RunLabels): void {
    this.levelNumber.textContent = labels.level;
    const charge = game.isCharging ? 1 - game.chargeRemaining / RULES.chargeSeconds : 1;
    const energy = game.energy * charge;
    this.energy.style.transform = `scaleX(${energy})`;
    this.energyBar.setAttribute('aria-valuenow', String(Math.round(energy * 100)));
    const clock = Number.isFinite(game.timeRemaining) ? ` · ${Math.ceil(game.timeRemaining)}s left` : '';
    this.energyLabel.textContent = game.isCharging ? 'Charging laser' : `Energy${clock}`;
    this.overload.style.transform = `scaleX(${game.overload})`;
    this.overloadBar.setAttribute('aria-valuenow', String(Math.round(game.overload * 100)));
    this.overloadMeter.classList.toggle('danger', game.overload > DANGER_OVERLOAD);
    this.energyMeter.classList.toggle('low', game.energy < LOW_ENERGY);
    this.pods.textContent = game.receiverOpen ? 'OPEN' : String(game.podsRemaining);
    this.score.textContent = game.score.toLocaleString('en-US');
    this.lives.textContent = labels.unlimitedLives ? '∞' : '◆'.repeat(Math.max(0, game.lives));
    this.lives.setAttribute('aria-label', labels.unlimitedLives ? 'Unlimited lives' : `${game.lives} lives`);
    this.undo.disabled = !game.canUndo;
    this.redo.disabled = !game.canRedo;
  }
}
