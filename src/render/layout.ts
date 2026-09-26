import { BOARD_COLS, BOARD_ROWS, type Point } from '../engine/types';

/** Maps board tiles and beam lattice points to screen pixels for a given viewport. */
export class BoardLayout {
  readonly tileSize: number;
  readonly originX: number;
  readonly originY: number;

  /**
   * `startAxis` says which axis hugs its start instead of centring: spare room then collects at the
   * far end (below the board on screen), where tips can be shown without covering it.
   */
  constructor(width: number, height: number, reservedTop: number, startAxis: 'x' | 'y' = 'y', reservedBottom = 0) {
    // Small screens need every pixel: a thin margin; larger screens get a little air round the frame.
    const padding = Math.min(width, height) < 500 ? 4 : Math.max(8, Math.min(width, height) * 0.03);
    const availableWidth = width - padding * 2;
    const availableHeight = height - reservedTop - reservedBottom - padding * 2;
    this.tileSize = Math.floor(Math.min(availableWidth / BOARD_COLS, availableHeight / BOARD_ROWS));
    const spareX = width - this.tileSize * BOARD_COLS;
    const spareY = height - reservedTop - this.tileSize * BOARD_ROWS;
    this.originX = Math.round(startAxis === 'x' ? Math.min(spareX / 2, padding) : spareX / 2);
    this.originY = Math.round(reservedTop + (startAxis === 'y' ? Math.min(spareY / 2, padding) : spareY / 2));
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

/** Where the board goes on screen: its layout in board space, and whether it is turned a quarter clockwise. */
export interface BoardPlacement {
  layout: BoardLayout;
  rotated: boolean;
  /** Screen position of the board space's origin. */
  offset: Point;
}

/**
 * On tall screens (portrait phones) the wide 15 x 9 board is turned 90° so it can use the height;
 * whichever orientation gives bigger tiles wins.
 */
export function placeBoard(width: number, height: number, reservedTop: number): BoardPlacement {
  // Orientation is decided on the biggest tiles each allows; room for tips is traded off afterwards.
  const upright = new BoardLayout(width, height, reservedTop);
  // Turned a quarter, board-space x runs down the screen, so that is the axis that hugs the top.
  const turned = new BoardLayout(height - reservedTop, width, 0, 'x');
  if (turned.tileSize > upright.tileSize) {
    return { layout: turnedLayout(width, height, reservedTop), rotated: true, offset: { x: width, y: reservedTop } };
  }
  return { layout: uprightLayout(width, height, reservedTop), rotated: false, offset: { x: 0, y: 0 } };
}

/** Room kept free under the board for tips, when it costs the board little. */
const TIP_ROOM = 64;
const MAX_SHRINK_FOR_TIPS = 0.85;

function uprightLayout(width: number, height: number, reservedTop: number): BoardLayout {
  const full = new BoardLayout(width, height, reservedTop);
  const withRoom = new BoardLayout(width, height, reservedTop, 'y', TIP_ROOM);
  if (withRoom.tileSize >= full.tileSize * MAX_SHRINK_FOR_TIPS) return withRoom;
  // No room below (landscape phones): hug the left so the spare width collects in one strip for tips.
  return new BoardLayout(width, height, reservedTop, 'x');
}

/** The same trade-off for a board turned a quarter, whose board-space x axis runs down the screen. */
function turnedLayout(width: number, height: number, reservedTop: number): BoardLayout {
  const full = new BoardLayout(height - reservedTop, width, 0, 'x');
  const withRoom = new BoardLayout(height - reservedTop - TIP_ROOM, width, 0, 'x');
  return withRoom.tileSize >= full.tileSize * MAX_SHRINK_FOR_TIPS ? withRoom : full;
}
