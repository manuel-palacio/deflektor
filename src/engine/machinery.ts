import { wrapDirection } from './beam';
import { DIRECTION_COUNT, type Board, type Tile } from './types';

export const MACHINERY_TIMING = {
  autoMirrorStepSeconds: 0.4,
  polarizerStepSeconds: 0.5,
  refractorShuffleSeconds: 0.6,
} as const;

const POLARIZER_AXES = 8;

/** The parts of a level that move by themselves: rotating mirrors, polarisers and refractors. */
export class Machinery {
  private autoMirrorClock = 0;
  private polarizerClock = 0;
  private refractorClock = 0;

  constructor(
    private readonly board: Board,
    private readonly random: () => number,
  ) {
    this.forEachTile((tile) => {
      if (tile.kind === 'refractor') tile.direction = this.randomDirection();
      if (tile.kind === 'polarizer') tile.axis = Math.floor(this.random() * POLARIZER_AXES);
    });
  }

  advance(seconds: number): void {
    const mirrorSteps = this.stepsDue('autoMirrorClock', seconds, MACHINERY_TIMING.autoMirrorStepSeconds);
    const polarizerSteps = this.stepsDue('polarizerClock', seconds, MACHINERY_TIMING.polarizerStepSeconds);
    const shuffleRefractors = this.stepsDue('refractorClock', seconds, MACHINERY_TIMING.refractorShuffleSeconds) > 0;
    this.forEachTile((tile) => {
      if (tile.kind === 'mirror' && tile.auto) tile.rotation = wrapDirection(tile.rotation + mirrorSteps);
      if (tile.kind === 'polarizer') tile.axis = (tile.axis + polarizerSteps) % POLARIZER_AXES;
      if (tile.kind === 'refractor' && shuffleRefractors) tile.direction = this.randomDirection();
    });
  }

  private stepsDue(clock: 'autoMirrorClock' | 'polarizerClock' | 'refractorClock', seconds: number, period: number): number {
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
