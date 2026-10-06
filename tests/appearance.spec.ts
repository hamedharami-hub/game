import { test, expect } from '@playwright/test';
import manifest from '../docs/ASSET_MANIFEST.json' with { type: 'json' };

test('all approved character looks and diagonal atlases decode; saved appearance survives play', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.addInitScript(() => localStorage.setItem(
    'dream-caravan:garden:v1:profile:identity-memory',
    JSON.stringify({
      version: 1,
      collected: [],
      gorHair: 'brown',
      angelHair: 'white',
      gorOutfit: 'traveler',
      angelOutfit: 'celestial',
    }),
  ));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?profile=identity-memory');
  await expect(page.locator('canvas')).toBeVisible();

  const atlases = [...manifest.assets, ...manifest.diagonalAssets];
  const decoded = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const image = new Image();
    image.src = path;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })), atlases.map(asset => `/${asset.runtime.replace('public/', '')}`));
  expect(decoded).toEqual(atlases.map(asset => [asset.width, asset.height]));

  await page.locator('#build-action').click();
  await expect(page.locator('#build-palette')).toBeVisible();
  await page.locator('[data-kind="tree"]').click();
  const canvas = page.locator('#world canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('world canvas has no layout box');
  let buildPoint: { x: number; y: number } | undefined;
  for (const [xRatio, yRatio] of [[0.42, 0.24], [0.62, 0.24], [0.36, 0.32], [0.57, 0.34], [0.48, 0.18], [0.33, 0.42]]) {
    const candidate = { x: canvasBox.x + canvasBox.width * xRatio, y: canvasBox.y + canvasBox.height * yRatio };
    await page.mouse.move(candidate.x, candidate.y);
    if (await page.locator('#placement-status').getAttribute('data-placement-state') === 'valid') {
      buildPoint = candidate;
      break;
    }
  }
  if (!buildPoint) throw new Error('could not find clear land for the appearance save check');
  await page.mouse.click(buildPoint.x, buildPoint.y);
  await expect.poll(async () => {
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dream-caravan:garden:v1:profile:identity-memory')!));
    return saved.landscapePlacements?.length ?? 0;
  }).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dream-caravan:garden:v1:profile:identity-memory')!));
  expect(saved).toMatchObject({
    gorHair: 'brown',
    angelHair: 'white',
    gorOutfit: 'traveler',
    angelOutfit: 'celestial',
  });
  expect(errors).toEqual([]);
});
