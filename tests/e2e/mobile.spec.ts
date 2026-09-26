import { expect, test } from '@playwright/test';
import { inspectRenderer } from './helpers';

for (const [name, viewport] of [
  ['Galaxy S23 portrait', { width: 360, height: 780 }],
  ['Galaxy S23 landscape', { width: 780, height: 360 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: name !== 'desktop', isMobile: name !== 'desktop' });

    test('the tip box never covers the board', async ({ page }) => {
      await page.goto('/');
      await page.click('#title-training');
      const tip = page.locator('#coach');
      await expect(tip).toBeVisible();
      const box = (await tip.boundingBox())!;
      const { board } = await inspectRenderer(page);
      const overlaps = box.x < board.right && box.x + box.width > board.left && box.y < board.bottom && box.y + box.height > board.top;
      expect(overlaps).toBe(false);
    });
  });
}
