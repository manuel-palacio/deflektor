import {
  BOARD_COLS,
  BOARD_ROWS,
  CARDINAL_DIRECTION,
  WALL_COLS,
  WALL_ROWS,
  type Board,
  type LevelDefinition,
  type Point,
  type Tile,
  type WallKind,
} from './types';

/** '#' purple bricks reflect, '=' light-blue bricks absorb, '+' light-blue gates vanish when the receiver opens. */
const WALL_CHARS: Record<string, WallKind> = { '.': 'none', '#': 'reflect', '=': 'absorb', '+': 'gate' };
/** A '#' or '=' in the tile map is shorthand for a whole tile of that wall. */
const FULL_TILE_WALLS: Record<string, WallKind> = { '#': 'reflect', '=': 'absorb' };

export class LevelFormatError extends Error {}

export function parseLevel(level: LevelDefinition): Board {
  assertDimensions(level);
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
  const board = { tiles, walls };
  assertSingle(board, 'emitter', level.name);
  assertSingle(board, 'receiver', level.name);
  assertFibrePairs(board, level.name);
  return board;
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
      throw new LevelFormatError(`Level "${level.name}": unknown tile '${char}'`);
  }
}

function parseWalls(level: LevelDefinition): WallKind[][] {
  const rows = level.walls ?? Array.from({ length: WALL_ROWS }, () => '.'.repeat(WALL_COLS));
  return rows.map((row) =>
    [...row].map((char) => {
      if (!(char in WALL_CHARS)) throw new LevelFormatError(`Level "${level.name}": unknown wall '${char}'`);
      return WALL_CHARS[char];
    }),
  );
}

function fillTileWalls(walls: WallKind[][], tile: Point, kind: WallKind): void {
  for (const qy of [tile.y * 2, tile.y * 2 + 1]) {
    for (const qx of [tile.x * 2, tile.x * 2 + 1]) walls[qy][qx] = kind;
  }
}

function assertDimensions(level: LevelDefinition): void {
  const tilesValid = level.tiles.length === BOARD_ROWS && level.tiles.every((row) => row.length === BOARD_COLS);
  const wallsValid =
    !level.walls || (level.walls.length === WALL_ROWS && level.walls.every((row) => row.length === WALL_COLS));
  if (!tilesValid || !wallsValid) {
    throw new LevelFormatError(
      `Level "${level.name}": tiles must be ${BOARD_COLS}x${BOARD_ROWS} and walls ${WALL_COLS}x${WALL_ROWS}`,
    );
  }
}

function assertSingle(board: Board, kind: Tile['kind'], name: string): void {
  const count = findTiles(board, kind).length;
  if (count !== 1) throw new LevelFormatError(`Level "${name}": expected one ${kind}, found ${count}`);
}

function assertFibrePairs(board: Board, name: string): void {
  const counts = new Map<string, number>();
  for (const row of board.tiles) {
    for (const tile of row) {
      if (tile.kind === 'fibre') counts.set(tile.channel, (counts.get(tile.channel) ?? 0) + 1);
    }
  }
  for (const [channel, count] of counts) {
    if (count !== 2) throw new LevelFormatError(`Level "${name}": fibre ${channel} needs exactly 2 ends`);
  }
}
