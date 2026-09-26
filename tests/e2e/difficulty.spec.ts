import { expect, test } from '@playwright/test';
import { mirrorRotation, startLevel } from './helpers';

const rules = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__deflektor.currentGame.difficultyRules);

test('new players get Relaxed: twice the energy and a slower overload', async ({ page }) => {
  await page.goto('/');
  await startLevel(page, 1);
  expect(await rules(page)).toEqual({ overloadRisePerSecond: 0.3, overloadDecayPerSecond: 0.4, energyScale: 2 });
});

test('difficulty can be changed mid-level, applies at once and is remembered', async ({ page }) => {
  await page.goto('/');
  await startLevel(page, 1);
  await page.keyboard.press('Escape');
  await page.click('#pause-settings');
  await page.selectOption('#setting-difficulty', 'classic');
  expect((await rules(page)).energyScale).toBe(1);
  await page.reload();
  await startLevel(page, 1);
  expect((await rules(page)).overloadRisePerSecond).toBe(0.6);
});

test.describe('touch', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('tapping the right half of a mirror turns it clockwise, the left half turns it back', async ({ page }) => {
    await page.goto('/');
    await page.tap('#title-play');
    await page.tap('.level-button[data-level="1"]');
    const corner = { x: 0, y: 7 };
    const center = await page.evaluate((tile) => (window as any).__deflektor.tileToClient(tile), corner);
    const before = await mirrorRotation(page, corner);
    // The first tap only selects the mirror; taps on a selected mirror turn it.
    await page.touchscreen.tap(center.x, center.y);
    await page.touchscreen.tap(center.x + 8, center.y);
    await expect.poll(() => mirrorRotation(page, corner)).toBe((before + 1) % 16);
    await page.touchscreen.tap(center.x - 8, center.y);
    await page.touchscreen.tap(center.x - 8, center.y);
    await expect.poll(() => mirrorRotation(page, corner)).toBe((before + 15) % 16);
  });
});
