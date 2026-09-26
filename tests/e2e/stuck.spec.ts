import { expect, test } from '@playwright/test';
import { clickTile, mirrorRotation } from './helpers';

// One mirror with exactly the 4 turns needed to aim up at the cell (and the receiver beyond it).
const tight = {
  id: 'tight',
  name: 'Tight',
  emitter: 'right',
  energySeconds: 150,
  tiles: [
    '.......R.......',
    '.......o.......',
    '...............',
    '...............',
    'E..............',
    '...............',
    '...............',
    '...............',
    '...............',
  ],
  pieces: [{ x: 7, y: 4, type: 'mirror', rotation: 8, turns: 4 }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((level) => sessionStorage.setItem('deflektor.editor.playtest', JSON.stringify(level)), tight);
  await page.goto('/?playtest');
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(() => (window as any).__deflektor?.currentGame?.level?.id === 'tight');
});

test('spending a limited turn the wrong way says the level cannot be finished, and Undo recovers', async ({ page }) => {
  const mirror = { x: 7, y: 4 };
  await clickTile(page, mirror);
  await expect(page.locator('#message-title')).toHaveText('This can no longer be finished');
  await expect(page.locator('#message-detail')).toContainText('not have enough turns');
  await expect(page.locator('#message-secondary')).toHaveText('Undo last turn');
  await page.click('#message-secondary');
  await expect(page.locator('#screen-message')).toBeHidden();
  expect(await mirrorRotation(page, mirror)).toBe(8);
  for (let turn = 0; turn < 4; turn++) await clickTile(page, mirror, 'right');
  await expect(page.locator('#message-title')).toHaveText('Challenge complete', { timeout: 15_000 });
});

test('restarting from the stuck screen is free', async ({ page }) => {
  await clickTile(page, { x: 7, y: 4 });
  await page.click('#message-primary');
  await expect(page.locator('#screen-message')).toBeHidden();
  const state = await page.evaluate(() => {
    const game = (window as any).__deflektor.currentGame;
    return { lives: game.lives, rotation: game.board.tiles[4][7].rotation, turnsLeft: game.board.tiles[4][7].turnsLeft };
  });
  expect(state).toEqual({ lives: 3, rotation: 8, turnsLeft: 4 });
});
