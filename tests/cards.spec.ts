import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`album opens, filters and survives return without changing progress ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?profile=album-test');await page.locator('#close-dialog').click();
 await page.locator('[data-marker=seed]').click();await expect(page.locator('.chip.found').filter({hasText:'بذر نور'})).toBeVisible({timeout:20000});
 const before=await page.evaluate(()=>localStorage.getItem('dream-caravan:garden:v1:profile:album-test'));
 expect(before).not.toBeNull();await page.locator('#journal').click();await page.locator('#open-album').click();await expect(page.locator('[data-card]')).toHaveCount(24);
 await page.locator('[data-actor=gor]').click();await expect(page.locator('[data-card]')).toHaveCount(12);await page.locator('[data-style=adult]').click();await expect(page.locator('[data-card]')).toHaveCount(6);
 await page.locator('[data-card]').first().click();await expect(page.locator('.card-large')).toBeVisible();await expect(page.locator('#dialog-title')).toHaveText('فرمانروای نور');await page.locator('#card-next').click();await expect(page.locator('#dialog-title')).toHaveText('آیین شناوری');await page.locator('#card-previous').click();await expect(page.locator('#dialog-title')).toHaveText('فرمانروای نور');
 await page.screenshot({path:`previews/album-card-${width}.png`});const download=await Promise.all([page.waitForEvent('download'),page.locator('.card-download').click()]);expect(download[0].suggestedFilename()).toBe('gor-adult.webp');expect(await download[0].failure()).toBeNull();
 await page.locator('#album-return').click();await expect(page.locator('[data-card]')).toHaveCount(6);await page.locator('[data-actor=all]').click();await page.locator('[data-style=all]').click();await page.screenshot({path:`previews/album-grid-${width}.png`});
 const dims=await page.evaluate(async()=>Promise.all([...new Set([...document.querySelectorAll<HTMLElement>('.card-art')].map(e=>e.style.backgroundImage.match(/url\("?(.*?)"?\)/)![1]))].map(async src=>{const img=new Image();img.src=src;await img.decode();return [img.naturalWidth,img.naturalHeight]})));expect(dims).toHaveLength(4);for(const [w,h] of dims)expect(w/h).toBe(1.5);
 expect(await page.locator('.album-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('dream-caravan:garden:v1:profile:album-test'))).toBe(before);expect(errors).toEqual([]);
});

test('all four album sheets decode in standalone without network',async({page})=>{
 const {readFileSync}=await import('node:fs');let requests=0;
 await page.route('**/*',route=>{requests++;return route.request().url()==='http://127.0.0.1:4174/offline-album'?route.fulfill({contentType:'text/html',body:readFileSync('dist/play.html','utf8')}):route.abort();});
 await page.goto('/offline-album');await page.locator('#close-dialog').click();await page.locator('#journal').click();await page.locator('#open-album').click();await expect(page.locator('[data-card]')).toHaveCount(24);
 const decoded=await page.evaluate(async()=>Promise.all([...new Set([...document.querySelectorAll<HTMLElement>('.card-art')].map(e=>e.style.backgroundImage.match(/url\("?(.*?)"?\)/)![1]))].map(async src=>{const img=new Image();img.src=src;await img.decode();return img.naturalWidth;})));expect(decoded).toEqual([1536,1536,1536,1536]);expect(requests).toBe(1);
});
