import { describe, expect, it } from 'vitest';
import { BoardLayout, placeBoard } from '../../src/render/layout';

describe('BoardLayout', () => {
  const layout = new BoardLayout(1600, 1000, 100);

  it('keeps the board near the top, leaving spare room below it for tips', () => {
    const tall = new BoardLayout(1000, 1200, 100);
    const below = 1200 - (tall.originY + tall.boardHeight);
    expect(tall.originY - 100).toBeLessThan(below);
  });

  it('fits the 15x9 board inside the space below the HUD', () => {
    expect(layout.boardWidth).toBeLessThanOrEqual(1600);
    expect(layout.originY).toBeGreaterThanOrEqual(100);
    expect(layout.originY + layout.boardHeight).toBeLessThanOrEqual(1000);
  });

  it('centers the board horizontally', () => {
    expect(Math.abs(layout.originX * 2 + layout.boardWidth - 1600)).toBeLessThanOrEqual(1);
  });

  it('places beam points at tile centres on the tile centres', () => {
    expect(layout.beamToPixels({ x: 7, y: 5 })).toEqual(layout.tileCenter({ x: 3, y: 2 }));
  });

  it('round-trips a pixel inside a tile back to that tile', () => {
    expect(layout.tileAtPixel(layout.tileCenter({ x: 14, y: 8 }))).toEqual({ x: 14, y: 8 });
  });

  it('finds no tile for pixels outside the board', () => {
    expect(layout.tileAtPixel({ x: 0, y: 0 })).toBeUndefined();
  });
});

describe('placeBoard', () => {
  it('keeps room under the board for tips when that costs it little (desktop)', () => {
    const { layout } = placeBoard(1280, 800, 60);
    expect(800 - (layout.originY + layout.boardHeight)).toBeGreaterThanOrEqual(56);
  });

  it('keeps room under a turned board on a shorter phone too (iPhone 15 in Safari: 393 x 659)', () => {
    const { layout, rotated } = placeBoard(393, 659, 110);
    expect(rotated).toBe(true);
    expect(659 - (110 + layout.originX + layout.boardWidth)).toBeGreaterThanOrEqual(56);
  });

  it('still turns the board above the touch bar, even when tip room makes both ways tie (iPhone 15: 393 x 579 under a 131 px HUD)', () => {
    expect(placeBoard(393, 579, 131).rotated).toBe(true);
  });

  it('does not squeeze a landscape phone board for tips (they go beside it instead)', () => {
    const { layout } = placeBoard(780, 360, 45);
    expect(layout.tileSize).toBe(new BoardLayout(780, 360, 45).tileSize);
  });

  it('puts a landscape phone board on the left so the spare width is one strip wide enough for tips', () => {
    const { layout } = placeBoard(696, 360, 45);
    expect(696 - (layout.originX + layout.boardWidth)).toBeGreaterThanOrEqual(150);
  });

  it('keeps the board upright on landscape screens', () => {
    const placement = placeBoard(1280, 800, 60);
    expect(placement.rotated).toBe(false);
    expect(placement.offset).toEqual({ x: 0, y: 0 });
  });

  it('turns the board on a portrait phone, giving much bigger tiles', () => {
    const upright = new BoardLayout(390, 844, 110);
    const placement = placeBoard(390, 844, 110);
    expect(placement.rotated).toBe(true);
    expect(placement.layout.tileSize).toBeGreaterThan(upright.tileSize * 1.5);
    expect(placement.offset).toEqual({ x: 390, y: 110 });
  });

  it('leaves the spare room below a turned board too (Galaxy S23: 360 x 780)', () => {
    const { layout } = placeBoard(360, 780, 110);
    const boardBottomOnScreen = 110 + layout.originX + layout.boardWidth;
    expect(780 - boardBottomOnScreen).toBeGreaterThan(60);
  });

  it('fits the turned board inside the screen below the HUD', () => {
    const { layout } = placeBoard(390, 844, 110);
    // Board space x runs down the screen and board space y runs right-to-left across it.
    expect(layout.originX + layout.boardWidth).toBeLessThanOrEqual(844 - 110);
    expect(layout.originY + layout.boardHeight).toBeLessThanOrEqual(390);
  });
});
