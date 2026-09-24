import {
  CARDINAL_DIRECTION,
  WALL_COLS,
  WALL_ROWS,
  type Board,
  type LevelDefinition,
  type Point,
  type Tile,
  type WallKind,
} from './types';
import { formatDiagnostic, validateLevel } from './validation';

/** '#' purple bricks reflect, '=' light-blue bricks absorb, '+' light-blue gates vanish when the receiver opens. */
const WALL_CHARS: Record<string, WallKind> = { '.': 'none', '#': 'reflect', '=': 'absorb', '+': 'gate' };
/** A '#', '=' or '+' in the tile map is shorthand for a whole tile of that wall. */
const FULL_TILE_WALLS: Record<string, WallKind> = { '#': 'reflect', '=': 'absorb', '+': 'gate' };

export class LevelFormatError extends Error {}

/** Builds a playable board, or throws with every problem found (see validateLevel). */
export function parseLevel(level: LevelDefinition): Board {
  const problems = validateLevel(level);
  if (problems.length > 0) throw new LevelFormatError(problems.map(formatDiagnostic).join('\n'));
  const walls = parseWalls(level);
  const tiles = level.tiles.map((row, y) =>
    [...row].map((char, x) => {
      if (char in FULL_TILE_WALLS) {
        fillTileWalls(walls, { x, y }, FULL_TILE_WALLS[char]);
        return { kind: 'empty' } as Tile;
      }
      return parseTile(char, level);
    }),
  );
  return { tiles, walls };
}

export function findTiles(board: Board, kind: Tile['kind']): Point[] {
  const found: Point[] = [];
  board.tiles.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile.kind === kind) found.push({ x, y });
    }),
  );
  return found;
}

export function tileAt(board: Board, point: Point): Tile | undefined {
  return board.tiles[point.y]?.[point.x];
}

function parseTile(char: string, level: LevelDefinition): Tile {
  if (/^[0-9a-f]$/.test(char)) return { kind: 'mirror', rotation: parseInt(char, 16), auto: false };
  switch (char) {
    case '.':
      return { kind: 'empty' };
    case 'E':
      return { kind: 'emitter', direction: CARDINAL_DIRECTION[level.emitter] };
    case 'R':
      return { kind: 'receiver' };
    case '@':
      return { kind: 'mirror', rotation: 0, auto: true };
    case 'o':
      return { kind: 'pod' };
    case 'x':
      return { kind: 'mine' };
    case '*':
      return { kind: 'refractor', direction: 0 };
    case 'p':
      return { kind: 'polarizer', axis: 0, reflects: false };
    case 'q':
      return { kind: 'polarizer', axis: 0, reflects: true };
    case 'T':
    case 'U':
      return { kind: 'fibre', channel: char };
    default:
      return { kind: 'empty' };
  }
}

function parseWalls(level: LevelDefinition): WallKind[][] {
  const rows = level.walls ?? Array.from({ length: WALL_ROWS }, () => '.'.repeat(WALL_COLS));
  return rows.map((row) => [...row].map((char) => WALL_CHARS[char]));
}

function fillTileWalls(walls: WallKind[][], tile: Point, kind: WallKind): void {
  for (const qy of [tile.y * 2, tile.y * 2 + 1]) {
    for (const qx of [tile.x * 2, tile.x * 2 + 1]) walls[qy][qx] = kind;
  }
}
