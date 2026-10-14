import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const port = 42895;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'inherit' });
let browser;
const result = {};
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('server not reachable');
  // New isolated Chrome profile: never connect to or close the user's Chrome.
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.addInitScript(() => {
    localStorage.setItem('dream-caravan:garden:v1:profile:hardware-profile:graphics-quality:v1', 'low');
    window.__profileLongTasks = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__profileLongTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await page.goto(`http://127.0.0.1:${port}/?profile=hardware-profile`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const system = await browser.newBrowserCDPSession();
  result.gpu = (await system.send('SystemInfo.getInfo')).gpu;
  await new Promise(resolve => setTimeout(resolve, 8_000));
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync('review-artifacts/runtime-hardware-42895.cpuprofile', JSON.stringify(profile));
  const self = new Map();
  profile.samples?.forEach((id, index) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas?.[index] || 0)));
  result.topCpu = profile.nodes.map(node => ({ ...node.callFrame, selfMs: (self.get(node.id) || 0) / 1000 }))
    .sort((a, b) => b.selfMs - a.selfMs).slice(0, 20);
  result.runtime = await page.evaluate(() => ({ stats: window.__caravanPerformance?.stats(), longTasks: window.__profileLongTasks }));
  const click = performance.now();
  await page.locator('#people-action').click();
  result.clickMs = Math.round(performance.now() - click);
  result.dialogVisible = await page.locator('#overlay .dialog').isVisible();
  await page.keyboard.press('Escape');
  await page.locator('#photo-action').click();
  const capture = performance.now();
  const download = page.waitForEvent('download', { timeout: 20_000 });
  await page.locator('#photo-capture').click();
  const file = await download;
  result.downloadStartMs = Math.round(performance.now() - capture);
  result.downloadFailure = await file.failure();
  result.downloadTotalMs = Math.round(performance.now() - capture);
  await context.close();
} catch (error) { result.error = error.message; }
finally {
  writeFileSync('review-artifacts/runtime-hardware-42895.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  try { await browser?.close(); } finally { server.kill(); }
}
