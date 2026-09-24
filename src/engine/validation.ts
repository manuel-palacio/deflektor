import { BOARD_COLS, BOARD_ROWS, WALL_COLS, WALL_ROWS, type LevelDefinition } from './types';

export interface LevelDiagnostic {
  level: string;
  message: string;
  layer?: 'tiles' | 'walls';
  /** 1-based row and column in the layer, when the problem has a position. */
  row?: number;
  column?: number;
}

export const TILE_CHARS = new Set([...'.ERo@x*pqTU#=+0123456789abcdef']);
export const WALL_CHARS = new Set([...'.#=+']);
const CARDINALS = new Set(['up', 'right', 'down', 'left']);

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
  return problems;
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
