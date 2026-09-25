import { traceBeam, wrapDirection } from './beam';
import { DIFFICULTY_RULES, type Difficulty, type DifficultyRules } from './difficulty';
import { findTiles, parseLevel, tileAt } from './level';
import { Machinery } from './machinery';
import type { BeamEnd, BeamTrace, Board, LevelDefinition, Point } from './types';

export const RULES = {
  startingLives: 3,
  podScore: 100,
  energyBonus: 1000,
  /** Like the original's "CHARGING LAZER": the beam only aims for a moment before it starts to burn. */
  chargeSeconds: 2,
  /** A fragile mirror shatters after this much time reflecting the beam. */
  fragileSeconds: 1.5,
} as const;

export interface GameOptions {
  startLevel?: number;
  random?: () => number;
  chargeSeconds?: number;
  /** Training: losing never costs a life. */
  unlimitedLives?: boolean;
  /** Defaults to Classic, the tuning closest to the original. */
  difficulty?: Difficulty;
}

/** Why a life was lost: running dry, a mine overloading the laser, or the beam fed back into the laser. */
export type LifeLostReason = 'energy' | 'mine' | 'feedback' | 'time';

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
  /** A fragile mirror took too much beam and broke. */
  | { type: 'mirrorShattered'; tile: Point }
  /** The player tried to turn a mirror that has no turns left. */
  | { type: 'mirrorLocked'; tile: Point }
  | { type: 'podMoved'; from: Point; to: Point }
  | { type: 'levelComplete'; bonus: number; stats: LevelStats }
  | { type: 'lifeLost'; reason: LifeLostReason }
  | { type: 'gameOver' };

type Listener = (event: GameEvent) => void;

interface Turn {
  tile: Point;
  steps: number;
}

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
  private rules: DifficultyRules;
  private readonly history: Turn[] = [];
  private readonly undone: Turn[] = [];
  private overheatCause: 'mine' | 'feedback' = 'mine';

  constructor(
    private readonly levels: LevelDefinition[],
    options: GameOptions = {},
  ) {
    this.levelIndex = options.startLevel ?? 0;
    this.random = options.random ?? Math.random;
    this.chargeSeconds = options.chargeSeconds ?? RULES.chargeSeconds;
    this.unlimitedLives = options.unlimitedLives ?? false;
    this.rules = DIFFICULTY_RULES[options.difficulty ?? 'classic'];
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
    return this.beam.ends.some((end) => end.kind === 'pod' || (end.kind === 'receiver' && this.receiverOpen));
  }

  /** Seconds left on a timed level (Infinity when the level has no time limit). */
  get timeRemaining(): number {
    const limit = this.level.timeLimitSeconds;
    return limit === undefined ? Infinity : Math.max(0, limit - this.stats.seconds);
  }

  get isBeamOverheating(): boolean {
    return this.beam.ends.some((end) => end.kind === 'mine' || end.kind === 'emitter');
  }

  get difficultyRules(): DifficultyRules {
    return this.rules;
  }

  /** Changes difficulty on the fly (from the settings screen); the current level carries on. */
  setDifficulty(difficulty: Difficulty): void {
    this.rules = DIFFICULTY_RULES[difficulty];
    this.beam = this.trace();
  }

  on(listener: Listener): void {
    this.listeners.push(listener);
  }

  tick(seconds: number): void {
    if (this.phase !== 'playing') return;
    for (const move of this.machinery.advance(seconds)) this.emit({ type: 'podMoved', ...move });
    if (this.isCharging) {
      this.chargeRemaining = Math.max(0, this.chargeRemaining - seconds);
      this.beam = this.trace();
      return;
    }
    this.stats.seconds += seconds;
    this.resolveBeam();
    if (this.phase !== 'playing') return;
    this.stressFragileMirrors(seconds);
    this.updateOverload(seconds);
    this.energy = Math.max(0, this.energy - seconds / (this.level.energySeconds * this.rules.energyScale));
    this.checkForLostLife();
  }

  rotateMirror(tilePosition: Point, steps: number): void {
    const tile = tileAt(this.board, tilePosition);
    if (tile?.kind === 'mirror' && tile.turnsLeft === 0 && this.phase === 'playing') {
      this.emit({ type: 'mirrorLocked', tile: tilePosition });
      return;
    }
    if (!this.turnMirror(tilePosition, steps)) return;
    if (tile?.kind === 'mirror' && tile.turnsLeft !== undefined) tile.turnsLeft--;
    this.history.push({ tile: tilePosition, steps });
    this.undone.length = 0;
  }

  get canUndo(): boolean {
    return this.phase === 'playing' && this.history.length > 0;
  }

  get canRedo(): boolean {
    return this.phase === 'playing' && this.undone.length > 0;
  }

  /** Takes back the last mirror turn (it still counts as a move). */
  undo(): void {
    if (!this.canUndo) return;
    const turn = this.history.pop()!;
    this.turnMirror(turn.tile, -turn.steps);
    this.refundTurn(turn.tile, 1);
    this.undone.push(turn);
  }

  redo(): void {
    if (!this.canRedo) return;
    const turn = this.undone.pop()!;
    this.turnMirror(turn.tile, turn.steps);
    this.refundTurn(turn.tile, -1);
    this.history.push(turn);
  }

  private trace(): BeamTrace {
    return traceBeam(this.board);
  }

  /** Undo gives a limited mirror its turn back; redo takes it again. */
  private refundTurn(tilePosition: Point, turns: number): void {
    const tile = tileAt(this.board, tilePosition);
    if (tile?.kind === 'mirror' && tile.turnsLeft !== undefined) tile.turnsLeft += turns;
  }

  private turnMirror(tilePosition: Point, steps: number): boolean {
    const tile = tileAt(this.board, tilePosition);
    const turnable = tile?.kind === 'oneWay' || (tile?.kind === 'mirror' && !tile.auto);
    if (this.phase !== 'playing' || !turnable) return false;
    const targetsBefore = this.targetKeys();
    tile.rotation = wrapDirection(tile.rotation + steps);
    this.stats.rotations++;
    this.beam = this.trace();
    this.emit({ type: 'mirrorRotated', tile: tilePosition });
    const connected = this.beam.ends.find((end) => 'tile' in end && this.isTarget(end) && !targetsBefore.has(endKey(end)));
    if (connected && 'tile' in connected) this.emit({ type: 'beamConnected', tile: connected.tile });
    return true;
  }

  private isTarget(end: BeamEnd): boolean {
    return end.kind === 'pod' || (end.kind === 'receiver' && this.receiverOpen);
  }

  private targetKeys(): Set<string> {
    return new Set(this.beam.ends.filter((end) => this.isTarget(end)).map(endKey));
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
    this.history.length = 0;
    this.undone.length = 0;
    this.scoreAtLevelStart = this.score;
    this.machinery = new Machinery(this.board, this.random);
    this.phase = 'playing';
    this.beam = this.trace();
    this.emit({ type: 'levelStarted', index: this.levelIndex });
  }

  private resolveBeam(): void {
    this.beam = this.trace();
    const pods = this.beam.ends.filter((end) => end.kind === 'pod');
    for (const pod of pods) if ('tile' in pod) this.destroyPod(pod.tile);
    if (pods.length === 0 && this.beam.ends.some((end) => end.kind === 'receiver') && this.receiverOpen) {
      this.completeLevel();
    }
  }

  /** Fragile mirrors wear out while the beam bounces off them, and shatter. */
  private stressFragileMirrors(seconds: number): void {
    const worn = new Set<string>();
    for (const point of this.beam.turned) {
      const tile = tileAt(this.board, point);
      const key = `${point.x},${point.y}`;
      if (tile?.kind !== 'mirror' || !tile.fragile || worn.has(key)) continue;
      worn.add(key);
      tile.stress = (tile.stress ?? 0) + seconds;
      if (tile.stress >= RULES.fragileSeconds) {
        this.board.tiles[point.y][point.x] = { kind: 'empty' };
        this.emit({ type: 'mirrorShattered', tile: point });
        this.beam = this.trace();
      }
    }
  }

  private destroyPod(tile: Point): void {
    if (this.board.tiles[tile.y][tile.x].kind !== 'pod') return;
    this.board.tiles[tile.y][tile.x] = { kind: 'empty' };
    this.podsRemaining--;
    this.stats.podsDestroyed++;
    this.score += RULES.podScore;
    this.emit({ type: 'podDestroyed', tile });
    if (this.receiverOpen) this.openReceiver();
    this.beam = this.trace();
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
    if (this.isBeamOverheating) {
      this.overheatCause = this.beam.ends.some((end) => end.kind === 'mine') ? 'mine' : 'feedback';
    }
    const change = this.isBeamOverheating
      ? this.rules.overloadRisePerSecond * seconds
      : -this.rules.overloadDecayPerSecond * seconds;
    this.overload = Math.min(1, Math.max(0, this.overload + change));
  }

  private checkForLostLife(): void {
    if (this.overload >= 1) this.loseLife(this.overheatCause);
    else if (this.energy <= 0) this.loseLife('energy');
    else if (this.timeRemaining <= 0) this.loseLife('time');
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

function endKey(end: BeamEnd): string {
  return 'tile' in end ? `${end.kind}:${end.tile.x},${end.tile.y}` : end.kind;
}
