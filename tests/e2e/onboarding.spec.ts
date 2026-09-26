import { expect, test } from '@playwright/test';
import { TRAINING_LEVELS } from './levelData';
import { gameState, mirrorRotation, turnMirrorTo, waitForLaser } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-title')).toBeVisible();
});

test.describe('training', () => {
  test('first-time players are pointed at Training ("Start here")', async ({ page }) => {
    await expect(page.locator('#title-training')).toBeVisible();
    await expect(page.locator('#title-training-badge')).toHaveText('Start here');
    await expect(page.locator('#title-training')).toBeFocused();
  });

  test('a training level opens with its lesson, is labelled T1 and never costs lives', async ({ page }) => {
    await page.click('#title-training');
    await expect(page.locator('#hud-level-number')).toHaveText('T1');
    await expect(page.locator('#coach')).toHaveText(TRAINING_LEVELS[0].lesson);
    await expect(page.locator('#hud-lives')).toHaveText('∞');
  });

  test('suggests turning a mirror only after the player waits without trying', async ({ page }) => {
    await page.click('#title-training');
    await waitForLaser(page);
    // The lesson shows first; the tip about turning mirrors comes after the player has been idle.
    await expect(page.locator('#coach')).toContainText('Click a mirror to turn it', { timeout: 30_000 });
  });

  test('explains danger the moment the beam feeds back into the laser', async ({ page }) => {
    await page.click('#title-training');
    await page.evaluate(() => {
      const app = (window as any).__deflektor;
      app.currentGame.rotateMirror({ x: 7, y: 4 }, 8);
    });
    await waitForLaser(page);
    await expect(page.locator('#coach')).toContainText('bouncing back into the laser', { timeout: 5_000 });
  });

  test('clearing a lesson shows the result and leads on to the next lesson', async ({ page }) => {
    await page.click('#title-training');
    await waitForLaser(page);
    await turnMirrorTo(page, { x: 7, y: 4 }, 4);
    await expect.poll(async () => (await gameState(page)).podsRemaining).toBe(0);
    await turnMirrorTo(page, { x: 7, y: 4 }, 12);
    await expect(page.locator('#message-title')).toHaveText('Level complete', { timeout: 10_000 });
    await expect(page.locator('#message-stars')).toBeVisible();
    await page.click('#message-primary');
    await expect(page.locator('#hud-level-number')).toHaveText('T2');
    await expect(page.locator('#coach')).toHaveText(TRAINING_LEVELS[1].lesson);
  });

  test('the Hint button highlights the mirror to turn and says which way', async ({ page }) => {
    await page.click('#title-training');
    await page.click('#hud-hint');
    await expect(page.locator('#coach')).toContainText('turn the highlighted mirror');
    const hint = await page.evaluate(() => (window as any).__deflektor.inspectRenderer().hint);
    expect(hint).toEqual({ x: 7, y: 4 });
    expect(await mirrorRotation(page, { x: 7, y: 4 })).toBe(8);
  });
});
