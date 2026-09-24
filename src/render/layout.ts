import { BOARD_COLS, BOARD_ROWS, type Point } from '../engine/types';

/** Maps board tiles and beam lattice points to screen pixels for a given viewport. */
export class BoardLayout {
  readonly tileSize: number;
  readonly originX: number;
  readonly originY: number;

  constructor(width: number, height: number, reservedTop: number) {
    const padding = Math.max(8, Math.min(width, height) * 0.03);
    const availableWidth = width - padding * 2;
    const availableHeight = height - reservedTop - padding * 2;
    this.tileSize = Math.floor(Math.min(availableWidth / BOARD_COLS, availableHeight / BOARD_ROWS));
    this.originX = Math.round((width - this.tileSize * BOARD_COLS) / 2);
    this.originY = Math.round(reservedTop + (height - reservedTop - this.tileSize * BOARD_ROWS) / 2);
  }

  get boardWidth(): number {
    return this.tileSize * BOARD_COLS;
  }

  get boardHeight(): number {
    return this.tileSize * BOARD_ROWS;
  }

  tileCenter(tile: Point): Point {
    return {
      x: this.originX + (tile.x + 0.5) * this.tileSize,
      y: this.originY + (tile.y + 0.5) * this.tileSize,
    };
  }

  /** Beam points are in quarter-tile units from the board's top-left corner. */
  beamToPixels(point: Point): Point {
    return {
      x: this.originX + (point.x / 2) * this.tileSize,
      y: this.originY + (point.y / 2) * this.tileSize,
    };
  }

  tileAtPixel(pixel: Point): Point | undefined {
    const x = Math.floor((pixel.x - this.originX) / this.tileSize);
    const y = Math.floor((pixel.y - this.originY) / this.tileSize);
    const inside = x >= 0 && y >= 0 && x < BOARD_COLS && y < BOARD_ROWS;
    return inside ? { x, y } : undefined;
  }
}
