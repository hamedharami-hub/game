import { test, expect } from '@playwright/test';

test('idle HUD does not rewrite unchanged accessible controls while simulation runs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('dream-caravan:garden:v1:profile:idle-hud:graphics-quality:v1', 'low'));
  await page.goto('/?profile=idle-hud', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#interact')).toHaveText('سلام');
  // The initial HTML already says hello but starts disabled. Wait for the first
  // simulation update before counting idle mutations, not its initialization.
  await expect(page.locator('#interact')).toBeEnabled();
  const mutations = await page.evaluate(async () => {
    const controls = ['interact', 'place-action'].map(id => document.getElementById(id)!);
    let changes = 0;
    const observer = new MutationObserver(records => { changes += records.length; });
    controls.forEach(el => observer.observe(el, { attributes: true, childList: true, subtree: true, characterData: true }));
    await new Promise(resolve => setTimeout(resolve, 1200));
    observer.disconnect();
    return changes;
  });
  expect(mutations).toBe(0);
  await expect(page.locator('#interact')).toBeEnabled();
  await page.locator('#interact').click();
  await expect(page.locator('[data-social="wave"]')).toBeVisible();
});
