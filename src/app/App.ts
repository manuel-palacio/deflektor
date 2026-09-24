import type { Sound } from '../audio/Sound';
import { traceBeam } from '../engine/beam';
import { beamState } from '../engine/beamState';
import { FixedStepper } from '../engine/fixedStep';
import { Game, RULES, type GameEvent, type LevelStats, type LifeLostReason } from '../engine/game';
import { LEVELS } from '../engine/levels';
import { clickDistance, computePar, rateStars, type Par } from '../engine/scoring';
import { nextHint } from '../engine/solver';
import { TRAINING_LEVELS } from '../engine/training';
import type { BeamTrace, LevelDefinition, Point } from '../engine/types';
import { playerMirrors } from '../input/cursor';
import { Controls } from '../input/Controls';
import type { Renderer } from '../render/Renderer';
import { Coach } from './coach';
import { byId, onClick } from './dom';
import { Hud } from './Hud';
import { explainFailure, format, starText, summarizeLevel, type LineItem } from './outcomes';
import type { ProgressStore, Settings } from './progress';
import { SettingsPanel } from './SettingsPanel';

type Screen = 'title' | 'levels' | 'playing' | 'paused' | 'message' | 'settings';
type Mode = 'campaign' | 'training';

const SCREEN_IDS: Partial<Record<Screen, string>> = {
  title: 'screen-title',
  levels: 'screen-levels',
  paused: 'screen-pause',
  message: 'screen-message',
  settings: 'screen-settings',
};
const MAX_FRAME_SECONDS = 0.05;
const ATTRACT_MOVE_SECONDS = 0.8;
const RESULT_DELAY_MS = { levelComplete: 1300, lifeLost: 1200, gameOver: 1400 };
const TOAST_SECONDS = 5;

interface ResultOptions {
  title: string;
  stars?: string;
  detail?: string;
  lines?: LineItem[];
  record?: string;
  primary: [label: string, action: () => void];
  replay?: () => void;
  secondary?: [label: string, action: () => void];
}

/** Screen flow: an attract-mode demo behind the menus, training, and runs through the campaign. */
export class App {
  private game: Game;
  private mode: Mode = 'campaign';
  private screen: Screen = 'title';
  private settingsReturn: Screen = 'title';
  private attractMode = true;
  private attractClock = 0;
  private resultTimer?: number;
  private resultActions: { primary?: () => void; replay?: () => void; secondary?: () => void } = {};
  private readonly hud = new Hud();
  private readonly stepper = new FixedStepper();
  private readonly coach = new Coach();
  private readonly settingsPanel: SettingsPanel;
  private readonly controls: Controls;
  private readonly parCache = new Map<LevelDefinition, Par>();
  /** Per-attempt counters behind the star rating (reset when a new level starts). */
  private attempt = { levelIndex: -1, restarts: 0, hintsUsed: 0 };
  private toast?: { text: string; remaining: number };

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
      hover: (tile) => this.renderer.setHover(tile, tile && this.previewTurn(tile)),
      undo: () => this.game.undo(),
      redo: () => this.game.redo(),
      hint: () => this.showHint(),
      restart: () => this.restartLevel(),
      togglePause: () => this.togglePause(),
      toggleMute: () => this.toggleMute(),
    });
    this.settingsPanel = new SettingsPanel((changes) => this.changeSettings(changes));
    this.applySettings(progress.settings);
    this.bindButtons();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.pause();
    });
    document.addEventListener('keydown', (event) => this.onMenuKey(event));
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
    if (!this.attractMode) this.hud.update(this.game, this.runLabels());
    this.updateTips(step);
  }

  // ---- Test hook helpers (used by Playwright through window.__deflektor) ----

  get currentGame(): Game {
    return this.game;
  }

  get currentScreen(): Screen {
    return this.screen;
  }

  get currentMode(): Mode {
    return this.mode;
  }

  get soundLog(): readonly string[] {
    return this.sound.played;
  }

  inspectRenderer() {
    return this.renderer.inspect();
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
    const progress = this.progress.current;
    byId('title-high-score').textContent = format(progress.highScore);
    byId('title-training-badge').hidden = progress.trainingDone;
    byId('title-training').classList.toggle('primary', !progress.trainingDone);
    byId('title-play').classList.toggle('primary', progress.trainingDone);
    this.showScreen('title');
    byId(progress.trainingDone ? 'title-play' : 'title-training').focus();
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
    const locked = index >= this.progress.current.unlockedLevels;
    const record = this.progress.current.records[index + 1];
    button.disabled = locked;
    const stars = record?.bestStars ? starText(record.bestStars as 1 | 2 | 3) : '';
    button.innerHTML = `<span class="level-number">${String(index + 1).padStart(2, '0')}</span><span class="level-stars">${stars}</span>`;
    button.setAttribute(
      'aria-label',
      `Level ${index + 1}${locked ? ', locked' : ''}${record?.bestStars ? `, best ${record.bestStars} stars` : ''}`,
    );
    button.addEventListener('click', () => this.startRun('campaign', index));
    return button;
  }

  private showScreen(screen: Screen): void {
    this.screen = screen;
    for (const [name, id] of Object.entries(SCREEN_IDS)) byId(id).hidden = name !== screen;
    this.hud.setVisible(!this.attractMode);
    if (screen !== 'playing') this.renderer.setHover(undefined, undefined);
    this.renderer.relayout();
  }

  private showSettings(): void {
    this.settingsReturn = this.screen === 'paused' ? 'paused' : 'title';
    this.showScreen('settings');
    this.settingsPanel.show(this.progress.settings);
  }

  private closeSettings(): void {
    if (this.settingsReturn === 'paused') this.pause();
    else this.showTitle();
  }

  private showResult(options: ResultOptions): void {
    byId('message-title').textContent = options.title;
    const stars = byId('message-stars');
    stars.hidden = !options.stars;
    stars.textContent = options.stars ?? '';
    stars.setAttribute('aria-label', options.stars ? `${options.stars.split('★').length - 1} of 3 stars` : '');
    const detail = byId('message-detail');
    detail.hidden = !options.detail;
    detail.textContent = options.detail ?? '';
    const lines = byId('message-lines');
    lines.hidden = !options.lines;
    lines.replaceChildren(
      ...(options.lines ?? []).flatMap((line) => {
        const term = Object.assign(document.createElement('dt'), { textContent: line.label });
        const value = Object.assign(document.createElement('dd'), { textContent: line.value });
        value.classList.toggle('record', Boolean(line.record));
        return [term, value];
      }),
    );
    const record = byId('message-record');
    record.hidden = !options.record;
    record.textContent = options.record ?? '';
    byId('message-primary').textContent = options.primary[0];
    byId('message-replay').hidden = !options.replay;
    const secondary = byId('message-secondary');
    secondary.hidden = !options.secondary;
    secondary.textContent = options.secondary?.[0] ?? '';
    this.resultActions = { primary: options.primary[1], replay: options.replay, secondary: options.secondary?.[1] };
    this.showScreen('message');
    byId('message-primary').focus();
  }

  // ---- Runs ----

  private startRun(mode: Mode, levelIndex: number): void {
    this.sound.unlock();
    this.clearResultTimer();
    this.attractMode = false;
    this.mode = mode;
    this.attempt = { levelIndex: -1, restarts: 0, hintsUsed: 0 };
    this.game = new Game(this.levels, { startLevel: levelIndex, unlimitedLives: mode === 'training' });
    this.game.on((event) => this.onGameEvent(event));
    this.controls.resetCursor();
    this.renderer.showGame(this.game);
    this.showScreen('playing');
    this.onLevelStarted();
  }

  private get levels(): LevelDefinition[] {
    return this.mode === 'training' ? TRAINING_LEVELS : LEVELS;
  }

  private runLabels() {
    const number = this.game.levelIndex + 1;
    return {
      level: this.mode === 'training' ? `T${number}` : String(number).padStart(2, '0'),
      unlimitedLives: this.mode === 'training',
    };
  }

  private continueRun(): void {
    if (this.game.phase === 'lifeLost') this.attempt.restarts++;
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
    this.coach.notice(event);
    switch (event.type) {
      case 'levelStarted':
        this.onLevelStarted();
        break;
      case 'podDestroyed':
        this.sound.podPop();
        this.announce(this.game.podsRemaining > 0 ? `Cell destroyed. ${this.game.podsRemaining} left.` : 'Last cell destroyed.');
        break;
      case 'mirrorRotated':
        this.sound.mirrorTick();
        break;
      case 'beamConnected':
        this.sound.connect();
        break;
      case 'receiverOpened':
        this.sound.gateOpen();
        this.announce('The receiver is open. Steer the beam into it.');
        break;
      case 'levelComplete':
        this.sound.levelComplete();
        this.announce('Level complete.');
        this.afterDelay(RESULT_DELAY_MS.levelComplete, () => this.showLevelComplete(event.bonus, event.stats));
        break;
      case 'lifeLost':
        this.sound.lifeLost();
        this.announce(explainFailure(event.reason).title);
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

  private onLevelStarted(): void {
    this.sound.chargeUp();
    this.stepper.reset();
    this.renderer.setHint(undefined);
    const index = this.game.levelIndex;
    if (index !== this.attempt.levelIndex) {
      this.attempt = { levelIndex: index, restarts: 0, hintsUsed: 0 };
      if (this.mode === 'campaign') this.progress.recordPlay(index + 1);
    }
    const lesson = this.mode === 'training' ? TRAINING_LEVELS[index].lesson : undefined;
    this.coach.startLevel(lesson);
    const label = this.mode === 'training' ? `Training ${index + 1}: ${TRAINING_LEVELS[index].name}` : `Level ${index + 1}`;
    this.announce(`${label}. ${this.game.podsRemaining} cells. The laser is charging.`);
  }

  private showLevelComplete(bonus: number, stats: LevelStats): void {
    const level = this.game.level;
    const par = this.parFor(level);
    const stars = rateStars({ ...stats, restarts: this.attempt.restarts, hintsUsed: this.attempt.hintsUsed }, par);
    const levelScore = stats.podsDestroyed * RULES.podScore + bonus;
    const isLast = this.game.levelIndex === this.levels.length - 1;
    const records =
      this.mode === 'campaign'
        ? this.progress.recordCompletion(this.game.levelIndex + 1, { score: levelScore, seconds: stats.seconds, stars })
        : { score: false, time: false, stars: false };
    if (this.mode === 'campaign') {
      this.progress.unlockLevelAfter(this.game.levelIndex);
      this.progress.recordScore(this.game.score);
    } else if (isLast) {
      this.progress.completeTraining();
    }
    const summary = summarizeLevel(stats, bonus, par, stars, records);
    const replayIndex = this.game.levelIndex;
    this.showResult({
      title: this.mode === 'training' && isLast ? 'Training complete' : summary.title,
      stars: starText(stars),
      lines: summary.lines,
      record: summary.recordNote,
      primary:
        this.mode === 'training' && isLast
          ? ['Play level 1', () => this.startRun('campaign', 0)]
          : [isLast ? 'Finish' : 'Next level', () => this.continueRun()],
      replay: () => this.startRun(this.mode, replayIndex),
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showLifeLost(reason: LifeLostReason): void {
    const failure = explainFailure(reason);
    const lives = this.mode === 'training' ? '' : ` ${this.game.lives} ${this.game.lives === 1 ? 'life' : 'lives'} left.`;
    this.showResult({
      title: failure.title,
      detail: `${failure.explanation} ${failure.advice}${lives}`,
      primary: ['Try again', () => this.continueRun()],
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showGameOver(): void {
    const levelIndex = this.game.levelIndex;
    this.showResult({
      title: 'Game over',
      detail: `Final score ${format(this.game.score)}. High score ${format(this.progress.current.highScore)}.`,
      primary: ['Retry level', () => this.startRun('campaign', levelIndex)],
      secondary: ['Menu', () => this.showTitle()],
    });
  }

  private showVictory(): void {
    this.showResult({
      title: 'All levels clear',
      detail: `You bent every beam. Final score ${format(this.game.score)}.`,
      primary: ['Menu', () => this.showTitle()],
    });
  }

  private parFor(level: LevelDefinition): Par {
    let par = this.parCache.get(level);
    if (!par) {
      par = computePar(level);
      this.parCache.set(level, par);
    }
    return par;
  }

  private restartLevel(): void {
    if (this.game.phase !== 'playing' && this.game.phase !== 'lifeLost') return;
    this.clearResultTimer();
    this.attempt.restarts++;
    this.game.restartLevel();
    this.controls.resetCursor();
    this.showScreen('playing');
    this.showToast('Level restarted.');
  }

  // ---- Help while playing ----

  /** Where the beam would go if the hovered mirror were turned one step clockwise. */
  private previewTurn(tile: Point): BeamTrace | undefined {
    const mirror = this.game.board.tiles[tile.y][tile.x];
    if (mirror.kind !== 'mirror' || this.game.phase !== 'playing') return undefined;
    mirror.rotation = (mirror.rotation + 1) % 16;
    const preview = traceBeam(this.game.board);
    mirror.rotation = (mirror.rotation + 15) % 16;
    return preview;
  }

  private showHint(): void {
    if (this.game.phase !== 'playing') return;
    const move = nextHint(this.game.board);
    this.attempt.hintsUsed++;
    if (!move) {
      this.showToast('No turn needed right now: wait for the moving parts to line up.');
      return;
    }
    const mirror = this.game.board.tiles[move.tile.y][move.tile.x];
    const current = mirror.kind === 'mirror' ? mirror.rotation : 0;
    const clicks = clickDistance(current, move.rotation);
    const clockwise = (move.rotation - current + 16) % 16 <= 8;
    this.renderer.setHint(move.tile);
    this.controls.cursor = move.tile;
    this.showToast(`Hint: turn the highlighted mirror ${clicks} ${clicks === 1 ? 'step' : 'steps'} ${clockwise ? 'clockwise' : 'counter-clockwise'}. (Hints cap this level at 2 stars.)`);
  }

  private showToast(text: string): void {
    this.toast = { text, remaining: TOAST_SECONDS };
  }

  /** Shows the hint toast, falling back to the coach's contextual tip. */
  private updateTips(seconds: number): void {
    const coachEl = byId('coach');
    if (this.toast) {
      this.toast.remaining -= seconds;
      if (this.toast.remaining <= 0) this.toast = undefined;
    }
    let text = this.toast?.text;
    if (!text && this.screen === 'playing' && !this.attractMode) {
      const training = this.mode === 'training';
      const tip = this.coach.update(
        { state: beamState(this.game), rotations: this.game.stats.rotations, energy: this.game.energy },
        seconds,
      );
      if (tip && (this.progress.settings.hints || (training && tip.id === 'lesson'))) text = tip.text;
    }
    const visible = Boolean(text) && (this.screen === 'playing' || this.screen === 'message');
    if (coachEl.hidden === visible || coachEl.textContent !== (text ?? '')) {
      coachEl.hidden = !visible;
      coachEl.textContent = text ?? '';
    }
  }

  private announce(text: string): void {
    byId('announcer').textContent = text;
  }

  // ---- Pause and settings ----

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
    this.changeSettings({ muted: !this.progress.settings.muted });
  }

  private changeSettings(changes: Partial<Settings>): void {
    this.progress.updateSettings(changes);
    this.applySettings(this.progress.settings);
  }

  private applySettings(settings: Settings): void {
    this.sound.update({ muted: settings.muted, musicVolume: settings.musicVolume, effectsVolume: settings.effectsVolume });
    this.renderer.setDisplay({
      reducedMotion: settings.reducedMotion,
      highContrast: settings.highContrast,
      quality: settings.quality,
    });
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    document.body.classList.toggle('high-contrast', settings.highContrast);
    this.hud.setMuted(settings.muted);
  }

  /** Escape backs out of menus; the game's own keys are handled by Controls. */
  private onMenuKey(event: KeyboardEvent): void {
    if (event.code !== 'Escape') return;
    if (this.screen === 'settings') this.closeSettings();
    else if (this.screen === 'levels') this.showTitle();
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
    this.mode = 'campaign';
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
    onClick('title-training', () => this.startRun('training', 0));
    onClick('title-settings', () => this.showSettings());
    onClick('title-help-toggle', () => {
      const help = byId('title-help');
      help.hidden = !help.hidden;
      byId('title-help-toggle').setAttribute('aria-expanded', String(!help.hidden));
    });
    onClick('levels-back', () => this.showTitle());
    onClick('pause-resume', () => this.showScreen('playing'));
    onClick('pause-restart', () => this.restartLevel());
    onClick('pause-settings', () => this.showSettings());
    onClick('pause-quit', () => this.showTitle());
    onClick('settings-done', () => this.closeSettings());
    onClick('message-primary', () => this.resultActions.primary?.());
    onClick('message-replay', () => this.resultActions.replay?.());
    onClick('message-secondary', () => this.resultActions.secondary?.());
    onClick('hud-undo', () => this.game.undo());
    onClick('hud-redo', () => this.game.redo());
    onClick('hud-hint', () => this.showHint());
    onClick('hud-pause', () => this.togglePause());
    onClick('hud-mute', () => this.toggleMute());
  }
}
