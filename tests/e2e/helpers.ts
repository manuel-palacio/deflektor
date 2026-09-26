import { expect, type Page } from '@playwright/test';
import type { Point } from '../../src/engine/types';

export async function gameState(page: Page) {
  return page.evaluate(() => {
    const app = (window as any).__deflektor;
    const game = app.currentGame;
    return {
      screen: app.currentScreen as string,
      phase: game.phase as string,
      levelIndex: game.levelIndex as number,
      lives: game.lives as number,
      energy: game.energy as number,
      overload: game.overload as number,
      podsRemaining: game.podsRemaining as number,
    };
  });
}

export async function mirrorRotation(page: Page, tile: Point): Promise<number> {
  return page.evaluate(({ x, y }) => (window as any).__deflektor.currentGame.board.tiles[y][x].rotation, tile);
}

export async function clickTile(page: Page, tile: Point, button: 'left' | 'right' = 'left') {
  const point = await page.evaluate((target) => (window as any).__deflektor.tileToClient(target), tile);
  await page.mouse.click(point.x, point.y, { button });
}

export async function turnMirrorTo(page: Page, tile: Point, rotation: number) {
  const current = await mirrorRotation(page, tile);
  const clockwise = (rotation - current + 16) % 16;
  const button = clockwise <= 8 ? 'left' : 'right';
  const clicks = clockwise <= 8 ? clockwise : 16 - clockwise;
  for (let click = 0; click < clicks; click++) await clickTile(page, tile, button);
  await expect.poll(() => mirrorRotation(page, tile)).toBe(rotation);
}

export async function startLevel(page: Page, level: number) {
  await page.click('#title-play');
  await page.click(`.level-button[data-level="${level}"]`);
  await expect(page.locator('#hud')).toBeVisible();
}

export async function inspectRenderer(page: Page) {
  return page.evaluate(() => (window as any).__deflektor.inspectRenderer());
}

export async function soundLog(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as any).__deflektor.soundLog]);
}

/** Moves the mouse over a tile without clicking. */
export async function hoverTile(page: Page, tile: Point) {
  const point = await page.evaluate((target) => (window as any).__deflektor.tileToClient(target), tile);
  await page.mouse.move(point.x, point.y);
}

/** Waits until the laser has finished charging. */
export async function waitForLaser(page: Page) {
  await page.waitForFunction(() => {
    const game = (window as any).__deflektor?.currentGame;
    return game !== undefined && !game.isCharging;
  }, undefined, { timeout: 20_000 });
}
