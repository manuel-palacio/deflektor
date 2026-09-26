import { expect, test } from '@playwright/test';
import { inspectRenderer, mirrorRotation, waitForLaser } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-title')).toBeVisible();
});

test('the game starts from a tap and turns the board to fill the screen', async ({ page }) => {
  await page.tap('#title-training');
  await expect(page.locator('#hud-level-number')).toHaveText('T1');
  expect((await inspectRenderer(page)).rotated).toBe(true);
});

test('tapping the right or left half of a mirror turns it either way', async ({ page }) => {
  await page.tap('#title-training');
  const mirror = { x: 7, y: 4 };
  const center = await page.evaluate((tile) => (window as any).__deflektor.tileToClient(tile), mirror);
  await page.touchscreen.tap(center.x + 8, center.y);
  await expect.poll(() => mirrorRotation(page, mirror)).toBe(9);
  await page.touchscreen.tap(center.x - 8, center.y);
  await page.touchscreen.tap(center.x - 8, center.y);
  await expect.poll(() => mirrorRotation(page, mirror)).toBe(7);
});

test('a lesson can be finished with taps alone', async ({ page }) => {
  await page.tap('#title-training');
  const mirror = { x: 7, y: 4 };
  const center = await page.evaluate((tile) => (window as any).__deflektor.tileToClient(tile), mirror);
  for (let tap = 0; tap < 4; tap++) await page.touchscreen.tap(center.x - 8, center.y);
  await waitForLaser(page);
  await expect.poll(() => page.evaluate(() => (window as any).__deflektor.currentGame.podsRemaining)).toBe(0);
  for (let tap = 0; tap < 8; tap++) await page.touchscreen.tap(center.x + 8, center.y);
  await expect(page.locator('#message-title')).toHaveText('Level complete', { timeout: 10_000 });
});

test('the page does not scroll, and tips stay off the board', async ({ page }) => {
  await page.tap('#title-training');
  await expect(page.locator('#coach')).toBeVisible();
  const box = (await page.locator('#coach').boundingBox())!;
  const { board } = await inspectRenderer(page);
  expect(box.y).toBeGreaterThanOrEqual(board.bottom - 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
});

test('buttons are big enough to tap', async ({ page }) => {
  await page.tap('#title-training');
  const small = await page.locator('#hud button').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect()).filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(small).toEqual([]);
});
