import { expect, test } from '@playwright/test';
import { dailySeed, generateChallenge, MODIFIER_LABEL } from '../../src/engine/challenge';
import { solveReceiverWithMirrorsOnly } from '../../src/engine/solver';
import { encodeResult } from '../../src/app/share';
import { gameState, turnMirrorTo, waitForLaser } from './helpers';

test('the daily challenge opens today’s seeded level and announces its modifiers', async ({ page }) => {
  await page.goto('/');
  await page.click('#title-daily');
  const expected = generateChallenge(dailySeed(new Date()));
  await expect(page.locator('#hud-level-number')).toHaveText('DAILY');
  await expect(page.locator('#coach')).toContainText(MODIFIER_LABEL[expected.modifiers[0]]);
  const tiles = await page.evaluate(() => (window as any).__deflektor.currentGame.level.tiles);
  expect(tiles).toEqual(expected.tiles);
});

test('a challenge link always opens the same level, and shows a shared score to beat', async ({ page }) => {
  const seed = 'friday-duel';
  const rival = encodeResult({ seed, score: 1450, seconds: 33, stars: 3 });
  await page.goto(`/?challenge=${seed}&result=${rival}`);
  await expect(page.locator('#coach')).toContainText('Score to beat: ★★★ 1,450');
  const tiles = await page.evaluate(() => (window as any).__deflektor.currentGame.level.tiles);
  expect(tiles).toEqual(generateChallenge(seed).tiles);
});

test('finishing a challenge offers Share, which copies a result line with a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seed = 'share-test';
  await page.goto(`/?challenge=${seed}`);
  await expect(page.locator('#hud')).toBeVisible();
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
  await waitForLaser(page);
  for (const setting of solveReceiverWithMirrorsOnly(generateChallenge(seed)).settings) {
    await turnMirrorTo(page, setting.tile, setting.rotation);
  }
  await expect(page.locator('#message-title')).toHaveText('Challenge complete', { timeout: 10_000 });
  await page.click('#message-share');
  await expect(page.locator('#coach')).toContainText('Result copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`?challenge=${seed}&result=`);
});

test('a timed challenge shows its countdown', async ({ page }) => {
  let seed = '';
  for (let day = 0; day < 60 && !seed; day++) {
    if (generateChallenge(`timed-${day}`).modifiers.includes('timed')) seed = `timed-${day}`;
  }
  await page.goto(`/?challenge=${seed}`);
  await waitForLaser(page);
  await expect(page.locator('.meter-energy .meter-label')).toHaveText(/Energy · \d+s left/);
  expect((await gameState(page)).phase).toBe('playing');
});

test('the level list shows replay statistics for levels played before', async ({ page }) => {
  await page.goto('/');
  await page.click('#title-play');
  await page.click('.level-button[data-level="1"]');
  await page.keyboard.press('Escape');
  await page.click('#pause-quit');
  await page.click('#title-play');
  await expect(page.locator('.level-button[data-level="1"]')).toHaveAttribute('aria-label', /played 1 time/);
});
