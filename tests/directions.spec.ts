import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`eight painted movement angles and bounded story artwork ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/?profile=eight-angles');await expect(page.locator('.story-art img')).toBeVisible();await expect(page.locator('.story-art img')).toHaveAttribute('src','/art/story-adults.webp');await page.screenshot({path:`previews/story-entry-${width}.png`});await page.locator('#close-dialog').click();
 for(const [keys,sector] of [[['s'],0],[['s','d'],1],[['d'],2],[['w','d'],3],[['w'],4],[['w','a'],5],[['a'],6],[['s','a'],7]] as const){for(const key of keys)await page.keyboard.down(key);await expect(page.locator('#world')).toHaveAttribute('data-direction',String(sector));for(const key of keys)await page.keyboard.up(key);}
 await page.screenshot({path:`previews/eight-direction-${width}.png`});await expect(page.locator('.story-art')).toHaveCount(0);await page.locator('#open-map').click();await page.locator('[data-travel=village]').click();await expect(page.locator('.story-art')).toHaveCount(0);
 await page.locator('#journal').click();await expect(page.locator('#reset')).toBeVisible();
});
