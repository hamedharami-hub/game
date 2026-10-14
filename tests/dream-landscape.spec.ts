import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`dream landscape ${width}: terrain map, reachable controls and spirit framing`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const key = `dream-caravan:garden:v1:profile:dream-${width}`;
    await page.addInitScript(key => localStorage.setItem(`${key}:graphics-quality:v1`, 'low'), key);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?profile=dream-${width}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#world canvas')).toBeVisible();
    await page.locator('#map-action').click();
    await expect(page.locator('[data-map-terrain]')).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('data-graphics-quality', 'low');
    expect(await page.locator('#overlay').evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
    await expect(page.locator('.land-map__lake')).toHaveCount(2);
    await expect(page.locator('.land-map__stream')).toHaveCount(2);
    await expect(page.locator('.land-map__path')).toHaveCount(5);
    await expect(page.locator('.land-map__spirit')).toBeVisible();
    await expect(page.locator('.land-map__button')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `review-artifacts/dream-map-${width}.png`, timeout: 60000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#map-action')).toBeFocused();
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    await page.locator('#photo-action').click();
    const overlay = page.locator('#overlay');
    // Frame the actual spirit-tree clearing using public controls, not teleporting.
    for (const [axis, target, negative, positive] of [['x', -32, 'left', 'right'], ['z', 10, 'up', 'down']] as const) {
      for (let step = 0; step < 30; step++) {
        const value = Number(await overlay.getAttribute(`data-photo-${axis}`));
        if (Math.abs(value - target) <= 1) break;
        await page.locator(`[data-photo-pan="${value > target ? negative : positive}"]`).click();
      }
      expect(Math.abs(Number(await overlay.getAttribute(`data-photo-${axis}`)) - target)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: `review-artifacts/dream-spirit-${width}.png`, timeout: 60000 });
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(saved);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}
