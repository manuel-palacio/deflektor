import { expect, test } from '@playwright/test';
import { clickTile, hoverTile, inspectRenderer, soundLog, turnMirrorTo, waitForLaser } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-title')).toBeVisible();
});

const trainingMirror = { x: 7, y: 4 };

test.describe('mirror feedback', () => {
  test('hovering a mirror highlights it and previews where the next turn sends the beam', async ({ page }) => {
    await page.click('#title-training');
    await hoverTile(page, trainingMirror);
    await expect.poll(async () => (await inspectRenderer(page)).hover).toEqual(trainingMirror);
    expect((await inspectRenderer(page)).previewShown).toBe(true);
    expect(await page.evaluate(() => document.querySelector('#stage canvas')!.getAttribute('style'))).toContain('cursor: pointer');
    await hoverTile(page, { x: 1, y: 1 });
    await expect.poll(async () => (await inspectRenderer(page)).previewShown).toBe(false);
  });

  test('each turn plays a mechanical tick, and lining up on a cell plays the lock-on chime', async ({ page }) => {
    await page.click('#title-training');
    await clickTile(page, trainingMirror);
    await expect.poll(() => soundLog(page)).toContain('mirrorTick');
    await turnMirrorTo(page, trainingMirror, 4);
    await expect.poll(() => soundLog(page)).toContain('connect');
  });
});

test.describe('beam states', () => {
  test('success and danger look different: the beam reports target, then feedback', async ({ page }) => {
    await page.click('#title-training');
    await turnMirrorTo(page, trainingMirror, 4);
    await waitForLaser(page);
    await expect.poll(async () => (await inspectRenderer(page)).beamState).not.toBe('charging');
    // Rotation 0 sends the rightward beam straight back into the laser.
    await page.evaluate(() => (window as any).__deflektor.currentGame.rotateMirror({ x: 7, y: 4 }, -4));
    await expect.poll(async () => (await inspectRenderer(page)).beamState).toBe('feedback');
  });

  test('the beam is only an aiming guide while the laser charges', async ({ page }) => {
    await page.click('#title-training');
    expect((await inspectRenderer(page)).beamState).toBe('charging');
  });
});

test.describe('audio and effects settings', () => {
  test('music and effects volumes are separate and survive a reload', async ({ page }) => {
    await page.click('#title-settings');
    await page.locator('#setting-music').fill('20');
    await page.locator('#setting-effects').fill('90');
    await page.click('#settings-done');
    await page.reload();
    await page.click('#title-settings');
    await expect(page.locator('#setting-music')).toHaveValue('20');
    await expect(page.locator('#setting-effects')).toHaveValue('90');
  });

  test('light effects can be chosen for slower phones', async ({ page }) => {
    await page.click('#title-settings');
    await page.selectOption('#setting-quality', 'low');
    await page.click('#settings-done');
    await expect.poll(async () => (await inspectRenderer(page)).effects).toBe('low');
  });

  test('a level-complete celebration and a failure explanation are clearly different screens', async ({ page }) => {
    await page.click('#title-training');
    await waitForLaser(page);
    await page.evaluate(() => (window as any).__deflektor.currentGame.rotateMirror({ x: 7, y: 4 }, 8));
    await expect(page.locator('#message-title')).toHaveText('Feedback overload', { timeout: 10_000 });
    await expect(page.locator('#message-stars')).toBeHidden();
    await expect(page.locator('#message-detail')).toBeVisible();
  });
});
