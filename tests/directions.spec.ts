import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`${viewport.name}: movement selects all eight painted character directions`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?profile=eight-directions');
    await expect(page.locator('canvas')).toBeVisible();

    // Move once from the seeded front-facing sector so the direction hook is initialized.
    await page.keyboard.down('d');
    await expect(page.locator('#world')).toHaveAttribute('data-direction', '2', { timeout: 10_000 });
    await page.keyboard.up('d');
    for (const [keys, sector] of [
      [['s'], 0], [['s', 'd'], 1], [['d'], 2], [['w', 'd'], 3],
      [['w'], 4], [['w', 'a'], 5], [['a'], 6], [['s', 'a'], 7],
    ] as const) {
      for (const key of keys) await page.keyboard.down(key);
      await expect(page.locator('#world')).toHaveAttribute('data-direction', String(sector), { timeout: 10_000 });
      for (const key of keys) await page.keyboard.up(key);
    }
  });
}
