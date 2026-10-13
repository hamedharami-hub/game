import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`shared life ${width}: harvest, move, undo, vase, gift and persistence`, async ({ page }) => {
    test.setTimeout(180000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    const key = `dream-caravan:garden:v1:profile:life-${width}`;
    await page.addInitScript(({ key }) => {
      localStorage.setItem(`${key}:graphics-quality:v1`, 'low');
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, collected: [], plants: [
        { id: 'ripe', species: 'moonflower', col: 0, row: 0, plantedAt: Date.now() - 300000, boostMs: 0, lastWaterAt: 0, lastHarvestAt: null },
      ] }));
    }, { key });
    await page.goto(`/?profile=life-${width}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('canvas')).toBeVisible();
    await page.locator('#plant-action').click();
    await page.locator('.garden-panel summary').click();
    await page.locator('#cell-0-0').click();
    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants[0], key);
    expect(before.lastHarvestAt).toBeNull(); // selection must not harvest
    await page.locator('#garden-move').click(); await page.locator('#cell-1-0').click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants[0].plantedAt, key)).toBe(before.plantedAt);
    await page.locator('#undo-edit').click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plants[0].col, key)).toBe(0);
    await page.locator('#cell-0-0').click(); await page.locator('#garden-harvest').click();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).life.flowers.moonflower, key)).toBe(1);
    await page.locator('#garden-flowers').click();
    await page.locator('[data-use="vase"]').click();
    await expect(page.locator('#ambient-status')).toContainText('گلدان');
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).life.vases.length, key)).toBe(1);
    // Supply a ripe flower through a fixture, then exercise the real gift UI.
    await page.evaluate(key => {
      const s = JSON.parse(localStorage.getItem(key)!); s.life.flowers.moonflower = 1; localStorage.setItem(key, JSON.stringify(s));
    }, key);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#people-action').click(); await page.locator('#gift-action').click();
    await page.locator('[data-use="gift"]').click();
    await expect(page.locator('#ambient-status')).toContainText('گوراستاخ');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).life.lastGift, key)).toBe('moonflower');
    await page.screenshot({ path: `review-artifacts/shared-life-${width}.png`, timeout: 60000 });
  });
}
test('settings focus, Persian input, mute and save errors remain reliable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('dream-caravan:garden:v1:graphics-quality:v1', 'low'));
  await page.goto('/');
  await page.locator('#graphics-action').click();
  await page.locator('#graphics-quality-toggle').focus(); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#close-dialog')).toBeFocused();
  await page.locator('#mute-audio').click(); await expect(page.locator('#audio-volume')).toHaveValue('0');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 'ص', code: 'KeyW', bubbles: true, cancelable: true });
    window.dispatchEvent(e); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ص', code: 'KeyW' })); return e.defaultPrevented;
  })).toBe(true);
  await page.locator('#plant-action').click(); await page.locator('.garden-panel summary').click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.locator('#cell-0-0').click();
  await expect(page.locator('#save-status')).toContainText('ذخیره نشد');
  await expect(page.locator('#save-status')).toHaveAttribute('data-failed', 'true');
});
test('photo export downloads a scene PNG rather than the interface', async ({ page }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('dream-caravan:garden:v1:graphics-quality:v1', 'low'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#photo-action').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#photo-capture').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dream-caravan-photo.png');
  expect(await download.failure()).toBeNull();
  await expect(page.locator('#overlay')).toBeHidden();
});
