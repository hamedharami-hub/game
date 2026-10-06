import { test, expect } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(hasNoOverflow).toBe(true);
};

test.describe('Mobile 390px & Boundary Viewport Layout Verification', () => {
  test('390px mobile viewport: all 5 header action buttons on row 1 with box.y < 40 and zero scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/?profile=mobile-390-test');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#overlay')).toBeHidden();
    await expectNoHorizontalOverflow(page);

    // Verify brand mark collapses title text to fit within 390px
    const brand = page.locator('.brand');
    await expect(brand).toBeVisible();
    const brandBox = await brand.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(brandBox!.width).toBeLessThanOrEqual(50);

    const titleText = page.locator('.brand > span:not(.brand-mark)');
    await expect(titleText).toBeHidden();

    // Verify all 5 action buttons
    const buttons = [
      '#plant-action',
      '#build-action',
      '#people-action',
      '#flight-toggle-btn',
      '#camera-view',
    ];

    let rowY: number | null = null;
    for (const id of buttons) {
      const btn = page.locator(id);
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();

      const box = await btn.boundingBox();
      expect(box, `Bounding box missing for ${id}`).not.toBeNull();

      // Mission Invariant 1: box.y < 40 (must not wrap to second line)
      expect(box!.y, `${id} wrapped to line 2 (y=${box!.y} >= 40)`).toBeLessThan(40);

      // Mission Invariant 2: x-bounds strictly within screen [0, 390]
      expect(box!.x, `${id} left edge off screen`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${id} right edge overflowed viewport`).toBeLessThanOrEqual(390);

      // Verify they are on the same vertical baseline
      if (rowY === null) {
        rowY = box!.y;
      } else {
        expect(Math.abs(box!.y - rowY), `${id} is not aligned on row 1 with other buttons`).toBeLessThan(6);
      }
    }

    // Toggle flight button on 390px viewport
    const flightBtn = page.locator('#flight-toggle-btn');
    await expect(flightBtn).toHaveAttribute('aria-pressed', 'false');
    await flightBtn.click();
    await expect(flightBtn).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalOverflow(page);

    // Verify button remains on row 1 after active state change
    const activeFlightBox = await flightBtn.boundingBox();
    expect(activeFlightBox!.y).toBeLessThan(40);

    // Toggle off
    await flightBtn.click();
    await expect(flightBtn).toHaveAttribute('aria-pressed', 'false');
    await expectNoHorizontalOverflow(page);

    expect(errors).toEqual([]);
  });

  test('390px companion intimacy menu: fits within viewport with zero horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/?profile=mobile-dialog-test');
    await expect(page.locator('#overlay')).toBeHidden();

    // Open companion modal
    await page.locator('#people-action').click();
    const dialog = page.locator('#overlay .dialog');
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);

    // Check companion intimacy options
    const intimacyKinds = ['handhold', 'fly', 'embrace', 'wave', 'sit', 'walk'];
    for (const kind of intimacyKinds) {
      const actionBtn = page.locator(`[data-social="${kind}"]`);
      await expect(actionBtn, `Action ${kind} not found in companion menu`).toBeVisible();

      const btnBox = await actionBtn.boundingBox();
      expect(btnBox).not.toBeNull();
      expect(btnBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
      expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1);
    }

    // Click handhold action: must close modal cleanly and show ambient message
    await page.locator('[data-social="handhold"]').click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#ambient-status')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(errors).toEqual([]);
  });

  test('Boundary viewports (375px, 360px, 430px) maintain zero horizontal scroll', async ({ page }) => {
    for (const width of [360, 375, 412, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/?profile=viewport-${width}`);
      await expect(page.locator('canvas')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      for (const id of ['#plant-action', '#build-action', '#people-action', '#flight-toggle-btn', '#camera-view']) {
        await expect(page.locator(id)).toBeVisible();
        const box = await page.locator(id).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    }
  });
});
