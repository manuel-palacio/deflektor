import { parseLevel } from './level';
import { solveLevel } from './solver';
import { DIRECTION_COUNT, type LevelDefinition } from './types';

/** Targets for a three-star result. */
export interface Par {
  rotations: number;
  seconds: number;
}

/** How a level was played. */
export interface Performance {
  rotations: number;
  seconds: number;
  restarts: number;
  hintsUsed: number;
}

export type Stars = 1 | 2 | 3;

/** Slack over the solver's minimum: players explore, and the solver ignores timing of moving parts. */
const ROTATION_SLACK = 1.5;
const BASE_SECONDS = 10;
const SECONDS_PER_TARGET = 2.5;
const SECONDS_PER_CLICK = 0.35;

/** Par derived from the solver: the fewest clicks its solution needs, plus slack; time grows with the work. */
export function computePar(level: LevelDefinition): Par {
  const board = parseLevel(level);
  const rotations = new Map<string, number>();
  board.tiles.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile.kind === 'mirror') rotations.set(`${x},${y}`, tile.rotation);
    }),
  );
  const stages = solveLevel(level);
  let clicks = 0;
  for (const stage of stages) {
    for (const { tile, rotation } of stage.settings) {
      const key = `${tile.x},${tile.y}`;
      clicks += clickDistance(rotations.get(key) ?? 0, rotation);
      rotations.set(key, rotation);
    }
  }
  return {
    rotations: Math.ceil(clicks * ROTATION_SLACK) + 1,
    seconds: Math.ceil(BASE_SECONDS + stages.length * SECONDS_PER_TARGET + clicks * SECONDS_PER_CLICK),
  };
}

/**
 * 1 star for solving, 2 for staying within the rotation limit, 3 for beating both limits
 * without restarting or asking for a hint.
 */
export function rateStars(performance: Performance, par: Par): Stars {
  const withinRotations = performance.rotations <= par.rotations;
  const withinTime = performance.seconds <= par.seconds;
  const unaided = performance.restarts === 0 && performance.hintsUsed === 0;
  if (withinRotations && withinTime && unaided) return 3;
  if (withinRotations) return 2;
  return 1;
}

/** Clicks needed to turn a mirror from one rotation to another, taking the shorter way round. */
export function clickDistance(from: number, to: number): number {
  const clockwise = (((to - from) % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT;
  return Math.min(clockwise, DIRECTION_COUNT - clockwise);
}
