import { test, expect } from '@playwright/test';
for(const width of [1440,390]) test(`garden planting, movement, growth and expansion ${width}`,async({page})=>{
 await page.clock.install();await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?profile=garden-test');await page.locator('#close-dialog').click();await page.locator('#open-garden').click();
 await page.locator('summary').click();await page.locator('#cell-2-2').click();await expect(page.locator('.plant-info')).toContainText('بذر');
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('dream-caravan:garden:v1:profile:garden-test')!).plants[0]);
 await page.locator('#garden-move').click();await page.locator('#cell-4-3').click();
 const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dream-caravan:garden:v1:profile:garden-test')!).plants[0]);expect(moved).toMatchObject({col:4,row:3,plantedAt:initial.plantedAt});
 await page.locator('#species-sunblossom').click();await page.locator('#cell-3-2').click();
 await page.locator('#garden-water').click();await expect(page.locator('#garden-water')).toBeDisabled();await expect(page.locator('#garden-expand')).toBeDisabled();
 await page.clock.setSystemTime(Date.now()+16*60000);await expect(page.locator('#garden-expand')).toBeEnabled({timeout:5000});await page.locator('#garden-expand').click();await expect(page.locator('.garden-heading')).toContainText('6×6');
 await page.screenshot({path:`previews/garden-edit-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await page.locator('#close-dialog').click();await page.locator('#open-garden').click();await expect(page.locator('.garden-heading')).toContainText('6×6');
 await page.goto('/?profile=another-account');await page.locator('#close-dialog').click();await page.locator('#open-garden').click();await expect(page.locator('.garden-heading')).toContainText('4×4');
 expect(await page.evaluate(()=>localStorage.getItem('dream-caravan:garden:v1:profile:another-account'))).toBeNull();expect(errors).toEqual([]);
});
