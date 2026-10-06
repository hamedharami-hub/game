/*
 * Dream Caravan — hand-written service worker. No Workbox, no build step, no
 * dependencies. Keep it readable: this file is the whole offline story for the
 * normal `dist/` build.
 *
 * RECORDED TRADE-OFF — do not "fix" either half of this without re-measuring:
 *  - Runtime art under `/art/` is deliberately NOT precached at install. An
 *    install-time burst of all 23 files, plus a background revalidation per
 *    read, put ~19 MB of extra traffic into the first-paint window and pushed
 *    tests/appearance.spec.ts past its 90 s timeout; that spec decodes 18
 *    atlases concurrently and passes in ~44 s with the worker blocked. That
 *    figure came from a temporary Lead diagnostic config, since deleted — no
 *    worker-blocking setting exists in this repo, and the shipped suite runs
 *    with the worker ACTIVE (appearance.spec.ts has measured 25.8-55.0 s
 *    against the 90 s ceiling). Keeping the burst out is a CI-stability
 *    decision, not an oversight.
 *  - `/art/` is therefore cache-first with NO revalidation, filled lazily on the
 *    first fetch: a hit costs zero network work, a miss fetches exactly once and
 *    stores the bytes for offline.
 *  - Accepted consequence: the app shell (`/index.html`, the hashed bundle, the
 *    manifest, the icon) is offline-capable from the first visit, while ART
 *    becomes offline-capable from the second visit onward — a first visit's
 *    boot-atlas requests happen before this worker controls the page, so they
 *    cannot be captured. `dist/play.html`, the self-contained single file, is
 *    still the real offline guarantee; this cache is a bonus on top of it.
 *  - Every cache lookup passes `ignoreVary: true`. Static hosts commonly answer
 *    `Vary: Origin` (vite preview does), and an entry written by this worker's
 *    own `cache.add()` carries no Origin header while the page's `crossorigin`
 *    module request does — without this option the worker misses its own cache
 *    and answers 503 for a bundle it is holding, so the app boots offline to a
 *    blank page.
 *
 * Strategy and why:
 *  - Navigations are network-first. A fresh deploy must win over anything we
 *    cached, otherwise a new index.html pointing at a new hashed bundle would be
 *    masked by yesterday's HTML. The fresh copy also refreshes the canonical
 *    `/index.html` entry, so the next cold start is current.
 *  - `/art/*` is cache-first with NO revalidation, and is filled lazily on the
 *    first fetch instead of during install. These are the heavy files (18
 *    atlases at ~460 KB each): an install-time burst of all of them, plus a
 *    background revalidation per read, put ~19 MB of extra traffic on the
 *    critical path of the first paint. MEASURED: tests/appearance.spec.ts decodes
 *    18 atlases concurrently and timed out at 90 s with that burst in place,
 *    versus 44.3 s with `serviceWorkers: 'block'`. The worker must never be the
 *    reason a first visit stalls, so art is read from the cache when present and
 *    fetched exactly once when absent.
 *  - Other same-origin GETs (the hashed bundle, manifest, icon) are cache-first
 *    with a background revalidation: small files, and the brief asks for
 *    revalidation on the hashed assets.
 *  - Non-GET requests are never intercepted and never cached.
 *  - /play.html is deliberately NOT precached: it is the 13.5 MB self-contained
 *    offline artefact and it stays outside this cache entirely.
 *  - Caches are versioned by CACHE, and activate deletes every other cache this
 *    origin has, so a version bump cannot leave stale bytes behind.
 *  - The canonical shell is cached under ONE key (`/index.html`). A navigation
 *    URL is never used as a cache key: "/?profile=x" would grow without bound,
 *    and a cached "/" would shadow the freshly revalidated shell once it aged.
 *  - Every cache lookup passes `ignoreVary: true`. The preview/dev server answers
 *    `Vary: Origin`, so an entry stored by a worker-initiated `cache.add()` (no
 *    Origin header) would otherwise never match the page's `crossorigin` module
 *    request — and an offline start would 503 the very bundle sitting in cache.
 *  - `event.waitUntil()` is only ever called while the fetch event is being
 *    dispatched (never after an `await`), and every cache write is a separate,
 *    failure-swallowing branch, so a rejected extension or a failed cache write
 *    can never turn a good response into a stale-shell fallback.
 *
 * Offline after the first visit: shell, manifest, icon and the hashed bundle are
 * precached at install; art is stored the first time the game actually asks for
 * it, so everything the player has seen keeps working offline.
 *
 * How the hashed asset names are obtained: they cannot be hard-coded, so install
 * fetches /index.html with `cache: 'reload'`, parses every /assets/...js|css URL
 * out of the HTML and precaches exactly those. If that parse ever comes back
 * empty the worker still works, because every same-origin GET it sees is cached
 * on first fetch.
 */

const VERSION = 'v1';
const CACHE = `caravan-${VERSION}`;

const SHELL_URL = '/index.html';
// Only the /index.html fetch in precache() is fatal: without it there is nothing
// to serve offline. The manifest and the icon are best-effort — a missing one
// only logs a warning (see the Promise.allSettled in precache). With the
// discovered bundle this is ~650 KB, not the ~11 MB of runtime art.
const REQUIRED_SHELL = [SHELL_URL, '/manifest.webmanifest', '/icons/icon.svg'];
// Matches the emitted, content-hashed entry points inside index.html.
const HASHED_ASSET = /\/assets\/[^"'\s)]+\.(?:js|css)/g;
// The heavy art tree, cached lazily rather than at install.
const ART_PREFIX = '/art/';
// The 13.5 MB self-contained single file. It must never enter this cache: not as
// a subresource, and not as a navigation — that used to overwrite the canonical
// shell entry and turn an offline "/" into a second copy of play.html.
const PLAY_HTML = '/play.html';

// Last-resort documents, used only when a request fails and nothing is cached.
const OFFLINE_HTML = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>کاروان رؤیاها · آفلاین</title></head>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#a4cfb6;color:#3f594f;font-family:Tahoma,sans-serif;text-align:center">
<p>این صفحه آفلاین در دسترس نیست.<br>یک بار با اتصال شبکه بازش کن تا برای دفعهٔ بعد ذخیره شود.</p></body></html>`;

const offlineDocument = () =>
  new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const missingAsset = () =>
  new Response('/* offline: asset not cached */', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      // Take over the page that triggered this install so offline works without
      // a manual reload. No skipWaiting(): a newer worker waits for the open
      // tabs instead of swapping caches under a running game.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Never touch non-GET: writes go straight to the network, untouched, uncached.
  if (request.method !== 'GET') return;
  // A range request returns 206, which Cache.put() rejects; leave it alone.
  if (request.headers.has('range')) return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Cross-origin stays outside this worker's responsibility.
  if (url.origin !== self.location.origin) return;
  // The standalone artefact bypasses the worker completely: never read from the
  // cache and never written to it, as a navigation or as a subresource.
  if (url.pathname === PLAY_HTML) return;

  const cachePromise = caches.open(CACHE);
  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  if (isNavigation) {
    // Network-first. The response goes to the page straight from the network;
    // the canonical shell entry is refreshed alongside it. A failed cache write
    // is swallowed, so it can never turn a good response into a stale fallback.
    // Only a navigation that actually resolved to the shell may refresh that
    // key: any other same-origin page must not be able to clobber it.
    const isShellNavigation = url.pathname === '/' || url.pathname === SHELL_URL;
    const network = fetch(request);
    const refresh = network
      .then((response) => {
        if (!isShellNavigation || !response.ok || response.type !== 'basic') return undefined;
        return cachePromise.then((cache) => cache.put(SHELL_URL, response.clone())).catch(() => undefined);
      })
      .catch(() => undefined);
    event.respondWith(
      network.catch(
        async () =>
          (await cachePromise.then((cache) => cache.match(SHELL_URL, { ignoreVary: true }))) || offlineDocument(),
      ),
    );
    // Called during dispatch, never after an await.
    event.waitUntil(refresh);
    return;
  }

  if (url.pathname.startsWith(ART_PREFIX)) {
    // Art: cache-first, no revalidation, filled on first fetch. A hit costs zero
    // network work; a miss fetches once and stores the bytes for offline. No
    // waitUntil here on purpose — the write is awaited only on the miss path, so
    // a hit can never trigger a background request (that doubling is what broke
    // the 18-concurrent-atlas-decode workload).
    event.respondWith(
      (async () => {
        const cache = await cachePromise;
        // ignoreVary matters: the dev/preview server answers `Vary: Origin`, and
        // an entry stored by a worker-initiated cache.add() has no Origin header
        // while the page's `crossorigin` request does. Without this the worker
        // misses its own cache and 503s a file it is holding.
        const hit = await cache.match(request, { ignoreVary: true });
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok && response.type === 'basic') {
            await cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        } catch {
          return missingAsset();
        }
      })(),
    );
    return;
  }

  // Everything else: cache-first with a background revalidation, kept alive by a
  // dispatch-time waitUntil. `ignoreVary` for the same reason as the art branch.
  const cached = cachePromise.then((cache) => cache.match(request, { ignoreVary: true }));
  const network = fetch(request);
  const refresh = network
    .then((response) => {
      if (!response.ok || response.type !== 'basic') return undefined;
      return cachePromise.then((cache) => cache.put(request, response.clone())).catch(() => undefined);
    })
    .catch(() => undefined);
  event.respondWith(
    (async () => {
      const hit = await cached;
      if (hit) return hit;
      try {
        return await network;
      } catch {
        return missingAsset();
      }
    })(),
  );
  event.waitUntil(refresh);
});

async function precache() {
  const cache = await caches.open(CACHE);

  // 1. The app shell. `cache: 'reload'` skips the HTTP cache so the newest
  //    deploy is what gets stored, never a stale index.html.
  const shell = await fetch(SHELL_URL, { cache: 'reload' });
  if (!shell.ok) throw new Error(`caravan sw: shell fetch failed (${shell.status})`);
  const html = await shell.clone().text();
  await cache.put(SHELL_URL, shell);

  // 2. The content-hashed JS/CSS discovered in that HTML.
  const assets = [...new Set([...html.matchAll(HASHED_ASSET)].map((match) => match[0]))];
  if (!assets.length) console.warn('caravan sw: no /assets/ URLs found in index.html; relying on runtime caching');

  // 3. The rest of the shell. Best effort by design: one 404 must not wedge the
  //    worker in "installing" forever, and a file missed here is still cached the
  //    first time the page asks for it. Runtime art is deliberately NOT precached
  //    here — see the header.
  const extras = [...REQUIRED_SHELL.slice(1), ...assets];
  const settled = await Promise.allSettled(extras.map((url) => cache.add(url)));
  const failed = extras.filter((_, index) => settled[index].status === 'rejected');
  if (failed.length) console.warn('caravan sw: not precached:', failed.join(', '));
}
