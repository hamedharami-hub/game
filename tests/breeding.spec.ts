import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`flower breeding ${width}: live parents, child, undo and persistence`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const key = `dream-caravan:garden:v1:profile:breeding-${width}`;
    await page.addInitScript(key => {
      localStorage.setItem(`${key}:graphics-quality:v1`, 'low');
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, collected: [], plants: [
        { id: 'moon', species: 'moonflower', col: 0, row: 0, plantedAt: Date.now() - 300000, boostMs: 0, lastWaterAt: 0, lastHarvestAt: null },
        { id: 'sun', species: 'sunblossom', col: 1, row: 0, plantedAt: Date.now() - 300000, boostMs: 0, lastWaterAt: 0, lastHarvestAt: null },
      ] }));
    }, key);
    await page.goto(`/?profile=breeding-${width}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#plant-action').click();
    await page.locator('.garden-panel summary').click();
    await expect(page.locator('#garden-breed')).toBeDisabled();
    await page.locator('#cell-0-0').click();
    const parents = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants, key);
    await page.locator('#garden-breed').click();
    await page.locator('#cell-0-1').click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
    expect(saved.plants.slice(0, 2)).toEqual(parents);
    expect(saved.plants[2].species).toBe('dawnflower');
    await expect(page.locator('.garden-notice')).toContainText('گل سپیده');
    await page.locator('#undo-edit').click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants.length, key)).toBe(2);
    await page.locator('#redo-edit').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants[2], key)).toEqual(saved.plants[2]);
    await page.locator('#plant-action').click();
    await page.locator('.garden-panel summary').click();
    await expect(page.locator('#cell-0-1')).toHaveAttribute('aria-label', /گل سپیده/);
  });
}
