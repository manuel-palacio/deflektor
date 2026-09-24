import { RULES, type Game } from '../engine/game';
import { byId } from './dom';

const DANGER_OVERLOAD = 0.6;
const LOW_ENERGY = 0.25;

/** The DOM heads-up display: meters, score, lives and level title. */
export class Hud {
  private readonly root = byId('hud');
  private readonly levelNumber = byId('hud-level-number');
  private readonly energy = byId('hud-energy');
  private readonly overload = byId('hud-overload');
  private readonly overloadMeter = byId('hud-overload-meter');
  private readonly energyMeter = this.energy.closest('.meter') as HTMLElement;
  private readonly energyLabel = this.energyMeter.querySelector('.meter-label') as HTMLElement;
  private readonly pods = byId('hud-pods');
  private readonly score = byId('hud-score');
  private readonly lives = byId('hud-lives');
  private readonly mute = byId('hud-mute');

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setMuted(muted: boolean): void {
    this.mute.classList.toggle('off', muted);
  }

  update(game: Game): void {
    this.levelNumber.textContent = String(game.levelIndex + 1).padStart(2, '0');
    const charge = game.isCharging ? 1 - game.chargeRemaining / RULES.chargeSeconds : 1;
    this.energy.style.transform = `scaleX(${game.energy * charge})`;
    this.energyLabel.textContent = game.isCharging ? 'Charging laser' : 'Energy';
    this.overload.style.transform = `scaleX(${game.overload})`;
    this.overloadMeter.classList.toggle('danger', game.overload > DANGER_OVERLOAD);
    this.energyMeter.classList.toggle('low', game.energy < LOW_ENERGY);
    this.pods.textContent = game.receiverOpen ? 'OPEN' : String(game.podsRemaining);
    this.score.textContent = game.score.toLocaleString('en-US');
    this.lives.textContent = '◆'.repeat(Math.max(0, game.lives));
  }
}
