import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/engine/levels';
import type { Point } from '../../src/engine/types';
import { solveReceiverWithMirrorsOnly } from '../support/solver';

async function gameState(page: Page) {
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

async function mirrorRotation(page: Page, tile: Point): Promise<number> {
  return page.evaluate(({ x, y }) => (window as any).__deflektor.currentGame.board.tiles[y][x].rotation, tile);
}

async function clickTile(page: Page, tile: Point, button: 'left' | 'right' = 'left') {
  const point = await page.evaluate((target) => (window as any).__deflektor.tileToClient(target), tile);
  await page.mouse.click(point.x, point.y, { button });
}

async function turnMirrorTo(page: Page, tile: Point, rotation: number) {
  const current = await mirrorRotation(page, tile);
  const clockwise = (rotation - current + 16) % 16;
  const button = clockwise <= 8 ? 'left' : 'right';
  const clicks = clockwise <= 8 ? clockwise : 16 - clockwise;
  for (let click = 0; click < clicks; click++) await clickTile(page, tile, button);
  await expect.poll(() => mirrorRotation(page, tile)).toBe(rotation);
}

async function startLevel(page: Page, level: number) {
  await page.click('#title-play');
  await page.click(`.level-button[data-level="${level}"]`);
  await expect(page.locator('#hud')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-title')).toBeVisible();
});

test.describe('menus', () => {
  test('title leads to the level list with only the first level unlocked', async ({ page }) => {
    await page.click('#title-play');
    await expect(page.locator('.level-button')).toHaveCount(LEVELS.length);
    await expect(page.locator('.level-button[data-level="1"]')).toBeEnabled();
    await expect(page.locator('.level-button[data-level="2"]')).toBeDisabled();
  });

  test('starting a level shows the HUD with its number and three lives', async ({ page }) => {
    await startLevel(page, 1);
    await expect(page.locator('#hud-level-number')).toHaveText('01');
    await expect(page.locator('#hud-lives')).toHaveText('◆◆◆');
    expect((await gameState(page)).phase).toBe('playing');
  });

  test('each level starts with the laser charging before it fires', async ({ page }) => {
    await startLevel(page, 1);
    const label = page.locator('.meter-energy .meter-label');
    await expect(label).toHaveText('Charging laser');
    expect((await gameState(page)).overload).toBe(0);
    await expect(label).toHaveText('Energy', { timeout: 10_000 });
  });

  test('how-to-play explains the controls', async ({ page }) => {
    await page.click('#title-help-toggle');
    await expect(page.locator('#title-help')).toContainText('right-click');
  });
});

test.describe('controls', () => {
  // Level 1: the laser at (3,7) fires left into the corner mirror at (0,7); (2,5) is the mirror nearest the laser.
  const cornerMirror = { x: 0, y: 7 };
  const nearestMirror = { x: 2, y: 5 };

  test('clicking a mirror turns it clockwise and right-clicking turns it back', async ({ page }) => {
    await startLevel(page, 1);
    const before = await mirrorRotation(page, cornerMirror);
    await clickTile(page, cornerMirror);
    await expect.poll(() => mirrorRotation(page, cornerMirror)).toBe((before + 1) % 16);
    await clickTile(page, cornerMirror, 'right');
    await expect.poll(() => mirrorRotation(page, cornerMirror)).toBe(before);
  });

  test('the keyboard cursor selects a mirror and Space / Z rotate it', async ({ page }) => {
    await startLevel(page, 1);
    const before = await mirrorRotation(page, nearestMirror);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => mirrorRotation(page, nearestMirror)).toBe((before + 1) % 16);
    await page.keyboard.press('KeyZ');
    await expect.poll(() => mirrorRotation(page, nearestMirror)).toBe(before);
  });

  test('Escape pauses the game and freezes the energy drain', async ({ page }) => {
    await startLevel(page, 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-pause')).toBeVisible();
    const energy = (await gameState(page)).energy;
    await page.waitForTimeout(500);
    expect((await gameState(page)).energy).toBe(energy);
    await page.click('#pause-resume');
    await expect(page.locator('#screen-pause')).toBeHidden();
    await expect.poll(async () => (await gameState(page)).energy).toBeLessThan(energy);
  });

  test('the mute setting survives a reload', async ({ page }) => {
    await startLevel(page, 1);
    await page.click('#hud-mute');
    await expect(page.locator('#hud-mute')).toHaveClass(/off/);
    await page.reload();
    await startLevel(page, 1);
    await expect(page.locator('#hud-mute')).toHaveClass(/off/);
  });
});

test.describe('play', () => {
  test('clearing the cells opens the receiver; steering the beam in completes the level and unlocks the next', async ({
    page,
  }) => {
    await startLevel(page, 1);
    // Clearing all twenty cells by hand is slow and timing-dependent; the engine tests cover pod destruction.
    await page.evaluate(() => {
      const game = (window as any).__deflektor.currentGame;
      game.board.tiles.forEach((row: { kind: string }[], y: number) =>
        row.forEach((tile, x) => {
          if (tile.kind === 'pod') game.board.tiles[y][x] = { kind: 'empty' };
        }),
      );
      game.podsRemaining = 0;
      game.openReceiver();
    });
    await expect(page.locator('#hud-pods')).toHaveText('OPEN');
    for (const setting of solveReceiverWithMirrorsOnly(LEVELS[0]).settings) {
      await turnMirrorTo(page, setting.tile, setting.rotation);
    }
    await expect(page.locator('#message-title')).toHaveText('Level complete', { timeout: 10_000 });
    await page.click('#message-primary');
    expect((await gameState(page)).levelIndex).toBe(1);
    await expect(page.locator('#hud-level-number')).toHaveText('02');

    await page.reload();
    await page.click('#title-play');
    await expect(page.locator('.level-button[data-level="2"]')).toBeEnabled();
  });

  test('reflecting the beam back into the emitter overloads it and costs a life', async ({ page }) => {
    await startLevel(page, 1);
    // The corner mirror at rotation 0 bounces the leftward beam straight back into the laser.
    await turnMirrorTo(page, { x: 0, y: 7 }, 0);
    await expect(page.locator('#message-title')).toHaveText('Overload!', { timeout: 10_000 });
    await page.click('#message-primary');
    const state = await gameState(page);
    expect(state.lives).toBe(2);
    expect(state.overload).toBe(0);
    await expect(page.locator('#hud-lives')).toHaveText('◆◆');
  });
});
