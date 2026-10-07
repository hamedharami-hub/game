import { test, expect } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(hasNoOverflow).toBe(true);
};

test.describe('Mobile 390px & Boundary Viewport Layout Verification', () => {
  test('390px mobile viewport: five primary header actions fit on row 1 and flight works from companions', async ({ page }) => {
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

    // Verify the five primary actions, including map and camera.
    const buttons = [
      '#plant-action',
      '#build-action',
      '#people-action',
      '#map-action',
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

    // Flight starts and lands through the companion dialog.
    await expect(page.locator('#flight-ascend-btn')).toBeHidden();
    await expect(page.locator('#flight-descend-btn')).toBeHidden();
    await page.locator('#people-action').click();
    await expect(page.locator('#overlay .dialog')).toBeVisible();
    await page.locator('[data-social="fly"]').click();
    await expect(page.locator('#ambient-status')).toContainText('پرواز دونفره آغاز شد');
    await expect(page.locator('#flight-ascend-btn')).toBeVisible();
    await expect(page.locator('#flight-descend-btn')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    for (const id of ['#plant-action', '#build-action', '#people-action', '#map-action', '#flight-ascend-btn', '#flight-descend-btn', '#camera-view']) {
      const box = await page.locator(id).boundingBox();
      expect(box, `${id} should remain visible while flying`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.y).toBeLessThan(40);
    }

    await page.locator('#people-action').click();
    const landButton = page.locator('[data-social="fly"]');
    await expect(landButton).toHaveText('فرود آمدن');
    await landButton.click();
    await expect(page.locator('#ambient-status')).toContainText('فرود نرم');
    await expect(page.locator('#ambient-status')).toHaveText('به آرامی روی سبزه فرود آمدید.');
    await expect(page.locator('#flight-ascend-btn')).toBeHidden();
    await expect(page.locator('#flight-descend-btn')).toBeHidden();
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

      for (const id of ['#plant-action', '#build-action', '#people-action', '#map-action', '#camera-view']) {
        await expect(page.locator(id)).toBeVisible();
        const box = await page.locator(id).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    }
  });

  test('map shows one connected meadow, six places and player marker; Escape restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?profile=mobile-map-accessibility');

    const mapButton = page.locator('#map-action');
    await mapButton.click();
    const dialog = page.locator('#overlay .dialog');
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#land-map-mount .land-map__land')).toHaveCount(1);
    await expect(page.locator('#land-map-mount .land-map__marker')).toHaveCount(6);
    await expect(page.locator('#land-map-mount .land-map__button')).toHaveCount(6);
    await expect(page.locator('#land-map-mount [data-player-marker="true"]')).toHaveAttribute('aria-label', /موقعیت بازیکن/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(mapButton).toBeFocused();

    for (const width of [360, 375, 412, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await mapButton.click();
      await expectNoHorizontalOverflow(page);
      const mapDialogBox = await dialog.boundingBox();
      expect(mapDialogBox).not.toBeNull();
      expect(mapDialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(mapDialogBox!.x + mapDialogBox!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(page.locator('#overlay')).toBeHidden();
      await expect(mapButton).toBeFocused();
    }
    expect(errors).toEqual([]);
  });

  test('choosing a map landmark starts a walk and the arrival cue follows movement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?profile=mobile-map-route');
    await page.locator('#map-action').click();
    await expect(page.locator('#land-map-mount .land-map__button')).toHaveCount(6);
    await page.locator('#land-map-mount .land-map__button[data-landmark-id="greenhouse"]').click();

    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#ambient-status')).toHaveText('در راه گلخانهٔ پیوند.');
    await expect(page.locator('#ambient-status')).toHaveText('رسیدی به گلخانهٔ پیوند.', { timeout: 9000 });
    expect(errors).toEqual([]);
  });

  test('390px free-build tray stays reachable by touch and keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.addInitScript(({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    }, {
      key: 'dream-caravan:garden:v1:profile:mobile-build-accessibility',
      state: {
        version: 1,
        collected: [],
        plants: [],
        landscapePlacements: [{ id: 'mobile-tree', kind: 'tree', x: 10, z: 20, rotation: 0 }],
        visited: ['garden'],
        worldSeed: 1,
      },
    });

    await page.goto('/?profile=mobile-build-accessibility');
    await expect(page.locator('canvas')).toBeVisible();
    await page.locator('#build-action').click();

    const tray = page.locator('#build-palette');
    const buildButton = page.locator('#build-action');
    const firstTool = page.locator('#build-tools [data-kind="tree"]');
    const status = page.locator('#placement-status');
    await expect(tray).toBeVisible();
    await expect(buildButton).toHaveAttribute('aria-pressed', 'true');
    await expect(firstTool).toBeFocused();
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toContainText('برگزین');

    // The native picker exposes saved props to keyboard users. After choosing
    // one, focus moves to the world so arrows move it and Delete removes it.
    const objectPicker = page.locator('#landscape-object-select');
    await expect(objectPicker).toHaveAccessibleName('انتخاب سازه برای ویرایش');
    await expect(objectPicker.locator('option[value="mobile-tree"]')).toHaveCount(1);
    await objectPicker.selectOption('mobile-tree');
    const canvas = page.locator('#world canvas');
    await expect(canvas).toBeFocused();
    const savedPropPreview = page.locator('#placement-preview');
    await expect(savedPropPreview).toBeVisible();
    await expect(page.locator('#remove-landscape')).toBeEnabled();
    const propPreviewBefore = await savedPropPreview.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
    }));
    await page.keyboard.press('ArrowRight');
    const propPreviewAfter = await savedPropPreview.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
    }));
    expect(propPreviewAfter).not.toEqual(propPreviewBefore);
    await page.keyboard.press('Delete');
    await expect(page.locator('#remove-landscape')).toBeDisabled();
    await expect(objectPicker.locator('option[value="mobile-tree"]')).toHaveCount(0);
    const savedProps = await page.evaluate(() => JSON.parse(localStorage.getItem(
      'dream-caravan:garden:v1:profile:mobile-build-accessibility',
    )!).landscapePlacements);
    expect(savedProps).toEqual([]);

    // Native Enter activation must still select palette buttons while a preview
    // is active; Enter is also the canvas placement shortcut.
    await firstTool.focus();
    await page.keyboard.press('Enter');
    await expect(firstTool).toHaveAttribute('aria-pressed', 'true');
    const spiritTreeTool = page.locator('#build-tools [data-kind="spirit-tree"]');
    await spiritTreeTool.focus();
    await page.keyboard.press('Enter');
    await expect(spiritTreeTool).toHaveAttribute('aria-pressed', 'true');
    await expect(firstTool).toHaveAttribute('aria-pressed', 'false');

    const trayBounds = await tray.boundingBox();
    expect(trayBounds).not.toBeNull();
    expect(trayBounds!.x).toBeGreaterThanOrEqual(0);
    expect(trayBounds!.x + trayBounds!.width).toBeLessThanOrEqual(390);
    expect(trayBounds!.y + trayBounds!.height).toBeLessThanOrEqual(844);
    const horizontalSizes = await tray.evaluate(element => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(horizontalSizes.scroll).toBeLessThanOrEqual(horizontalSizes.client);
    await expectNoHorizontalOverflow(page);

    // Escape closes the tray and restores focus to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(tray).toBeHidden();
    await expect(buildButton).toBeFocused();

    // A build-mode arrow key nudges the preview while the game suppresses normal
    // movement input. Check the visible preview response and that the page itself
    // does not scroll as the key is handled.
    await buildButton.click();
    await firstTool.click();
    const preview = page.locator('#placement-preview');
    await expect(preview).toBeVisible();

    // Persian keyboard layouts report a Persian character for the physical R
    // key. Keep the KeyR code path working even when `event.key` is localized.
    const persianR = await page.evaluate(async () => {
      const statusNode = document.querySelector<HTMLElement>('#placement-status')!;
      const observed: string[] = [];
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) observed.push(node.textContent ?? '');
        }
      });
      observer.observe(statusNode, { childList: true, subtree: true, characterData: true });
      const event = new KeyboardEvent('keydown', {
        key: 'ق', code: 'KeyR', bubbles: true, cancelable: true,
      });
      window.dispatchEvent(event);
      await Promise.resolve();
      observer.disconnect();
      return { handled: event.defaultPrevented, messages: observed };
    });
    expect(persianR.handled).toBe(true);
    expect(persianR.messages.some(message => message.includes('چرخش'))).toBe(true);

    const beforeNudge = await preview.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
    }));
    const companionPrompt = page.locator('#interact');
    await expect(companionPrompt).toBeEnabled();
    const companionLabel = await companionPrompt.getAttribute('aria-label');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    const afterNudge = await preview.evaluate(element => ({
      left: element.style.left,
      top: element.style.top,
    }));
    expect(afterNudge).not.toEqual(beforeNudge);
    // The starting companions are close enough to talk. Holding an arrow in
    // build mode must move only the placement cursor, not the player away from them.
    await expect(companionPrompt).toBeEnabled();
    await expect(companionPrompt).toHaveAttribute('aria-label', companionLabel!);
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
    await expect(buildButton).toHaveAttribute('aria-pressed', 'true');

    const toolsSize = await tray.evaluate(element => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    expect(toolsSize.scroll).toBeGreaterThan(toolsSize.client);
    await tray.evaluate(element => { element.scrollTop = element.scrollHeight; });

    const rotate = page.locator('#rotate-landscape-right');
    await expect(rotate).toBeVisible();
    const rotateBounds = await rotate.boundingBox();
    expect(rotateBounds).not.toBeNull();
    expect(rotateBounds!.x).toBeGreaterThanOrEqual(0);
    expect(rotateBounds!.x + rotateBounds!.width).toBeLessThanOrEqual(390);
    expect(rotateBounds!.y).toBeGreaterThanOrEqual(0);
    expect(rotateBounds!.y + rotateBounds!.height).toBeLessThanOrEqual(844);
    expect(rotateBounds!.width).toBeGreaterThanOrEqual(44);
    expect(rotateBounds!.height).toBeGreaterThanOrEqual(44);
    await rotate.click();
    await expect(status).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Finish remains reachable after scrolling and also returns focus cleanly.
    await tray.evaluate(element => { element.scrollTop = 0; });
    await page.locator('#finish-building').click();
    await expect(tray).toBeHidden();
    await expect(buildButton).toBeFocused();
    expect(errors).toEqual([]);
  });
});
