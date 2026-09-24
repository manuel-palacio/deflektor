import { expect, test, type Page } from '@playwright/test';

/** Clicks the centre of a tile on the editor board (15 x 9 tiles). */
async function paint(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const board = (await page.locator('.editor-board').boundingBox())!;
  await page.mouse.click(board.x + ((x + 0.5) / 15) * board.width, board.y + ((y + 0.5) / 9) * board.height, { button });
}

test('author a level in the editor, check it, export it and play it', async ({ page }) => {
  await page.goto('/?editor');
  await page.click('#editor-new');
  await page.click('button[data-brush="Mirror"]');
  await paint(page, 7, 4);
  for (let turn = 0; turn < 8; turn++) await paint(page, 7, 4, 'right');
  await page.click('button[data-brush="Cell"]');
  await paint(page, 7, 1);
  await page.click('button[data-brush="Purple brick"]');
  await paint(page, 3, 7);
  await page.click('#editor-check');
  await expect(page.locator('#editor-report')).toContainText('Solvable: 1 cells');
  await page.click('#editor-export');
  const exported = JSON.parse(await page.locator('#editor-json').inputValue());
  expect(exported.tiles[4]).toBe('E......8......R');
  expect(exported.tiles[1][7]).toBe('o');
  expect(exported.walls[14].includes('#')).toBe(true);
  await page.click('#editor-play');
  await expect(page.locator('#hud')).toBeVisible();
  const tiles = await page.evaluate(() => (window as any).__deflektor.currentGame.level.tiles);
  expect(tiles[4]).toBe('E......8......R');
});

test('the editor keeps the draft between visits and flags broken levels', async ({ page }) => {
  await page.goto('/?editor');
  await page.click('#editor-new');
  await page.click('button[data-brush="Laser"]');
  await paint(page, 2, 2);
  await page.reload();
  await page.click('#editor-check');
  await expect(page.locator('#editor-report')).toContainText("needs exactly one laser 'E' (found 2");
});
