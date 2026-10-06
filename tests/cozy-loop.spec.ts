import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const stateKey = (profile: string) => `dream-caravan:garden:v1:profile:${profile}`;
const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
};

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
    await expectNoHorizontalOverflow(page);
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
    await expectNoHorizontalOverflow(page);
    await page.locator('[data-species="moonflower"]').click();
    const gardenDetails = page.locator('.garden-panel details');
    // Locator.evaluate widens to HTMLElement | SVGElement; this selector is a <details>, so open is real.
    if (!(await gardenDetails.evaluate(element => (element as HTMLDetailsElement).open))) {
      await gardenDetails.locator('summary').click();
    }
    await page.locator('#cell-2-2').click();
    await expect(page.locator('.plant-info')).toContainText('گل ماه');
    await expect(page.locator('.garden-notice')).toContainText('کاشته شد');
    const plantedState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey('cozy-loop'));
    expect(plantedState.plants).toHaveLength(1);
    expect(plantedState.plants[0].species).toBe('moonflower');
    await page.locator('#garden-close').click();

    const beforeBuild = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    await page.locator('#build-action').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.locator('[data-furnishing]').first().click();
    const afterBuild = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    expect(afterBuild).not.toBe(beforeBuild);
    await page.locator('#close-dialog').click();

    await page.locator('#people-action').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const statusBeforeVisit = await page.locator('#ambient-status').textContent();
    await page.locator('[data-social="wave"]').click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#ambient-status')).not.toHaveText(statusBeforeVisit ?? '');

    await page.locator('#interact').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await page.locator('[data-social="sit"]').click();
    await expect(page.locator('#ambient-status')).not.toHaveText(statusBeforeVisit ?? '');
    const statusAfterSit = await page.locator('#ambient-status').textContent();
    await page.locator('#people-action').click();
    await page.locator('[data-social="walk"]').click();
    await expect(page.locator('#ambient-status')).not.toHaveText(statusAfterSit ?? '');

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

test('a legacy v1 garden resumes with ripe flowers and no offline loss', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem(
    'dream-caravan:garden:v1:profile:legacy-v1',
    JSON.stringify({
      version: 1,
      collected: ['seed'],
      plotLevel: 1,
      plants: [{
        id: 'offline-bloom', species: 'moonflower', col: 2, row: 2,
        plantedAt: Date.now() - 120_000, boostMs: 0, lastWaterAt: 0,
      }],
      essence: 23,
      projects: ['lamps'],
      decorations: [{ district: 'garden', slot: 0, kind: 'pool' }],
      gorHair: 'brown',
      visited: ['grove'],
    }),
  ));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?profile=legacy-v1');
  await expect(page.locator('#overlay')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await page.locator('#plant-action').click();
  const gardenDetails = page.locator('.garden-panel details');
  if (!(await gardenDetails.evaluate(element => (element as HTMLDetailsElement).open))) await gardenDetails.locator('summary').click();
  await expect(page.locator('#cell-2-2')).toHaveAttribute('aria-label', /شکوفه/);
  await expectNoHorizontalOverflow(page);
  await page.locator('#cell-2-2').click();
  await expect(page.locator('.garden-notice')).toContainText('چیده شد');

  const resumed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), stateKey('legacy-v1'));
  expect(resumed.essence).toBeGreaterThanOrEqual(23);
  expect(resumed.plants).toHaveLength(1);
  expect(resumed.plants[0]).toMatchObject({ id: 'offline-bloom', species: 'moonflower', lastHarvestAt: expect.any(Number) });
  expect(resumed.projects).toContain('lamps');
  expect(resumed.decorations).toContainEqual({ district: 'garden', slot: 0, kind: 'pool' });
  expect(resumed.gorHair).toBe('brown');
  expect(errors).toEqual([]);
});

test('weather follows active play time and ignores a large wall-clock jump', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?profile=active-weather');
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-phase', 'morning');
  await expect(main).toHaveAttribute('data-weather', 'clear');
  const phase = await main.getAttribute('data-phase');
  const weather = await main.getAttribute('data-weather');

  await page.clock.setSystemTime(new Date('2040-06-01T12:00:00Z'));
  await expect(main).toHaveAttribute('data-phase', phase!);
  await expect(main).toHaveAttribute('data-weather', weather!);
  await expectNoHorizontalOverflow(page);
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
