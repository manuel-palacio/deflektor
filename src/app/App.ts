import type { Sound } from '../audio/Sound';
import { FixedStepper } from '../engine/fixedStep';
import { Game, type GameEvent, type LifeLostReason } from '../engine/game';
import { LEVELS } from '../engine/levels';
import type { Point } from '../engine/types';
import { playerMirrors } from '../input/cursor';
import { Controls } from '../input/Controls';
import type { Renderer } from '../render/Renderer';
import { byId, onClick } from './dom';
import { Hud } from './Hud';
import type { ProgressStore } from './progress';

type Screen = 'title' | 'levels' | 'playing' | 'paused' | 'message';

const SCREEN_IDS: Partial<Record<Screen, string>> = {
  title: 'screen-title',
  levels: 'screen-levels',
  paused: 'screen-pause',
  message: 'screen-message',
};
const MAX_FRAME_SECONDS = 0.05;
const ATTRACT_MOVE_SECONDS = 0.8;
const RESULT_DELAY_MS = { levelComplete: 1300, lifeLost: 1200, gameOver: 1400 };
const LIFE_LOST_TEXT: Record<LifeLostReason, { title: string; detail: string }> = {
  mine: { title: 'Mine overload', detail: 'The beam rested on a mine until the laser overloaded.' },
  feedback: { title: 'Feedback overload', detail: 'The beam was reflected back into the laser until it overloaded.' },
  energy: { title: 'Out of energy', detail: 'The laser ran dry before the level was cleared.' },
};

interface MessageOptions {
  title: string;
  detail: string;
  primary: [label: string, action: () => void];
  secondary?: [label: string, action: () => void];
}

/** Screen flow: an attract-mode demo behind the menus, then real runs through the campaign. */
export class App {
  private game: Game;
  private screen: Screen = 'title';
  private attractMode = true;
  private attractClock = 0;
  private resultTimer?: number;
  private messageActions: { primary?: () => void; secondary?: () => void } = {};
  private readonly hud = new Hud();
  private readonly stepper = new FixedStepper();
  private readonly controls: Controls;

  constructor(
    private readonly renderer: Renderer,
    private readonly sound: Sound,
    private readonly progress: ProgressStore,
  ) {
    this.game = this.createAttractGame();
    renderer.showGame(this.game);
    this.controls = new Controls(renderer.canvas, {
      isPlaying: () => this.screen === 'playing' && this.game.phase === 'playing',
      board: () => this.game.board,
      tileAtScreen: (point) => this.renderer.tileAtScreen(point),
      screenDirectionToBoard: (step) => this.renderer.screenDirectionToBoard(step),
      rotate: (tile, steps) => this.game.rotateMirror(tile, steps),
      togglePause: () => this.togglePause(),
      toggleMute: () => this.toggleMute(),
    });
    this.hud.setMuted(sound.isMuted);
    this.bindButtons();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.pause();
    });
  }

  start(): void {
    this.showTitle();
  }

  /** Advances one animation frame. */
  frame(seconds: number): void {
    const step = Math.min(seconds, MAX_FRAME_SECONDS);
    if (this.screen === 'playing') this.stepper.advance(step, (fixed) => this.game.tick(fixed));
    else if (this.attractMode) this.stepper.advance(step, (fixed) => this.runAttractMode(fixed));
    const cursor = this.screen === 'playing' ? this.controls.cursor : undefined;
    this.renderer.render(this.game, step, cursor);
    const firing = this.screen === 'playing' && this.game.phase === 'playing' && !this.game.isCharging;
    this.sound.updateLaser(firing, this.game.overload, step);
    if (!this.attractMode) this.hud.update(this.game);
  }

  // ---- Test hook helpers (used by Playwright through window.__deflektor) ----

  get currentGame(): Game {
    return this.game;
  }

  get currentScreen(): Screen {
    return this.screen;
  }

  tileToClient(tile: Point): Point {
    const bounds = this.renderer.canvas.getBoundingClientRect();
    const center = this.renderer.tileCenterOnScreen(tile);
    return { x: bounds.left + center.x, y: bounds.top + center.y };
  }

  // ---- Screens ----

  private showTitle(): void {
    this.clearResultTimer();
    if (!this.attractMode) this.startAttractMode();
    byId('title-high-score').textContent = this.progress.current.highScore.toLocaleString('en-US');
    this.showScreen('title');
  }

  private showLevels(): void {
    const grid = byId('level-grid');
    grid.replaceChildren(...LEVELS.map((_, index) => this.createLevelButton(index)));
    this.showScreen('levels');
    (grid.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
  }

  private createLevelButton(index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-button';
    button.dataset.level = String(index + 1);
    button.disabled = index >= this.progress.current.unlockedLevels;
    button.innerHTML = `<span class="level-number">${String(index + 1).padStart(2, '0')}</span>`;
    button.addEventListener('click', () => this.startRun(index));
    return button;
  }

  private showScreen(screen: Screen): void {
    this.screen = screen;
    for (const [name, id] of Object.entries(SCREEN_IDS)) byId(id).hidden = name !== screen;
    this.hud.setVisible(!this.attractMode);
    this.renderer.relayout();
  }

  private showMessage(options: MessageOptions): void {
    byId('message-title').textContent = options.title;
    byId('message-detail').innerHTML = options.detail;
    byId('message-primary').textContent = options.primary[0];
    const secondary = byId('message-secondary');
    secondary.hidden = !options.secondary;
    secondary.textContent = options.secondary?.[0] ?? '';
    this.messageActions = { primary: options.primary[1], secondary: options.secondary?.[1] };
    this.showScreen('message');
    byId('message-primary').focus();
  }

  // ---- Runs ----

  private startRun(levelIndex: number): void {
    this.sound.unlock();
    this.clearResultTimer();
    this.attractMode = false;
    this.game = new Game(LEVELS, { startLevel: levelIndex });
    this.game.on((event) => this.onGameEvent(event));
    this.sound.chargeUp();
    this.controls.resetCursor();
    this.renderer.showGame(this.game);
    this.showScreen('playing');
    this.hud.update(this.game);
  }

  private continueRun(): void {
    this.game.continue();
    this.controls.resetCursor();
    if (this.game.phase === 'victory') {
      this.showVictory();
      return;
    }
    this.showScreen('playing');
  }

  private onGameEvent(event: GameEvent): void {
    this.renderer.handle(event, this.game);
    switch (event.type) {
      case 'levelStarted':
        this.sound.chargeUp();
        break;
      case 'podDestroyed':
        this.sound.podPop();
        break;
      case 'mirrorRotated':
        this.sound.mirrorTick();
        break;
      case 'levelComplete':
        this.sound.levelComplete();
        this.progress.unlockLevelAfter(this.game.levelIndex);
        this.progress.recordScore(this.game.score);
        this.afterDelay(RESULT_DELAY_MS.levelComplete, () => this.showLevelComplete(event.bonus));
        break;
      case 'lifeLost':
        this.sound.lifeLost();
        if (this.game.phase === 'lifeLost') {
          this.afterDelay(RESULT_DELAY_MS.lifeLost, () => this.showLifeLost(event.reason));
        }
        break;
      case 'gameOver':
        this.progress.recordScore(this.game.score);
        this.afterDelay(RESULT_DELAY_MS.gameOver, () => this.showGameOver());
        break;
    }
  }

  private showLevelComplete(bonus: number): void {
    this.showMessage({
      title: 'Level complete',
      detail: `Energy bonus <strong>+${bonus.toLocaleString('en-US')}</strong><br>Score <strong>${this.game.score.toLocaleString('en-US')}</strong>`,
      primary: ['Next level', () => this.continueRun()],
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showLifeLost(reason: LifeLostReason): void {
    const lives = this.game.lives;
    this.showMessage({
      title: LIFE_LOST_TEXT[reason].title,
      detail: `${LIFE_LOST_TEXT[reason].detail}<br>${lives} ${lives === 1 ? 'life' : 'lives'} left`,
      primary: ['Try again', () => this.continueRun()],
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showGameOver(): void {
    const levelIndex = this.game.levelIndex;
    this.showMessage({
      title: 'Game over',
      detail: `Final score <strong>${this.game.score.toLocaleString('en-US')}</strong><br>High score <strong>${this.progress.current.highScore.toLocaleString('en-US')}</strong>`,
      primary: ['Retry level', () => this.startRun(levelIndex)],
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showVictory(): void {
    this.showMessage({
      title: 'All levels clear',
      detail: `You bent every beam.<br>Final score <strong>${this.game.score.toLocaleString('en-US')}</strong>`,
      primary: ['Menu', () => this.showTitle()],
    });
  }

  private restartLevel(): void {
    this.clearResultTimer();
    this.game.restartLevel();
    this.controls.resetCursor();
    this.stepper.reset();
    this.showScreen('playing');
  }

  private togglePause(): void {
    if (this.screen === 'playing') this.pause();
    else if (this.screen === 'paused') this.showScreen('playing');
  }

  private pause(): void {
    this.controls.resetCursor();
    this.showScreen('paused');
    byId('pause-resume').focus();
  }

  private toggleMute(): void {
    const muted = !this.sound.isMuted;
    this.sound.setMuted(muted);
    this.progress.setMuted(muted);
    this.hud.setMuted(muted);
  }

  private afterDelay(milliseconds: number, action: () => void): void {
    this.clearResultTimer();
    this.resultTimer = window.setTimeout(action, milliseconds);
  }

  private clearResultTimer(): void {
    window.clearTimeout(this.resultTimer);
  }

  // ---- Attract mode: a demo behind the menus that fiddles with mirrors on its own ----

  private startAttractMode(): void {
    this.attractMode = true;
    this.game = this.createAttractGame();
    this.renderer.showGame(this.game);
  }

  private createAttractGame(): Game {
    const game = new Game(LEVELS, { startLevel: Math.floor(Math.random() * LEVELS.length) });
    game.on((event) => this.renderer.handle(event, game));
    return game;
  }

  private runAttractMode(seconds: number): void {
    this.game.tick(seconds);
    if (this.game.phase !== 'playing') {
      this.startAttractMode();
      return;
    }
    this.attractClock += seconds;
    if (this.attractClock < ATTRACT_MOVE_SECONDS) return;
    this.attractClock = 0;
    const mirrors = playerMirrors(this.game.board);
    const mirror = mirrors[Math.floor(Math.random() * mirrors.length)];
    if (mirror) this.game.rotateMirror(mirror, Math.random() < 0.5 ? 1 : -1);
  }

  private bindButtons(): void {
    onClick('title-play', () => {
      this.sound.unlock();
      this.sound.uiClick();
      this.showLevels();
    });
    onClick('title-help-toggle', () => {
      const help = byId('title-help');
      help.hidden = !help.hidden;
    });
    onClick('levels-back', () => this.showTitle());
    onClick('pause-resume', () => this.showScreen('playing'));
    onClick('pause-restart', () => this.restartLevel());
    onClick('pause-quit', () => this.showTitle());
    onClick('message-primary', () => this.messageActions.primary?.());
    onClick('message-secondary', () => this.messageActions.secondary?.());
    onClick('hud-pause', () => this.togglePause());
    onClick('hud-mute', () => this.toggleMute());
  }
}
