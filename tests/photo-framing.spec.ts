import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`photo framing ${width}: reachable controls, save isolation, download and exit`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const key = `dream-caravan:garden:v1:profile:photo-${width}`;
    await page.addInitScript(key => localStorage.setItem(`${key}:graphics-quality:v1`, 'low'), key);
    await page.goto(`/?profile=photo-${width}`, { waitUntil: 'domcontentloaded' });
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    await page.locator('#photo-action').click();
    await expect(page.locator('#overlay')).toHaveClass(/photo-framing/);
    const overlay = page.locator('#overlay');
    const x = Number(await overlay.getAttribute('data-photo-x'));
    const z = Number(await overlay.getAttribute('data-photo-z'));
    const zoom = Number(await overlay.getAttribute('data-photo-zoom'));
    await page.locator('[data-photo-pan="right"]').click();
    await expect(overlay).toHaveAttribute('data-photo-x', String(x + 2));
    await page.locator('[data-photo-pan="up"]').click();
    await expect(overlay).toHaveAttribute('data-photo-z', String(z - 2));
    await page.locator('#photo-near').click();
    expect(Number(await overlay.getAttribute('data-photo-zoom'))).toBeLessThan(zoom);
    await page.locator('#photo-far').click();
    await page.locator('#photo-center').click();
    await expect(overlay).toHaveAttribute('data-photo-x', String(x));
    await expect(overlay).toHaveAttribute('data-photo-z', String(z));
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(saved);
    for (const button of await page.locator('.photo-controls button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `review-artifacts/photo-framing-${width}.png`, timeout: 60000 });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#photo-capture').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('dream-caravan-photo.png');
    expect(await download.failure()).toBeNull();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#photo-action')).toBeFocused();
    await page.locator('#photo-action').click();
    await expect(overlay).toHaveAttribute('data-photo-zoom', String(zoom));
    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay')).not.toHaveClass(/photo-framing/);
  });
}
