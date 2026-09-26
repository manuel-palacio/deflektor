import { expect, test } from '@playwright/test';
import { mirrorRotation, tileOnCanvas, touchPointer } from './helpers';

const mirror = { x: 7, y: 4 };

async function openTraining(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.tap('#title-training');
  await expect(page.locator('#hud-level-number')).toHaveText('T1');
}

async function selected(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as any).__deflektor.inspectControls());
}

test.describe('phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('shows the big mirror controls, clear of the board', async ({ page }) => {
    await openTraining(page);
    const bar = page.locator('#touch-controls');
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    const board = await page.evaluate(() => (window as any).__deflektor.inspectRenderer().board);
    expect(box.y).toBeGreaterThanOrEqual(board.bottom - 1);
    for (const button of await bar.locator('button').all()) {
      const size = (await button.boundingBox())!;
      expect(size.height).toBeGreaterThanOrEqual(56);
    }
  });

  test('the first tap near a mirror only selects it; the next tap turns it one step', async ({ page }) => {
    await openTraining(page);
    const center = await tileOnCanvas(page, mirror);
    const canvas = (await page.locator('#stage canvas').boundingBox())!;
    // A little off the tile: fingers are bigger than tiles, so it still snaps to the mirror.
    await page.touchscreen.tap(canvas.x + center.x + 20, canvas.y + center.y + 20);
    await expect.poll(() => selected(page)).toEqual(mirror);
    expect(await mirrorRotation(page, mirror)).toBe(8);
    await page.touchscreen.tap(canvas.x + center.x + 6, canvas.y + center.y);
    await expect.poll(() => mirrorRotation(page, mirror)).toBe(9);
  });

  test('holding a finger on a mirror turns it exactly one step, never like a machine gun', async ({ page }) => {
    await openTraining(page);
    const center = await tileOnCanvas(page, mirror);
    await touchPointer(page, 'pointerdown', center);
    await touchPointer(page, 'pointerup', center);
    const right = { x: center.x + 6, y: center.y };
    await touchPointer(page, 'pointerdown', right);
    await page.waitForTimeout(1500);
    await touchPointer(page, 'pointerup', right);
    expect(await mirrorRotation(page, mirror)).toBe(9);
    // Even if the finger is lifted somewhere other than the canvas, nothing starts turning on its own.
    await touchPointer(page, 'pointerdown', right);
    await touchPointer(page, 'pointerup', right, 'window');
    await page.waitForTimeout(1000);
    expect(await mirrorRotation(page, mirror)).toBe(9);
  });

  test('the ↺ / ↻ buttons turn the selected mirror, repeating steadily while held and stopping on release', async ({ page }) => {
    await openTraining(page);
    await page.tap('#touch-cw');
    await expect.poll(() => mirrorRotation(page, mirror)).toBe(9);
    await page.tap('#touch-ccw');
    await page.tap('#touch-ccw');
    await expect.poll(() => mirrorRotation(page, mirror)).toBe(7);
    const button = (await page.locator('#touch-cw').boundingBox())!;
    await page.evaluate(({ x, y }) => {
      document.querySelector('#touch-cw')!.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: x, clientY: y }));
    }, { x: button.x + 10, y: button.y + 10 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' })));
    const afterHold = await mirrorRotation(page, mirror);
    const turned = (afterHold - 7 + 16) % 16;
    expect(turned).toBeGreaterThanOrEqual(3);
    expect(turned).toBeLessThanOrEqual(7);
    await page.waitForTimeout(600);
    expect(await mirrorRotation(page, mirror)).toBe(afterHold);
  });

  test('dragging around the selected mirror turns it like a dial', async ({ page }) => {
    await openTraining(page);
    const center = await tileOnCanvas(page, mirror);
    await touchPointer(page, 'pointerdown', center);
    await touchPointer(page, 'pointerup', center);
    // On a portrait phone the board is turned, so a finger straight above the mirror on screen
    // points along the board's horizontal: rotation 8.
    await touchPointer(page, 'pointerdown', { x: center.x + 4, y: center.y });
    await touchPointer(page, 'pointermove', { x: center.x + 40, y: center.y });
    await touchPointer(page, 'pointermove', { x: center.x, y: center.y - 50 });
    await touchPointer(page, 'pointerup', { x: center.x, y: center.y - 50 });
    expect(await mirrorRotation(page, mirror)).toBe(8);
    await touchPointer(page, 'pointerdown', { x: center.x + 4, y: center.y });
    await touchPointer(page, 'pointermove', { x: center.x + 40, y: center.y - 40 });
    await touchPointer(page, 'pointerup', { x: center.x + 40, y: center.y - 40 });
    expect(await mirrorRotation(page, mirror)).not.toBe(8);
  });

  test('‹ › step the selection through the mirrors', async ({ page }) => {
    await page.goto('/');
    await page.tap('#title-play');
    await page.tap('.level-button[data-level="1"]');
    await page.tap('#touch-next');
    const first = await selected(page);
    await page.tap('#touch-next');
    const second = await selected(page);
    expect(second).not.toEqual(first);
    await page.tap('#touch-prev');
    expect(await selected(page)).toEqual(first);
  });
});

test('desktop does not show the touch controls', async ({ page }) => {
  await page.goto('/');
  await page.click('#title-training');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#touch-controls')).toBeHidden();
});
