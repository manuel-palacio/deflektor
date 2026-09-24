import { parseLevel } from '../../src/engine/level';
import type { Cardinal, LevelDefinition } from '../../src/engine/types';

const EMPTY_ROW = '...............';
const EMPTY_WALL_ROW = '..............................';

/** Builds a full 15x9 level from the given top rows; missing rows are empty. */
export function level(
  rows: string[],
  options: { emitter?: Cardinal; energySeconds?: number; walls?: string[] } = {},
): LevelDefinition {
  const tiles = rows.map((row) => row.padEnd(15, '.'));
  while (tiles.length < 9) tiles.push(EMPTY_ROW);
  const definition: LevelDefinition = {
    name: 'test',
    tiles,
    emitter: options.emitter ?? 'right',
    energySeconds: options.energySeconds ?? 100,
  };
  if (options.walls) {
    const walls = options.walls.map((row) => row.padEnd(30, '.'));
    while (walls.length < 18) walls.push(EMPTY_WALL_ROW);
    definition.walls = walls;
  }
  return definition;
}

export function board(rows: string[], options: Parameters<typeof level>[1] = {}) {
  return parseLevel(level(rows, options));
}
