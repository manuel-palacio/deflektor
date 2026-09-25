import { wrapDirection } from './beam';
import { BOARD_COLS, BOARD_ROWS, DIRECTION_COUNT, type Board, type Point, type Tile } from './types';

export const MACHINERY_TIMING = {
  autoMirrorStepSeconds: 0.4,
  polarizerStepSeconds: 0.5,
  refractorShuffleSeconds: 0.6,
  podMoveSeconds: 0.9,
} as const;

export interface PodMove {
  from: Point;
  to: Point;
}

const POLARIZER_AXES = 8;
/** Self-rotating mirrors cycle through 8 orientations (two of the 16 mirror steps at a time). */
const AUTO_MIRROR_STEP = 2;

/** The parts of a level that move by themselves: rotating mirrors, polarisers and refractors. */
export class Machinery {
  private autoMirrorClock = 0;
  private polarizerClock = 0;
  private refractorClock = 0;
  private podClock = 0;

  constructor(
    private readonly board: Board,
    private readonly random: () => number,
  ) {
    this.forEachTile((tile) => {
      if (tile.kind === 'refractor') tile.direction = this.randomDirection();
      if (tile.kind === 'polarizer') tile.axis = Math.floor(this.random() * POLARIZER_AXES);
    });
  }

  /** Moves the machinery on; returns the moving pods that changed tile. */
  advance(seconds: number): PodMove[] {
    const mirrorSteps = this.stepsDue('autoMirrorClock', seconds, MACHINERY_TIMING.autoMirrorStepSeconds);
    const polarizerSteps = this.stepsDue('polarizerClock', seconds, MACHINERY_TIMING.polarizerStepSeconds);
    const shuffleRefractors = this.stepsDue('refractorClock', seconds, MACHINERY_TIMING.refractorShuffleSeconds) > 0;
    this.forEachTile((tile) => {
      if (tile.kind === 'mirror' && tile.auto) tile.rotation = wrapDirection(tile.rotation + mirrorSteps * AUTO_MIRROR_STEP);
      if (tile.kind === 'polarizer') tile.axis = (tile.axis + polarizerSteps) % POLARIZER_AXES;
      if (tile.kind === 'refractor' && shuffleRefractors) tile.direction = this.randomDirection();
    });
    const podSteps = this.stepsDue('podClock', seconds, MACHINERY_TIMING.podMoveSeconds);
    const moves: PodMove[] = [];
    for (let step = 0; step < podSteps; step++) moves.push(...this.movePods());
    return moves;
  }

  /** Each moving pod steps one tile along its axis, turning round when blocked by anything but empty space. */
  private movePods(): PodMove[] {
    const movers: Point[] = [];
    this.board.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile.kind === 'pod' && tile.moves) movers.push({ x, y });
      }),
    );
    return movers.flatMap((from) => {
      const pod = this.board.tiles[from.y][from.x] as Extract<Tile, { kind: 'pod' }>;
      const forward = pod.heading ?? 1;
      for (const heading of [forward, forward === 1 ? -1 : 1] as const) {
        const to = pod.moves === 'horizontal' ? { x: from.x + heading, y: from.y } : { x: from.x, y: from.y + heading };
        if (this.isFree(to)) {
          this.board.tiles[to.y][to.x] = { ...pod, heading };
          this.board.tiles[from.y][from.x] = { kind: 'empty' };
          return [{ from, to }];
        }
      }
      return [];
    });
  }

  private isFree(tile: Point): boolean {
    const inside = tile.x >= 0 && tile.y >= 0 && tile.x < BOARD_COLS && tile.y < BOARD_ROWS;
    if (!inside || this.board.tiles[tile.y][tile.x].kind !== 'empty') return false;
    const quarters = [0, 1].flatMap((dy) => [0, 1].map((dx) => this.board.walls[tile.y * 2 + dy][tile.x * 2 + dx]));
    return quarters.every((wall) => wall === 'none');
  }

  private stepsDue(
    clock: 'autoMirrorClock' | 'polarizerClock' | 'refractorClock' | 'podClock',
    seconds: number,
    period: number,
  ): number {
    this[clock] += seconds;
    const steps = Math.floor(this[clock] / period);
    this[clock] -= steps * period;
    return steps;
  }

  private randomDirection(): number {
    return Math.floor(this.random() * DIRECTION_COUNT);
  }

  private forEachTile(visit: (tile: Tile) => void): void {
    for (const row of this.board.tiles) row.forEach(visit);
  }
}
