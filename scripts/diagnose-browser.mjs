import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

// Isolated diagnostic, not a substitute for gameplay assertions. Own server/browser only.
const port = Number(process.env.DIAGNOSTIC_PORT || 42885);
const decodeProbe = process.env.DIAGNOSTIC_DECODE === '1';
const decodeConcurrency = Number(process.env.DIAGNOSTIC_CONCURRENCY || 0);
const antialiasProbe = process.env.DIAGNOSTIC_ANTIALIAS === '1';
const captureProbe = process.env.DIAGNOSTIC_CAPTURE === '1';
const manifest = JSON.parse(readFileSync('docs/ASSET_MANIFEST.json', 'utf8'));
const atlases = [...manifest.assets, ...manifest.diagonalAssets];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'inherit' });
const results = [];
const bounded = (promise, ms, label) => Promise.race([promise, new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  timer.unref();
})]);
try {
  let reachable = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { reachable = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!reachable) throw new Error('diagnostic server is not reachable');
  for (const mode of ['swiftshader']) {
    const browser = await chromium.launch({ args: mode === 'swiftshader'
      ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
    try {
      for (const kind of (captureProbe ? ['game-low'] : antialiasProbe ? ['game-low', 'game-low-no-aa', 'game-low-no-aa', 'game-low'] : decodeConcurrency ? ['game-high'] : decodeProbe ? ['blank', 'game-no-draw', 'game-high'] : ['blank', 'game-high', 'game-low', 'game-no-draw'])) {
        const row = { mode, kind };
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        const captureEvents = [];
        page.on('console', message => {
          if (message.text().startsWith('capture-timing:')) captureEvents.push(JSON.parse(message.text().slice(15)));
        });
        await page.addInitScript(() => {
          const toBlob = HTMLCanvasElement.prototype.toBlob;
          HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
            const start = performance.now();
            console.log(`capture-timing:${JSON.stringify({ event: 'toBlob-start', at: start })}`);
            const result = toBlob.call(this, blob => {
              console.log(`capture-timing:${JSON.stringify({ event: 'toBlob-callback', elapsedMs: performance.now() - start, bytes: blob?.size })}`);
              callback(blob);
            }, ...args);
            console.log(`capture-timing:${JSON.stringify({ event: 'toBlob-return', elapsedMs: performance.now() - start })}`);
            return result;
          };
        });
        await page.addInitScript(kind => {
          if (kind.startsWith('game-low')) localStorage.setItem(`dream-caravan:garden:v1:profile:diagnostic-${kind}:graphics-quality:v1`, 'low');
          if (kind.endsWith('-no-aa')) {
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, attributes) {
              return getContext.call(this, type, type === 'webgl2' ? { ...attributes, antialias: false } : attributes);
            };
          }
          // Diagnostic isolation only: keep simulation/UI, omit GPU drawing commands.
          if (kind === 'game-no-draw') {
            for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
              WebGL2RenderingContext.prototype[name] = function () {};
            }
          }
        }, kind);
        page.setDefaultTimeout(15_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const start = performance.now();
        try {
          if (kind === 'blank') await page.setContent('<button id="probe" onclick="this.textContent=\'done\'">probe</button>');
          else await page.goto(`http://127.0.0.1:${port}/?profile=diagnostic-${kind}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          row.loadMs = Math.round(performance.now() - start);
          if (decodeProbe) {
            const decodeStart = performance.now();
            const completed = [];
            page.on('console', message => {
              if (message.text().startsWith('decoded-atlas:')) completed.push(message.text().slice(14));
            });
            try {
              row.decoded = await bounded(page.evaluate(async ({ paths, concurrency }) => {
                const results = new Array(paths.length);
                let next = 0;
                await Promise.all(Array.from({ length: concurrency || paths.length }, async () => {
                  while (next < paths.length) {
                    const index = next++, path = paths[index];
                    const image = new Image(); image.src = path; await image.decode();
                    console.log(`decoded-atlas:${path.split('/').pop()}`);
                    results[index] = [image.naturalWidth, image.naturalHeight];
                  }
                }));
                return results;
              }, { paths: atlases.map(a => `http://127.0.0.1:${port}/${a.runtime.replace('public/', '')}`), concurrency: decodeConcurrency }), 30_000, 'concurrent atlas decode');
              row.decodeConcurrency = decodeConcurrency || atlases.length;
              row.dimensionsMatch = JSON.stringify(row.decoded) === JSON.stringify(atlases.map(a => [a.width, a.height]));
            } catch (error) { row.decodeError = error.message; }
            row.decodeMs = Math.round(performance.now() - decodeStart);
            row.completedAtlases = completed;
          }
          row.metrics = await bounded(page.evaluate(async () => {
            const gl = document.createElement('canvas').getContext('webgl2');
            const ext = gl?.getExtension('WEBGL_debug_renderer_info');
            const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
            const lags = [];
            for (let i = 0; i < 12; i++) {
              const before = performance.now();
              await new Promise(resolve => setTimeout(resolve, 100));
              lags.push(Math.round(performance.now() - before - 100));
            }
            return { renderer, maxTimerLagMs: Math.max(...lags), performance: window.__caravanPerformance?.stats() };
          }), 20_000, 'metrics');
          const clickStart = performance.now();
          await page.locator(kind === 'blank' ? '#probe' : '#people-action').click();
          row.clickMs = Math.round(performance.now() - clickStart);
          row.clicked = kind === 'blank' ? await page.locator('#probe').textContent() === 'done' : await page.locator('#overlay .dialog').isVisible();
          if (antialiasProbe || captureProbe) {
            await page.keyboard.press('Escape');
            await page.locator('#photo-action').click();
            const photoStart = performance.now();
            const download = page.waitForEvent('download', { timeout: 20_000 });
            await page.locator('#photo-capture').click();
            row.captureClickMs = Math.round(performance.now() - photoStart);
            const downloaded = await download;
            row.downloadEventMs = Math.round(performance.now() - photoStart);
            const completionStart = performance.now();
            row.downloadFailure = await downloaded.failure();
            row.downloadCompletionWaitMs = Math.round(performance.now() - completionStart);
            row.photoMs = Math.round(performance.now() - photoStart);
            const reopenStart = performance.now();
            await page.locator('#photo-action').click();
            row.reopenMs = Math.round(performance.now() - reopenStart);
            await page.keyboard.press('Escape');
          }
        } catch (error) { row.error = error.message; }
        row.pageErrors = errors;
        row.captureEvents = captureEvents;
        const closeStart = performance.now();
        try { await bounded(context.close(), 20_000, 'context.close'); }
        catch (error) { row.closeError = error.message; }
        row.closeMs = Math.round(performance.now() - closeStart);
        results.push(row);
        writeFileSync(`review-artifacts/browser-diagnostic-${port}.json`, JSON.stringify(results, null, 2));
        console.log(JSON.stringify(row));
        if (row.closeError) break;
      }
    } finally { await bounded(browser.close(), 20_000, 'browser.close'); }
  }
} finally { server.kill(); }
