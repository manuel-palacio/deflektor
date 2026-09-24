import { expect, test } from '@playwright/test';
import { LEVELS } from './levelData';
import { solveReceiverWithMirrorsOnly } from '../../src/engine/solver';
import { clickTile, gameState, mirrorRotation, startLevel, turnMirrorTo } from './helpers';

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

  test('restarting from the pause menu starts the level over without costing a life', async ({ page }) => {
    await startLevel(page, 1);
    await clickTile(page, cornerMirror);
    await page.keyboard.press('Escape');
    await page.click('#pause-restart');
    await expect(page.locator('#screen-pause')).toBeHidden();
    const state = await gameState(page);
    expect(state.lives).toBe(3);
    expect(state.phase).toBe('playing');
    expect(await page.evaluate(() => (window as any).__deflektor.currentGame.stats.rotations)).toBe(0);
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
    await expect(page.locator('#message-title')).toHaveText('Feedback overload', { timeout: 10_000 });
    await expect(page.locator('#message-detail')).toContainText('back into the laser');
    await page.click('#message-primary');
    const state = await gameState(page);
    expect(state.lives).toBe(2);
    expect(state.overload).toBe(0);
    await expect(page.locator('#hud-lives')).toHaveText('◆◆');
  });
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('turns the board to fill a Galaxy S23 screen and taps still turn the right mirror', async ({ page }) => {
    await page.tap('#title-play');
    await page.tap('.level-button[data-level="1"]');
    const corner = { x: 0, y: 7 };
    const before = await mirrorRotation(page, corner);
    const point = await page.evaluate((tile) => (window as any).__deflektor.tileToClient(tile), corner);
    // Rotated a quarter turn, the bottom-left corner of the board sits at the top-left of the screen.
    expect(point.y).toBeLessThan(300);
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(() => mirrorRotation(page, corner)).toBe((before + 1) % 16);
  });
});
