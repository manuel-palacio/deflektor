import { describe, expect, it } from 'vitest';
import { BoardLayout } from '../../src/render/layout';

describe('BoardLayout', () => {
  const layout = new BoardLayout(1600, 1000, 100);

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
