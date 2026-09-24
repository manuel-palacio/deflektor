import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/engine/levels';
import { solveReceiverWithMirrorsOnly } from '../../src/engine/solver';
import { clickTile, gameState, mirrorRotation, startLevel, turnMirrorTo, waitForLaser } from './helpers';

async function openTitle(page: Page) {
  await page.goto('/');
  await expect(page.locator('#screen-title')).toBeVisible();
}

test.describe('touch and layout', () => {
  test('every button and control is at least 44 x 44 CSS pixels', async ({ page }) => {
    await openTitle(page);
    const sizes = async (selector: string) =>
      page.locator(selector).evaluateAll((elements) =>
        elements
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => element.getBoundingClientRect())
          .map(({ width, height }) => ({ width, height })),
      );
    const small = (list: { width: number; height: number }[]) => list.filter(({ width, height }) => width < 44 || height < 44);
    expect(small(await sizes('#screen-title button'))).toEqual([]);
    await page.click('#title-play');
    expect(small(await sizes('.level-button'))).toEqual([]);
    await page.click('.level-button[data-level="1"]');
    expect(small(await sizes('#hud button'))).toEqual([]);
    await page.keyboard.press('Escape');
    await page.click('#pause-settings');
    expect(small(await sizes('#screen-settings input[type="range"], #screen-settings select, #screen-settings button'))).toEqual([]);
  });

  test('the page itself never scrolls or rubber-bands', async ({ page }) => {
    await openTitle(page);
    await startLevel(page, 1);
    const overflow = await page.evaluate(() => ({
      scrollable: document.documentElement.scrollHeight > window.innerHeight,
      overscroll: getComputedStyle(document.body).overscrollBehaviorY,
    }));
    expect(overflow).toEqual({ scrollable: false, overscroll: 'none' });
  });

  for (const [name, viewport, scale] of [
    ['portrait phone', { width: 390, height: 844 }, 3],
    ['landscape phone', { width: 844, height: 390 }, 3],
    ['desktop', { width: 1440, height: 900 }, 1],
    ['high-DPI laptop', { width: 1280, height: 800 }, 2],
  ] as const) {
    test(`on a ${name} the whole board is on screen, below the HUD`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
      const page = await context.newPage();
      await openTitle(page);
      await startLevel(page, 1);
      const hudBottom = await page.locator('#hud').evaluate((hud) => hud.getBoundingClientRect().bottom);
      for (const tile of [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 0, y: 8 }, { x: 14, y: 8 }]) {
        const point = await page.evaluate((target) => (window as any).__deflektor.tileToClient(target), tile);
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(viewport.width);
        expect(point.y).toBeGreaterThan(hudBottom);
        expect(point.y).toBeLessThan(viewport.height);
      }
      await context.close();
    });
  }
});

test.describe('keyboard and screen readers', () => {
  test('a level can be played start to finish without a mouse', async ({ page }) => {
    await openTitle(page);
    await expect(page.locator('#title-training')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud-level-number')).toHaveText('T1');
    await page.keyboard.press('ArrowRight');
    for (let step = 0; step < 4; step++) await page.keyboard.press('KeyZ');
    await expect.poll(() => mirrorRotation(page, { x: 7, y: 4 })).toBe(4);
    await waitForLaser(page);
    await expect.poll(async () => (await gameState(page)).podsRemaining).toBe(0);
    for (let step = 0; step < 8; step++) await page.keyboard.press('Space');
    await expect(page.locator('#message-title')).toHaveText('Level complete', { timeout: 10_000 });
    await expect(page.locator('#message-primary')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud-level-number')).toHaveText('T2');
  });

  test('keyboard focus is clearly visible', async ({ page }) => {
    await openTitle(page);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('controls have names, meters have values and events are announced', async ({ page }) => {
    await openTitle(page);
    await startLevel(page, 1);
    await expect(page.locator('#stage')).toHaveAttribute('aria-label', /Game board/);
    for (const id of ['hud-undo', 'hud-redo', 'hud-hint', 'hud-mute', 'hud-pause']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', /.+/);
    }
    await expect(page.locator('#hud-energy-bar')).toHaveAttribute('aria-valuenow', /\d+/);
    await expect(page.locator('#announcer')).toContainText('Level 1');
  });

  test('menus close with Escape', async ({ page }) => {
    await openTitle(page);
    await page.click('#title-settings');
    await page.keyboard.press('Escape');
    await expect(page.locator('#screen-title')).toBeVisible();
  });
});

test.describe('comfort settings', () => {
  test('reduced motion follows the system setting on a first visit, and can be changed', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await openTitle(page);
    await expect(page.locator('body')).toHaveClass(/reduced-motion/);
    await page.click('#title-settings');
    await page.uncheck('#setting-reduced-motion');
    await expect(page.locator('body')).not.toHaveClass(/reduced-motion/);
    await context.close();
  });

  test('high contrast can be switched on and is remembered', async ({ page }) => {
    await openTitle(page);
    await page.click('#title-settings');
    await page.check('#setting-high-contrast');
    await expect(page.locator('body')).toHaveClass(/high-contrast/);
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/high-contrast/);
  });
});

test.describe('undo, redo and saved progress', () => {
  test('Ctrl+Z undoes a turn and Ctrl+Shift+Z redoes it; the buttons follow', async ({ page }) => {
    await openTitle(page);
    await startLevel(page, 1);
    const corner = { x: 0, y: 7 };
    const before = await mirrorRotation(page, corner);
    await expect(page.locator('#hud-undo')).toBeDisabled();
    await clickTile(page, corner);
    await expect.poll(() => mirrorRotation(page, corner)).toBe((before + 1) % 16);
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => mirrorRotation(page, corner)).toBe(before);
    await expect(page.locator('#hud-redo')).toBeEnabled();
    await page.keyboard.press('Control+Shift+KeyZ');
    await expect.poll(() => mirrorRotation(page, corner)).toBe((before + 1) % 16);
    await page.click('#hud-undo');
    await expect.poll(() => mirrorRotation(page, corner)).toBe(before);
  });

  test('best time, score and stars are saved and shown on the level list', async ({ page }) => {
    await openTitle(page);
    await startLevel(page, 1);
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
    for (const setting of solveReceiverWithMirrorsOnly(LEVELS[0]).settings) await turnMirrorTo(page, setting.tile, setting.rotation);
    await expect(page.locator('#message-title')).toHaveText('Level complete', { timeout: 10_000 });
    await expect(page.locator('#message-record')).toContainText('New best');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('deflektor.save')!));
    expect(saved.version).toBe(2);
    expect(saved.records[1]).toMatchObject({ completions: 1, bestStars: expect.any(Number), bestSeconds: expect.any(Number) });
    await page.click('#message-secondary');
    await page.click('#title-play');
    await expect(page.locator('.level-button[data-level="1"] .level-stars')).toHaveText(/★/);
  });

  test('an old version 1 save is migrated: unlocked levels and mute survive', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('deflektor.save')) {
        localStorage.setItem('deflektor.progress.v1', JSON.stringify({ unlockedLevels: 3, highScore: 1234, muted: true }));
      }
    });
    await openTitle(page);
    await expect(page.locator('#title-high-score')).toHaveText('1,234');
    await page.click('#title-play');
    await expect(page.locator('.level-button[data-level="3"]')).toBeEnabled();
    await expect(page.locator('.level-button[data-level="4"]')).toBeDisabled();
    await page.click('.level-button[data-level="1"]');
    await expect(page.locator('#hud-mute')).toHaveClass(/off/);
  });
});
