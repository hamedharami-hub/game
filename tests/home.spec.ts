import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`home ${width}: walk through door, cutaway and persistent furnishings`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const key = `dream-caravan:garden:v1:profile:home-${width}`;
    await page.addInitScript(key => localStorage.setItem(`${key}:graphics-quality:v1`, 'low'), key);
    await page.goto(`/?profile=home-${width}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#map-action').click();
    await page.locator('.land-map__button[data-landmark-id="home"]').click();
    await expect(page.locator('#ambient-status')).toContainText('خانه', { timeout: 60000 });
    await expect(page.locator('#place-action')).toContainText('خانه', { timeout: 60000 });
    await page.locator('#place-action').click();
    await page.locator('[data-home="reading"]').click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).life.homeArrangement, key)).toBe('reading');
    await page.locator('#place-action').click();
    await page.locator('#home-enter').click();
    await expect(page.locator('main')).toHaveAttribute('data-inside-home', 'true', { timeout: 60000 });
    await page.screenshot({ path: `review-artifacts/home-${width}.png`, timeout: 60000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).life.homeArrangement, key)).toBe('reading');
    await expect(page.locator('main')).toHaveAttribute('data-inside-home', 'false');
  });
}
