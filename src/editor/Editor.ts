import { computePar } from '../engine/scoring';
import { solveLevel } from '../engine/solver';
import { BOARD_COLS, BOARD_ROWS, WALL_COLS, WALL_ROWS, type Cardinal, type LevelDefinition, type PieceSpec } from '../engine/types';
import { formatDiagnostic, validateLevel } from '../engine/validation';

/** Where the editor keeps the level being worked on, and hands a level to the game for a test play. */
export const DRAFT_KEY = 'deflektor.editor.draft';
export const PLAYTEST_KEY = 'deflektor.editor.playtest';

interface Brush {
  label: string;
  /** Tile character, wall character, or a parameterised piece. */
  tile?: string;
  wall?: string;
  piece?: Omit<PieceSpec, 'x' | 'y'>;
}

const BRUSHES: Brush[] = [
  { label: 'Erase', tile: '.' },
  { label: 'Laser', tile: 'E' },
  { label: 'Receiver', tile: 'R' },
  { label: 'Mirror', tile: '0' },
  { label: 'Rotating mirror', tile: '@' },
  { label: 'Cell', tile: 'o' },
  { label: 'Mine', tile: 'x' },
  { label: 'Prism', tile: '*' },
  { label: 'Polariser (absorbs)', tile: 'p' },
  { label: 'Polariser (reflects)', tile: 'q' },
  { label: 'Fibre T', tile: 'T' },
  { label: 'Fibre U', tile: 'U' },
  { label: 'Purple brick', wall: '#' },
  { label: 'Blue brick', wall: '=' },
  { label: 'Gate', wall: '+' },
  { label: 'Clear brick', wall: '.' },
  { label: 'Splitter', piece: { type: 'splitter', rotation: 4 } },
  { label: 'One-way mirror', piece: { type: 'oneWay', rotation: 4 } },
  { label: 'Limited mirror (5 turns)', piece: { type: 'mirror', rotation: 0, turns: 5 } },
  { label: 'Fragile mirror', piece: { type: 'mirror', rotation: 0, fragile: true } },
  { label: 'Moving cell ↔', piece: { type: 'pod', moves: 'horizontal' } },
  { label: 'Moving cell ↕', piece: { type: 'pod', moves: 'vertical' } },
];

const GLYPHS: Record<string, string> = {
  E: '▶', R: '◎', o: '●', x: '✹', '*': '⧗', p: '▤', q: '▥', T: 'T', U: 'U', '@': '⟳',
};

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** A blank 15 x 9 level with a laser on the left and a receiver on the right. */
export function blankLevel(): LevelDefinition {
  const tiles = Array.from({ length: BOARD_ROWS }, () => '.'.repeat(BOARD_COLS));
  tiles[4] = 'E' + '.'.repeat(BOARD_COLS - 2) + 'R';
  return {
    id: 'custom',
    name: 'My level',
    emitter: 'right',
    energySeconds: 150,
    tiles,
    walls: Array.from({ length: WALL_ROWS }, () => '.'.repeat(WALL_COLS)),
    pieces: [],
  };
}

/** Pure edits on a level definition (kept separate from the DOM so they can be unit-tested). */
export const edits = {
  setTile(level: LevelDefinition, x: number, y: number, char: string): LevelDefinition {
    const pieces = (level.pieces ?? []).filter((piece) => piece.x !== x || piece.y !== y);
    return { ...level, tiles: replaceChar(level.tiles, x, y, char), pieces };
  },
  setWall(level: LevelDefinition, qx: number, qy: number, char: string): LevelDefinition {
    const walls = level.walls ?? Array.from({ length: WALL_ROWS }, () => '.'.repeat(WALL_COLS));
    return { ...level, walls: replaceChar(walls, qx, qy, char) };
  },
  setPiece(level: LevelDefinition, piece: PieceSpec): LevelDefinition {
    const cleared = edits.setTile(level, piece.x, piece.y, '.');
    return { ...cleared, pieces: [...(cleared.pieces ?? []), piece] };
  },
  /** Turns the mirror (or rotatable piece) at a tile one step clockwise. */
  rotate(level: LevelDefinition, x: number, y: number): LevelDefinition {
    const piece = level.pieces?.find((candidate) => candidate.x === x && candidate.y === y);
    if (piece && piece.rotation !== undefined) {
      const turned = { ...piece, rotation: (piece.rotation + 1) % 16 };
      return { ...level, pieces: level.pieces!.map((candidate) => (candidate === piece ? turned : candidate)) };
    }
    const char = level.tiles[y][x];
    if (!/^[0-9a-f]$/.test(char)) return level;
    return edits.setTile(level, x, y, ((parseInt(char, 16) + 1) % 16).toString(16));
  },
};

/** What the Check button reports. */
export function checkLevel(level: LevelDefinition): { ok: boolean; lines: string[] } {
  const problems = validateLevel(level);
  if (problems.length > 0) return { ok: false, lines: problems.map(formatDiagnostic) };
  try {
    const stages = solveLevel(level);
    const par = computePar(level);
    return {
      ok: true,
      lines: [`Solvable: ${stages.length - 1} cells, then the receiver.`, `Par: ${par.rotations} turns, ${par.seconds} s.`],
    };
  } catch (error) {
    return { ok: false, lines: [`Not solvable yet: ${(error as Error).message}`] };
  }
}

/** A small DOM editor: paint pieces and bricks, check the level, export it or play it. */
export class Editor {
  private level: LevelDefinition;
  private brush = BRUSHES[3];
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly storage: Storage,
    private readonly playtest: (level: LevelDefinition) => void,
  ) {
    this.level = this.loadDraft();
    this.root = document.createElement('div');
    this.root.className = 'editor';
    this.root.innerHTML = EDITOR_HTML;
    host.appendChild(this.root);
    this.buildPalette();
    this.bindFields();
    this.render();
  }

  private loadDraft(): LevelDefinition {
    try {
      const saved = this.storage.getItem(DRAFT_KEY);
      return saved ? (JSON.parse(saved) as LevelDefinition) : blankLevel();
    } catch {
      return blankLevel();
    }
  }

  private update(level: LevelDefinition): void {
    this.level = level;
    try {
      this.storage.setItem(DRAFT_KEY, JSON.stringify(level));
    } catch {
      // The draft still lives in memory.
    }
    this.render();
  }

  private buildPalette(): void {
    const palette = this.find('.editor-palette');
    for (const brush of BRUSHES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = brush.label;
      button.dataset.brush = brush.label;
      button.addEventListener('click', () => {
        this.brush = brush;
        this.render();
      });
      palette.appendChild(button);
    }
  }

  private bindFields(): void {
    const name = this.find<HTMLInputElement>('#editor-name');
    const emitter = this.find<HTMLSelectElement>('#editor-emitter');
    const energy = this.find<HTMLInputElement>('#editor-energy');
    const time = this.find<HTMLInputElement>('#editor-time');
    name.addEventListener('input', () => this.update({ ...this.level, name: name.value }));
    emitter.addEventListener('change', () => this.update({ ...this.level, emitter: emitter.value as Cardinal }));
    energy.addEventListener('input', () => this.update({ ...this.level, energySeconds: Number(energy.value) }));
    time.addEventListener('input', () => {
      const { timeLimitSeconds: _unused, ...rest } = this.level;
      this.update(time.value ? { ...rest, timeLimitSeconds: Number(time.value) } : rest);
    });
    this.find('#editor-check').addEventListener('click', () => this.showCheck());
    this.find('#editor-export').addEventListener('click', () => {
      this.find<HTMLTextAreaElement>('#editor-json').value = JSON.stringify(this.level, null, 2);
    });
    this.find('#editor-import').addEventListener('click', () => this.importJson());
    this.find('#editor-new').addEventListener('click', () => this.update(blankLevel()));
    this.find('#editor-play').addEventListener('click', () => this.playtest(this.level));
    this.find('.editor-board').addEventListener('click', (event) => this.paint(event as MouseEvent));
    this.find('.editor-board').addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const cell = this.cellAt(event as MouseEvent);
      if (cell) this.update(edits.rotate(this.level, cell.x, cell.y));
    });
  }

  private paint(event: MouseEvent): void {
    const cell = this.cellAt(event);
    if (!cell) return;
    if (this.brush.wall !== undefined) this.update(edits.setWall(this.level, cell.qx, cell.qy, this.brush.wall));
    else if (this.brush.piece) this.update(edits.setPiece(this.level, { ...this.brush.piece, x: cell.x, y: cell.y }));
    else this.update(edits.setTile(this.level, cell.x, cell.y, this.brush.tile!));
  }

  private cellAt(event: MouseEvent): { x: number; y: number; qx: number; qy: number } | undefined {
    const board = this.find('.editor-board').getBoundingClientRect();
    const qx = Math.floor(((event.clientX - board.left) / board.width) * WALL_COLS);
    const qy = Math.floor(((event.clientY - board.top) / board.height) * WALL_ROWS);
    if (qx < 0 || qy < 0 || qx >= WALL_COLS || qy >= WALL_ROWS) return undefined;
    return { x: Math.floor(qx / 2), y: Math.floor(qy / 2), qx, qy };
  }

  private showCheck(): void {
    const result = checkLevel(this.level);
    const report = this.find('#editor-report');
    report.className = result.ok ? 'editor-report ok' : 'editor-report problem';
    report.replaceChildren(...result.lines.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
  }

  private importJson(): void {
    try {
      this.update(JSON.parse(this.find<HTMLTextAreaElement>('#editor-json').value) as LevelDefinition);
    } catch (error) {
      this.find('#editor-report').textContent = `Could not read that JSON: ${(error as Error).message}`;
    }
  }

  private render(): void {
    this.find<HTMLInputElement>('#editor-name').value = this.level.name;
    this.find<HTMLSelectElement>('#editor-emitter').value = this.level.emitter;
    this.find<HTMLInputElement>('#editor-energy').value = String(this.level.energySeconds);
    this.find<HTMLInputElement>('#editor-time').value = this.level.timeLimitSeconds ? String(this.level.timeLimitSeconds) : '';
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.editor-palette button')) {
      button.setAttribute('aria-pressed', String(button.dataset.brush === this.brush.label));
    }
    const board = this.find('.editor-board');
    const cells: HTMLElement[] = [];
    (this.level.walls ?? []).forEach((row, qy) =>
      [...row].forEach((wall, qx) => {
        if (wall === '.') return;
        cells.push(cell('editor-brick', `brick-${wall === '#' ? 'purple' : wall === '=' ? 'blue' : 'gate'}`, qx, qy, 1));
      }),
    );
    this.level.tiles.forEach((row, y) =>
      [...row].forEach((char, x) => {
        if (char === '.') return;
        const tile = cell('editor-tile', `tile-${char === '#' || char === '=' || char === '+' ? 'wall' : 'piece'}`, x * 2, y * 2, 2);
        tile.textContent = /^[0-9a-f]$/.test(char) ? mirrorGlyph(parseInt(char, 16)) : GLYPHS[char] ?? char;
        tile.title = /^[0-9a-f]$/.test(char) ? `Mirror, rotation ${parseInt(char, 16)} (right-click to turn)` : char;
        cells.push(tile);
      }),
    );
    for (const piece of this.level.pieces ?? []) {
      const tile = cell('editor-tile', 'tile-special', piece.x * 2, piece.y * 2, 2);
      tile.textContent = pieceGlyph(piece);
      tile.title = `${piece.type}${piece.rotation !== undefined ? `, rotation ${piece.rotation}` : ''}${piece.turns !== undefined ? `, ${piece.turns} turns` : ''}${piece.fragile ? ', fragile' : ''}${piece.moves ? `, moves ${piece.moves}` : ''}`;
      cells.push(tile);
    }
    board.replaceChildren(...cells);
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector(selector) as T;
  }
}

function replaceChar(rows: string[], x: number, y: number, char: string): string[] {
  return rows.map((row, index) => (index === y ? row.slice(0, x) + char + row.slice(x + 1) : row));
}

function cell(base: string, variant: string, column: number, row: number, span: number): HTMLElement {
  const element = document.createElement('div');
  element.className = `${base} ${variant}`;
  element.style.gridColumn = `${column + 1} / span ${span}`;
  element.style.gridRow = `${row + 1} / span ${span}`;
  return element;
}

function mirrorGlyph(rotation: number): string {
  return ['│', '╱', '╱', '╱', '╱', '╱', '─', '─', '─', '─', '─', '╲', '╲', '╲', '╲', '│'][rotation] + rotation.toString(16);
}

function pieceGlyph(piece: PieceSpec): string {
  if (piece.type === 'splitter') return `◫${piece.rotation ?? 0}`;
  if (piece.type === 'oneWay') return `◧${piece.rotation ?? 0}`;
  if (piece.type === 'pod') return piece.moves === 'vertical' ? '●↕' : '●↔';
  return `${piece.fragile ? '✧' : '⊘'}${piece.turns ?? ''}`;
}

const EDITOR_HTML = `
  <header class="editor-header">
    <h1>Level editor</h1>
    <p>Pick a brush, click the board. Right-click a mirror to turn it. Bricks paint quarter tiles.</p>
  </header>
  <div class="editor-body">
    <div class="editor-palette" role="toolbar" aria-label="Brushes"></div>
    <div class="editor-main">
      <div class="editor-board" aria-label="Level board"></div>
      <div class="editor-fields">
        <label>Name <input id="editor-name" /></label>
        <label>Laser fires <select id="editor-emitter"><option>right</option><option>left</option><option>up</option><option>down</option></select></label>
        <label>Energy (s) <input id="editor-energy" type="number" min="10" step="10" /></label>
        <label>Time limit (s) <input id="editor-time" type="number" min="0" step="5" placeholder="none" /></label>
      </div>
      <div class="editor-actions">
        <button id="editor-check" type="button">Check</button>
        <button id="editor-play" type="button">Play</button>
        <button id="editor-export" type="button">Export JSON</button>
        <button id="editor-import" type="button">Import JSON</button>
        <button id="editor-new" type="button">New</button>
      </div>
      <ul id="editor-report" class="editor-report"></ul>
      <textarea id="editor-json" rows="10" spellcheck="false" aria-label="Level JSON"></textarea>
    </div>
  </div>`;
