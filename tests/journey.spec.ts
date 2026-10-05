import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
for(const size of [{width:1440,height:960},{width:390,height:844}]) for(const invention of ['lantern','sprout']) test(`${size.width}: ${invention} click-to-interact journey and reload`,async({page})=>{
 await page.setViewportSize(size);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('canvas')).toBeVisible();await expect(page.locator('#dialog-title')).toHaveText('به باغ خوش آمدی');await page.locator('#close-dialog').click();
 async function go(id:string){await page.locator(`[data-go="${id}"]`).click();}
 await go('bench');await expect(page.locator('#dialog-title')).toHaveText('کدام راه را می‌سازی؟',{timeout:20000});await expect(page.locator('[data-craft="lantern"]')).toBeDisabled();await page.locator('#close-dialog').click();
 for(const [id,name] of [['seed','بذر نور'],['crystal','بلور روح'],['feather','پر ابر']]){
  await go(id);await expect(page.locator('.chip.found').filter({hasText:name})).toBeVisible({timeout:20000});await expect(page.locator(`[data-go="${id}"]`)).toBeDisabled();
 }
 await expect(page.locator('.chip.found')).toHaveCount(3);
 await page.locator('#next-step').click();await expect(page.locator('[data-craft="lantern"]')).toBeEnabled({timeout:20000});await page.locator(`[data-craft="${invention}"]`).click();await expect(page.locator('#dialog-title')).toHaveText('اولین اختراع تو');await expect(page.locator('#creation-view canvas')).toBeVisible();await page.locator('#close-dialog').click();
 await page.locator('#next-step').click();await expect(page.locator('#dialog-title')).toHaveText('باغ دوباره نفس می‌کشد',{timeout:20000});await expect(page.locator('.story-art img')).toBeVisible();await page.locator('#close-dialog').click();
 await expect(page.locator('#objective')).toContainText('باغ روشن شد');await page.screenshot({path:`test-results/garden-${size.width}-${invention}.png`});
 await page.reload();await expect(page.locator('#objective')).toContainText('باغ روشن شد');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dream-caravan:garden:v1')!))).toMatchObject({restored:true,invention});
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#journal').click();await page.locator('#reset').click();await page.locator('#confirm-reset').click();await expect(page.locator('.chip.found')).toHaveCount(0);
});
test('standalone HTML runs with no dependent network requests',async({page})=>{
 await page.setViewportSize({width:1440,height:960});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;await page.route('**/*',route=>{requests++;if(route.request().url()==='http://127.0.0.1:4174/standalone-check')return route.fulfill({contentType:'text/html',body:readFileSync('dist/play.html','utf8')});return route.abort();});
 await page.goto('/standalone-check');await expect(page.locator('canvas')).toBeVisible();await expect(page.locator('#dialog-title')).toHaveText('به باغ خوش آمدی');
 await page.locator('#start-adventure').click();await expect(page.locator('#dialog-title')).toContainText('فرمانروای دوشاخ‌ها',{timeout:20000});await page.locator('#close-dialog').click();
 await page.locator('[data-marker=seed]').click();await expect(page.locator('.chip.found').filter({hasText:'بذر نور'})).toBeVisible({timeout:20000});expect(errors).toEqual([]);expect(requests).toBe(1);await page.screenshot({path:'previews/standalone.png'});
});
