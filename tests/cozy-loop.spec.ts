import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const stateKey = (profile: string) => `dream-caravan:garden:v1:profile:${profile}`;

for (const viewport of [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name}: plant, arrange, visit companions, and reload`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/?profile=cozy-loop');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();
    for (const action of ['#plant-action', '#build-action', '#people-action']) {
      await expect(page.locator(action)).toBeVisible();
      await expect(page.locator(action)).toBeEnabled();
      const box = await page.locator(action).boundingBox();
      expect(box?.y).toBeLessThan(40);
    }
    await expect(page.locator('#interact')).toBeEnabled();
    await expect(page.locator('#interact')).toHaveAttribute('aria-label', 'صحبت با گوراستاخ');
    await expect(page.locator('[data-travel]')).toHaveCount(0);

    await page.locator('#plant-action').click();
    await expect(page.locator('.garden-panel')).toBeVisible();
    await page.locator('[data-species="moonflower"]').click();
    const gardenDetails = page.locator('.garden-panel details');
    if (!(await gardenDetails.evaluate(element => element.open))) {
      await gardenDetails.locator('summary').click();
    }
    await page.locator('#cell-2-2').click();
    await expect(page.locator('.plant-info')).toContainText('گل ماه');
    const plantedState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey('cozy-loop'));
    expect(plantedState.plants).toHaveLength(1);
    expect(plantedState.plants[0].species).toBe('moonflower');
    await page.locator('#garden-close').click();

    const beforeBuild = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    await page.locator('#build-action').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await page.locator('[data-furnishing]').first().click();
    const afterBuild = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    expect(afterBuild).not.toBe(beforeBuild);
    await page.locator('#close-dialog').click();

    await page.locator('#people-action').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    const statusBeforeVisit = await page.locator('#ambient-status').textContent();
    await page.locator('[data-social="wave"]').click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#ambient-status')).not.toHaveText(statusBeforeVisit ?? '');

    await page.locator('#interact').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await page.locator('[data-social="sit"]').click();
    await expect(page.locator('#ambient-status')).not.toHaveText(statusBeforeVisit ?? '');

    const savedState = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    await page.reload();
    await expect(page.locator('#plant-action')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'))).toBe(savedState);
    await page.locator('#plant-action').click();
    await expect(page.locator('#cell-2-2')).toHaveAttribute('aria-label', /گل ماه/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('standalone HTML runs offline and supports the same cozy interactions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  await page.route('**/*', route => {
    requests++;
    if (new URL(route.request().url()).pathname === '/standalone-check') {
      return route.fulfill({ contentType: 'text/html', body: readFileSync('dist/play.html', 'utf8') });
    }
    return route.abort();
  });

  await page.goto('/standalone-check?profile=offline-cozy');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.locator('#people-action').click();
  await page.locator('[data-social="walk"]').click();
  await expect(page.locator('#ambient-status')).toBeVisible();
  expect(errors).toEqual([]);
  expect(requests).toBe(1);
});

test('reduced-motion mobile layout keeps primary actions keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?profile=cozy-keyboard');
  await page.locator('#people-action').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay .dialog')).toBeVisible();
  await expect(page.locator('[data-social="wave"]')).toBeVisible();
  await page.locator('[data-social="wave"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay')).toBeHidden();
  for (const action of ['#plant-action', '#build-action', '#people-action']) {
    await expect(page.locator(action)).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
