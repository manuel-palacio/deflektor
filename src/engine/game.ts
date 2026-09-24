import { traceBeam, wrapDirection } from './beam';
import { findTiles, parseLevel, tileAt } from './level';
import { Machinery } from './machinery';
import type { BeamTrace, Board, LevelDefinition, Point } from './types';

export const RULES = {
  startingLives: 3,
  podScore: 100,
  energyBonus: 1000,
  overloadRisePerSecond: 0.6,
  overloadDecayPerSecond: 0.25,
  /** Like the original's "CHARGING LAZER": the beam only aims for a moment before it starts to burn. */
  chargeSeconds: 2,
} as const;

export interface GameOptions {
  startLevel?: number;
  random?: () => number;
  chargeSeconds?: number;
  /** Training: losing never costs a life. */
  unlimitedLives?: boolean;
}

/** Why a life was lost: running dry, a mine overloading the laser, or the beam fed back into the laser. */
export type LifeLostReason = 'energy' | 'mine' | 'feedback';

/** How the current level has been played so far. */
export interface LevelStats {
  rotations: number;
  /** Seconds the laser has been firing (charging time excluded). */
  seconds: number;
  podsDestroyed: number;
}

export type GamePhase = 'playing' | 'lifeLost' | 'levelComplete' | 'gameOver' | 'victory';

export type GameEvent =
  | { type: 'levelStarted'; index: number }
  | { type: 'podDestroyed'; tile: Point }
  | { type: 'mirrorRotated'; tile: Point }
  /** A turn newly lined the beam up on a pod or the open receiver. */
  | { type: 'beamConnected'; tile: Point }
  | { type: 'receiverOpened' }
  | { type: 'levelComplete'; bonus: number; stats: LevelStats }
  | { type: 'lifeLost'; reason: LifeLostReason }
  | { type: 'gameOver' };

type Listener = (event: GameEvent) => void;

/** One run through the levels: owns the board, meters, lives and score. Knows nothing about rendering. */
export class Game {
  phase: GamePhase = 'playing';
  lives: number = RULES.startingLives;
  score = 0;
  energy = 1;
  overload = 0;
  levelIndex: number;
  board!: Board;
  beam!: BeamTrace;
  podsRemaining = 0;

  /** Seconds left before the laser starts to burn; while charging, the beam only shows where it will go. */
  chargeRemaining = 0;
  stats: LevelStats = { rotations: 0, seconds: 0, podsDestroyed: 0 };

  private readonly listeners: Listener[] = [];
  private machinery!: Machinery;
  private readonly random: () => number;
  private readonly chargeSeconds: number;
  private readonly unlimitedLives: boolean;
  private scoreAtLevelStart = 0;
  private overheatCause: 'mine' | 'feedback' = 'mine';

  constructor(
    private readonly levels: LevelDefinition[],
    options: GameOptions = {},
  ) {
    this.levelIndex = options.startLevel ?? 0;
    this.random = options.random ?? Math.random;
    this.chargeSeconds = options.chargeSeconds ?? RULES.chargeSeconds;
    this.unlimitedLives = options.unlimitedLives ?? false;
    this.loadLevel();
  }

  get level(): LevelDefinition {
    return this.levels[this.levelIndex];
  }

  get receiverOpen(): boolean {
    return this.podsRemaining === 0;
  }

  get isCharging(): boolean {
    return this.chargeRemaining > 0;
  }

  /** True when the beam currently ends on something the player wants: a pod, or the receiver once open. */
  get isOnTarget(): boolean {
    const end = this.beam.end.kind;
    return end === 'pod' || (end === 'receiver' && this.receiverOpen);
  }

  get isBeamOverheating(): boolean {
    const end = this.beam.end.kind;
    return end === 'mine' || end === 'emitter';
  }

  on(listener: Listener): void {
    this.listeners.push(listener);
  }

  tick(seconds: number): void {
    if (this.phase !== 'playing') return;
    this.machinery.advance(seconds);
    if (this.isCharging) {
      this.chargeRemaining = Math.max(0, this.chargeRemaining - seconds);
      this.beam = traceBeam(this.board);
      return;
    }
    this.stats.seconds += seconds;
    this.resolveBeam();
    if (this.phase !== 'playing') return;
    this.updateOverload(seconds);
    this.energy = Math.max(0, this.energy - seconds / this.level.energySeconds);
    this.checkForLostLife();
  }

  rotateMirror(tilePosition: Point, steps: number): void {
    const tile = tileAt(this.board, tilePosition);
    if (this.phase !== 'playing' || tile?.kind !== 'mirror' || tile.auto) return;
    const wasOnTarget = this.isOnTarget ? endKey(this.beam) : undefined;
    tile.rotation = wrapDirection(tile.rotation + steps);
    this.stats.rotations++;
    this.beam = traceBeam(this.board);
    this.emit({ type: 'mirrorRotated', tile: tilePosition });
    const end = this.beam.end;
    if (this.isOnTarget && 'tile' in end && endKey(this.beam) !== wasOnTarget) {
      this.emit({ type: 'beamConnected', tile: end.tile });
    }
  }

  /** Starts the current level again from scratch, without costing a life. */
  restartLevel(): void {
    if (this.phase !== 'playing' && this.phase !== 'lifeLost') return;
    this.score = this.scoreAtLevelStart;
    this.loadLevel();
  }

  /** Advances past a paused result screen: next level, retry after a lost life. */
  continue(): void {
    if (this.phase === 'levelComplete') {
      this.levelIndex++;
      if (this.levelIndex >= this.levels.length) {
        this.levelIndex = this.levels.length - 1;
        this.phase = 'victory';
        return;
      }
      this.loadLevel();
    } else if (this.phase === 'lifeLost') {
      this.loadLevel();
    }
  }

  private loadLevel(): void {
    this.board = parseLevel(this.level);
    this.podsRemaining = findTiles(this.board, 'pod').length;
    this.energy = 1;
    this.overload = 0;
    this.chargeRemaining = this.chargeSeconds;
    this.stats = { rotations: 0, seconds: 0, podsDestroyed: 0 };
    this.scoreAtLevelStart = this.score;
    this.machinery = new Machinery(this.board, this.random);
    this.phase = 'playing';
    this.beam = traceBeam(this.board);
    this.emit({ type: 'levelStarted', index: this.levelIndex });
  }

  private resolveBeam(): void {
    this.beam = traceBeam(this.board);
    const end = this.beam.end;
    if (end.kind === 'pod') {
      this.destroyPod(end.tile);
    } else if (end.kind === 'receiver' && this.receiverOpen) {
      this.completeLevel();
    }
  }

  private destroyPod(tile: Point): void {
    this.board.tiles[tile.y][tile.x] = { kind: 'empty' };
    this.podsRemaining--;
    this.stats.podsDestroyed++;
    this.score += RULES.podScore;
    this.emit({ type: 'podDestroyed', tile });
    if (this.receiverOpen) this.openReceiver();
    this.beam = traceBeam(this.board);
  }

  /** The gates guarding the receiver vanish once the last pod is gone. */
  private openReceiver(): void {
    for (const row of this.board.walls) {
      row.forEach((wall, column) => {
        if (wall === 'gate') row[column] = 'none';
      });
    }
    this.emit({ type: 'receiverOpened' });
  }

  private completeLevel(): void {
    const bonus = Math.round(this.energy * RULES.energyBonus);
    this.score += bonus;
    this.phase = 'levelComplete';
    this.emit({ type: 'levelComplete', bonus, stats: { ...this.stats } });
  }

  private updateOverload(seconds: number): void {
    if (this.isBeamOverheating) this.overheatCause = this.beam.end.kind === 'mine' ? 'mine' : 'feedback';
    const change = this.isBeamOverheating
      ? RULES.overloadRisePerSecond * seconds
      : -RULES.overloadDecayPerSecond * seconds;
    this.overload = Math.min(1, Math.max(0, this.overload + change));
  }

  private checkForLostLife(): void {
    if (this.overload >= 1) this.loseLife(this.overheatCause);
    else if (this.energy <= 0) this.loseLife('energy');
  }

  private loseLife(reason: LifeLostReason): void {
    if (!this.unlimitedLives) this.lives--;
    this.phase = this.lives > 0 ? 'lifeLost' : 'gameOver';
    this.emit({ type: 'lifeLost', reason });
    if (this.phase === 'gameOver') this.emit({ type: 'gameOver' });
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function endKey(beam: BeamTrace): string {
  const end = beam.end;
  return 'tile' in end ? `${end.kind}:${end.tile.x},${end.tile.y}` : end.kind;
}
