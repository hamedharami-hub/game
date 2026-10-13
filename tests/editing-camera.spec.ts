import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`editing camera ${width}: touch, keyboard, save isolation and exit`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const key = `dream-caravan:garden:v1:profile:camera-${width}`;
    await page.addInitScript(key => localStorage.setItem(`${key}:graphics-quality:v1`, 'low'), key);
    await page.goto(`/?profile=camera-${width}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#world canvas')).toBeVisible();
    const save = await page.evaluate(key => localStorage.getItem(key), key);
    await page.locator('#build-action').click();
    const controls = page.locator('#editing-camera');
    await expect(controls).toBeVisible();
    const x = Number(await controls.getAttribute('data-x'));
    await page.locator('[data-camera-pan="right"]').click();
    await expect(controls).toHaveAttribute('data-x', String(x + 4));
    await page.locator('#world canvas').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(controls).toHaveAttribute('data-x', String(x));
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(save);
    for (const button of await controls.locator('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `review-artifacts/editing-camera-${width}.png`, timeout: 60000 });
    await page.keyboard.press('Escape');
    await expect(controls).toBeHidden();
    await expect(page.locator('#build-action')).toBeFocused();
  });
}
