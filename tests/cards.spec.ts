import { test, expect } from '@playwright/test';

test('all four memory-card atlases remain readable', async ({ page }) => {
  await page.goto('/');
  const dimensions = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const image = new Image();
    image.src = path;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })), [
    '/art/cards-angel-small.webp',
    '/art/cards-gor-small.webp',
    '/art/cards-angel-adult.webp',
    '/art/cards-gor-adult.webp',
  ]);
  expect(dimensions).toEqual([[1536, 1024], [1536, 1024], [1536, 1024], [1536, 1024]]);
  for (const [width, height] of dimensions) expect(width / 3).toBe(height / 2);
});
