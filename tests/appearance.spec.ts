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
  await page.locator('[data-furnishing]').first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dream-caravan:garden:v1:profile:identity-memory')!));
  expect(saved).toMatchObject({
    gorHair: 'brown',
    angelHair: 'white',
    gorOutfit: 'traveler',
    angelOutfit: 'celestial',
  });
  expect(errors).toEqual([]);
});
