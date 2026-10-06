import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const stateKey = (profile: string) => `dream-caravan:garden:v1:profile:${profile}`;
const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
};

const findClearBuildPoint = async (
  page: import('@playwright/test').Page,
  avoid?: { x: number; y: number },
) => {
  const canvas = page.locator('#world canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('world canvas has no layout box');
  // Keep the probe above the mobile palette and away from the desktop palette.
  const candidates = [
    [0.42, 0.24], [0.62, 0.24], [0.36, 0.32], [0.57, 0.34],
    [0.48, 0.18], [0.33, 0.42], [0.66, 0.4],
    [0.2, 0.2], [0.78, 0.2], [0.12, 0.35], [0.85, 0.35],
    [0.24, 0.55], [0.42, 0.62], [0.62, 0.58], [0.76, 0.52],
    [0.32, 0.74], [0.53, 0.76], [0.7, 0.7],
  ];
  for (const [xRatio, yRatio] of candidates) {
    const point = { x: box.x + box.width * xRatio, y: box.y + box.height * yRatio };
    const isCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector('#world canvas'), point);
    if (!isCanvas) continue;
    await page.mouse.move(point.x, point.y);
    const state = await page.locator('#placement-status').getAttribute('data-placement-state');
    if (state !== 'valid') continue;
    if (avoid) {
      if (Math.hypot(point.x - avoid.x, point.y - avoid.y) < 80) continue;
    }
    return point;
  }
  throw new Error('could not find clear land for the browser build interaction');
};

const placeLandscape = async (page: import('@playwright/test').Page, kind: string) => {
  await page.locator(`[data-kind="${kind}"]`).click();
  const point = await findClearBuildPoint(page);
  await page.mouse.click(point.x, point.y);
  return point;
};

const placementScreenPoint = async (page: import('@playwright/test').Page) => {
  const marker = page.locator('#placement-preview');
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  if (!box) throw new Error('placement marker has no layout box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return { x, y, pickY: y - Math.max(24, box.height * 0.44) };
};

const clickTreeAt = async (page: import('@playwright/test').Page, point: { x: number; pickY: number }) => {
  // Aim above the ground marker so the ray crosses the visible trunk/canopy.
  await page.mouse.click(point.x, point.pickY);
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
    await expect(page.locator('#build-palette')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await placeLandscape(page, 'tree');
    const afterBuild = await page.evaluate(key => localStorage.getItem(key), stateKey('cozy-loop'));
    expect(afterBuild).not.toBe(beforeBuild);
    const builtState = JSON.parse(afterBuild!);
    expect(builtState.landscapePlacements).toHaveLength(1);
    expect(builtState.landscapePlacements[0].kind).toBe('tree');
    await expectNoHorizontalOverflow(page);
    await page.locator('#finish-building').click();

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

test('free build preview places, selects, moves, rotates, removes, and restores saved objects', async ({ page }) => {
  const profile = 'free-placement-flow';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?profile=${profile}`);
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect(page.locator('#placement-preview')).toBeHidden();
  await page.locator('#build-action').click();
  await expect(page.locator('#build-palette')).toBeVisible();
  await page.locator('[data-kind="tree"]').click();
  await expect(page.locator('#placement-preview')).toBeVisible();

  await findClearBuildPoint(page);
  await expect(page.locator('#placement-preview')).toHaveAttribute('data-placement-state', 'valid');
  await page.locator('#rotate-landscape-right').click();
  const initialPreviewPoint = await placementScreenPoint(page);
  await page.mouse.click(initialPreviewPoint.x, initialPreviewPoint.y);
  const stateKey = `dream-caravan:garden:v1:profile:${profile}`;
  const readPlacements = async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).landscapePlacements, stateKey);
  await expect.poll(async () => (await readPlacements()).length).toBe(1);
  const placed = (await readPlacements())[0];
  expect(placed.kind).toBe('tree');
  expect(Math.abs(placed.rotation - Math.PI / 12)).toBeLessThan(0.0001);
  const placedScreenPoint = await placementScreenPoint(page);

  // The selected build tool stays active after placement; clicking the new
  // object must select it instead of placing another copy.
  await clickTreeAt(page, placedScreenPoint);
  await expect(page.locator('#remove-landscape')).toBeEnabled();

  await findClearBuildPoint(page, placedScreenPoint);
  const movePreviewPoint = await placementScreenPoint(page);
  await page.mouse.click(movePreviewPoint.x, movePreviewPoint.y);
  await expect.poll(async () => {
    const current = (await readPlacements())[0];
    return Math.hypot(current.x - placed.x, current.z - placed.z);
  }).toBeGreaterThan(1);
  const moved = (await readPlacements())[0];
  const movedScreenPoint = await placementScreenPoint(page);

  await page.reload();
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect.poll(async () => {
    const current = (await readPlacements())[0];
    return current && Math.hypot(current.x - moved.x, current.z - moved.z);
  }).toBeLessThan(0.001);
  await page.locator('#build-action').click();
  await clickTreeAt(page, movedScreenPoint);
  await expect(page.locator('#remove-landscape')).toBeEnabled();
  await page.locator('#rotate-landscape-right').click();
  await expect.poll(async () => Math.abs((await readPlacements())[0].rotation - Math.PI / 6)).toBeLessThan(0.0001);
  await page.locator('#remove-landscape').click();
  await expect.poll(async () => (await readPlacements()).length).toBe(0);
  await page.reload();
  expect(await readPlacements()).toEqual([]);
  expect(errors).toEqual([]);
});

test('moving the live garden keeps existing plant records and growth timestamps byte-for-byte', async ({ page }) => {
  const profile = 'garden-bed-relocation';
  const key = stateKey(profile);
  const plant = {
    id: 'garden-move-bloom', species: 'moonflower', col: 2, row: 2,
    plantedAt: 1_700_000_000_000, boostMs: 1_200, lastWaterAt: 1_699_999_900_000, lastHarvestAt: null,
  };
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(({ storageKey, initialPlant }) => localStorage.setItem(storageKey, JSON.stringify({
    version: 1,
    collected: [],
    plotLevel: 5,
    plants: [initialPlant],
  })), { storageKey: key, initialPlant: plant });
  await page.goto(`/?profile=${profile}`);
  await expect(page.locator('#world canvas')).toBeVisible();
  const readState = async () => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!), key);
  const plantSnapshot = JSON.stringify((await readState()).plants);
  expect(plantSnapshot).toBe(JSON.stringify([plant]));

  await page.locator('#build-action').click();
  await page.locator('[data-kind="garden-bed"]').click();
  const canvasBox = await page.locator('#world canvas').boundingBox();
  if (!canvasBox) throw new Error('world canvas has no layout box');
  const originalGardenScreenPoint = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
  const destination = await findClearBuildPoint(page, originalGardenScreenPoint);
  await page.mouse.click(destination.x, destination.y);
  await expect.poll(async () => (await readState()).landscapePlacements.length).toBe(1);
  const movedState = await readState();
  const gardenPlacement = movedState.landscapePlacements[0];
  expect(gardenPlacement).toMatchObject({ id: 'main-garden', kind: 'garden-bed' });
  expect(Math.hypot(gardenPlacement.x + 2, gardenPlacement.z - 14)).toBeGreaterThan(1);
  expect(JSON.stringify(movedState.plants)).toBe(plantSnapshot);

  await page.reload();
  const restoredState = await readState();
  expect(restoredState.landscapePlacements).toContainEqual(gardenPlacement);
  expect(JSON.stringify(restoredState.plants)).toBe(plantSnapshot);
  await page.locator('#plant-action').click();
  await expect(page.locator('#cell-2-2')).toHaveAttribute('aria-label', /گل ماه/);
});

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
