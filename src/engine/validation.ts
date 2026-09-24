import { BOARD_COLS, BOARD_ROWS, WALL_COLS, WALL_ROWS, type LevelDefinition, type PieceSpec } from './types';

export interface LevelDiagnostic {
  level: string;
  message: string;
  layer?: 'tiles' | 'walls' | 'pieces';
  /** 1-based row and column in the layer, when the problem has a position. */
  row?: number;
  column?: number;
}

export const TILE_CHARS = new Set([...'.ERo@x*pqTU#=+0123456789abcdef']);
export const WALL_CHARS = new Set([...'.#=+']);
const CARDINALS = new Set(['up', 'right', 'down', 'left']);
const PIECE_TYPES = new Set(['mirror', 'pod', 'splitter', 'oneWay']);

/** Every structural problem in a level, with where it is, so a broken level can be fixed without guessing. */
export function validateLevel(level: LevelDefinition): LevelDiagnostic[] {
  const name = level.name || '(unnamed level)';
  const problems: LevelDiagnostic[] = [];
  const report = (message: string, where: Partial<LevelDiagnostic> = {}) => problems.push({ level: name, message, ...where });

  if (!CARDINALS.has(level.emitter)) report(`emitter direction must be up, right, down or left (got "${level.emitter}")`);
  if (!(level.energySeconds > 0)) report(`energySeconds must be a positive number (got ${level.energySeconds})`);
  checkGrid(level.tiles, 'tiles', BOARD_COLS, BOARD_ROWS, TILE_CHARS, report);
  if (level.walls) checkGrid(level.walls, 'walls', WALL_COLS, WALL_ROWS, WALL_CHARS, report);
  checkCounts(level.tiles, report);
  (level.pieces ?? []).forEach((piece, index) => {
    checkPiece(piece, index, report);
    const under = level.tiles[piece.y]?.[piece.x];
    if (under === 'E' || under === 'R') {
      report(`piece ${index + 1}: cannot replace the ${under === 'E' ? 'laser' : 'receiver'}`, { layer: 'pieces', row: piece.y + 1, column: piece.x + 1 });
    }
  });
  if (level.timeLimitSeconds !== undefined && !(level.timeLimitSeconds > 0)) {
    report(`timeLimitSeconds must be a positive number (got ${level.timeLimitSeconds})`);
  }
  return problems;
}

function checkPiece(piece: PieceSpec, index: number, report: Report): void {
  const where = { layer: 'pieces' as const, row: piece.y + 1, column: piece.x + 1 };
  const label = `piece ${index + 1}`;
  if (!PIECE_TYPES.has(piece.type)) report(`${label}: unknown type "${piece.type}"`, where);
  const inside = Number.isInteger(piece.x) && Number.isInteger(piece.y) && piece.x >= 0 && piece.y >= 0 && piece.x < BOARD_COLS && piece.y < BOARD_ROWS;
  if (!inside) report(`${label}: position (${piece.x}, ${piece.y}) is off the 15 x 9 board`, { layer: 'pieces' });
  if (piece.rotation !== undefined && !(Number.isInteger(piece.rotation) && piece.rotation >= 0 && piece.rotation < 16)) {
    report(`${label}: rotation must be a whole number from 0 to 15 (got ${piece.rotation})`, where);
  }
  if (piece.turns !== undefined && !(Number.isInteger(piece.turns) && piece.turns >= 0)) {
    report(`${label}: turns must be a whole number of at least 0 (got ${piece.turns})`, where);
  }
  if (piece.moves !== undefined && piece.moves !== 'horizontal' && piece.moves !== 'vertical') {
    report(`${label}: moves must be "horizontal" or "vertical" (got "${piece.moves}")`, where);
  }
  if ((piece.turns !== undefined || piece.fragile) && piece.type !== 'mirror') {
    report(`${label}: only mirrors can have limited turns or be fragile`, where);
  }
  if (piece.moves !== undefined && piece.type !== 'pod') report(`${label}: only pods can move`, where);
}

type Report = (message: string, where?: Partial<LevelDiagnostic>) => void;

function checkGrid(rows: string[], layer: 'tiles' | 'walls', columns: number, height: number, allowed: Set<string>, report: Report): void {
  if (rows.length !== height) report(`${layer} must have ${height} rows (got ${rows.length})`, { layer });
  rows.forEach((row, index) => {
    if (row.length !== columns) {
      report(`${layer} row must be ${columns} characters (got ${row.length})`, { layer, row: index + 1 });
    }
    [...row].forEach((char, column) => {
      if (!allowed.has(char)) report(`unknown ${layer === 'tiles' ? 'tile' : 'wall'} '${char}'`, { layer, row: index + 1, column: column + 1 });
    });
  });
}

function checkCounts(tiles: string[], report: Report): void {
  const positions = new Map<string, { row: number; column: number }[]>();
  tiles.forEach((row, y) =>
    [...row].forEach((char, x) => {
      const list = positions.get(char) ?? [];
      list.push({ row: y + 1, column: x + 1 });
      positions.set(char, list);
    }),
  );
  const describe = (list: { row: number; column: number }[]) => list.map((p) => `row ${p.row} col ${p.column}`).join(', ');
  for (const [char, label] of [['E', 'laser'], ['R', 'receiver']] as const) {
    const found = positions.get(char) ?? [];
    if (found.length !== 1) {
      report(`needs exactly one ${label} '${char}' (found ${found.length}${found.length ? `: ${describe(found)}` : ''})`, {
        layer: 'tiles',
        ...found[1],
      });
    }
  }
  for (const channel of ['T', 'U']) {
    const found = positions.get(channel) ?? [];
    if (found.length !== 0 && found.length !== 2) {
      report(`fibre '${channel}' needs exactly 2 ends (found ${found.length}: ${describe(found)})`, { layer: 'tiles', ...found[0] });
    }
  }
}

export function formatDiagnostic(diagnostic: LevelDiagnostic): string {
  const where =
    diagnostic.row !== undefined
      ? ` (${diagnostic.layer} row ${diagnostic.row}${diagnostic.column !== undefined ? `, col ${diagnostic.column}` : ''})`
      : '';
  return `Level "${diagnostic.level}": ${diagnostic.message}${where}`;
}
