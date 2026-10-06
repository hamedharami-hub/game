# Validation — 2026-10-06 · v0.4.0 + Phase 1 & Phase 2 hardening

Phase 1 and Phase 2 are performance, delivery and accessibility changes; no gameplay, save or artwork behaviour changed.

| Check | Result |
| --- | --- |
| `npm test` — save migration, planting, growth, harvest, construction, ambience, audio, particles, interactions, vignette, fauna and the empirical challenge suite | 115 passed, 0 failed/skipped |
| `npm run build` — artwork checks, TypeScript, production bundle, standalone export and the budget gate | Passed, all 6 budget checks met |
| Approved artwork validation | 18 directional atlases, four card sheets, story artwork and immutable approved facial references verified |
| `npx playwright test` | 13 passed, 0 failed/skipped |
| `npx tsc --noEmit` | Passed, and now covers 29 project files instead of 2 |
| `npm ci` | Passed against the updated lockfile (29 packages, 0 vulnerabilities) |
| `git diff --check` | Passed |

Browser coverage includes desktop (1440px) and mobile (390px) planting/building/companion flows, no mobile horizontal overflow, local save reload and version-1 offline recovery, garden and companion reactions, ambience independent of wall-clock jumps, reduced motion, keyboard movement, image decoding, and the standalone offline HTML with one document request. The browser run reported no page errors.

Legacy saves retain plants, personal appearance and profile isolation. The garden expands to the complete 12×12 plot without resetting plant age. The standalone release at `release/play.html` is regenerated from the production build.

Fresh screenshots: [desktop connected grove](../previews/connected-world-v04-1440.png) · [mobile planting panel](../previews/planting-v04-390.png).

## Phase 1 — what changed and what it measured

**Test accounting.** `npm test` previously listed seven files explicitly and enforced 99 assertions, while `tests/empirical-challenge.test.ts` (16 `node:test` assertions) was executed by Playwright during collection but counted by neither runner. The script now uses the globs `src/*.test.ts` and `tests/*.test.ts`, so the enforced count is 115 and every test file in the repository belongs to exactly one runner (8 to `node:test`, 5 to Playwright, none unowned). Playwright `testIgnore` stops the duplicate, unaccounted collection. A deliberate mutation in the previously orphaned file was observed to fail the gate before being reverted byte-for-byte.

**Type coverage.** `tsconfig.json` previously included only `src/main.ts` and `src/state.ts`, so every test file and both config files were excluded from `tsc`. The include now covers `src/**/*.ts`, `tests/**/*.ts`, `playwright.config.ts` and `vite.config.ts` — 29 project files. `strict`, `noEmit` and `allowImportingTsExtensions` are unchanged. Two real type errors in `tests/cozy-loop.spec.ts` were fixed; no suppressions were added.

**Atlas memory.** The character-atlas cache was an unbounded `Map`; a sweep over both characters' nine looks and their diagonals could retain 36 sheets of 1774×887 RGBA (~6.3 MB each). It is now a bounded LRU (6 entries, plus a 64 MB byte budget that exists as headroom for larger future sheets — at the current sheet size the entry bound binds first at 37,764,912 B). Eviction skips any sheet a live actor still draws with, and disposal can never fire twice.

**Texture upload correctness.** Every `.source` reassignment is now preceded by `dispose()` of that same texture while it still points at the old source. Without that, three.js keeps the stale `__cacheKey` (its cache key hashes texture parameters, not source identity), leaves `_sources[newSource]` empty, and uploads the new sheet through the old GL object — which produced `GL_INVALID_OPERATION: glTexStorage2D: Texture is immutable` and left `deallocateTexture` in a state that throws on the next disposal.

**Filtering.** Atlas sheets now set `anisotropy = min(maxAnisotropy, 8)` at creation, before the first upload, which sharpens the 2.5D billboards at the grazing angles of the isometric camera.

**Deployed weight.** `public/` is Vite's `publicDir`, so the four owner-approved provenance originals under `public/art/` were being copied into every deployment despite no runtime code path requesting them. `vite.config.ts` now prunes those build-output copies, reading the list from `docs/IDENTITY_REFERENCES.json` so it cannot drift from the provenance record. The originals remain in the repository untouched and still pass their sha256 checks.

| Measurement | Before | After |
| --- | --- | --- |
| `dist/` total | 35,925,787 B | 26,687,647 B (−9,240,598 B) |
| `dist/art` root files / PNGs | 27 / 4 | 23 / 0 |
| Test assertions enforced by `npm test` | 99 | 115 |
| `tsc` project files | 2 | 29 |
| Texture uploads over a 24-look sweep | 56 | 25 |
| Uploaded bytes over that sweep | 352,472,512 B | 157,353,800 B |
| `GL_INVALID_OPERATION` errors over that sweep | 6+ | 0 |
| `renderer.info.memory.textures` over that sweep | climbing toward 18 | bounded at 3–5 |

The production JavaScript bundle is 621.61 kB uncompressed (169.18 kB gzipped) and the stylesheet 13.19 kB (3.68 kB gzipped); Vite reports its existing advisory for chunks over 500 kB. A headless Chromium software-rendering check loaded the current build in about 2.6s at 1440×960 and 0.8s at 390×844. Frame intervals varied too widely under this renderer to make a physical-device smoothness claim; no real-phone benchmark was run, and every number above was measured under SwiftShader.

## Phase 2 — draw calls, delivery and accessibility

**Draw calls.** The garden soil grid was one mesh per plot — exactly 144 draw calls in every frame, 36% of the total — and each planted flower cost about ten more, so a full garden cost roughly 1,996 draw calls per frame. The grid is now a single `InstancedMesh`, per-plant parts are instanced batches, the static world is merged into vertex-coloured batches, and fauna is consolidated. Counted per *rendered* frame (the loop is throttled, so rAF ticks are not renders), the desktop frame fell from 397.0 to 65.2 and the mobile frame from 232.5 to 40.8; a full 144-plant garden fell from 1,995.6 to 72.0, which makes garden cost flat in plant count. Rendered 3D-world pixels are unchanged to within measurement noise: desktop mean absolute difference 0.0043, 0.001% of pixels differing by more than 24.

**Delivery.** `dist/` is now an installable PWA: a web app manifest, a hand-written service worker, an SVG icon, Open Graph tags and a `<noscript>` fallback, with no new dependency and no change to `vite.config.ts`. The single-file `release/play.html` path is deliberately untouched and remains the offline guarantee; the service worker is a bonus layered on top. The worker caches the shell at install and fills `/art/` lazily, and every cache lookup passes `ignoreVary` because a host that answers `Vary: Origin` would otherwise make the worker fail to match — and 503 — a bundle it was already holding.

**Regression gates.** `npm run build` now ends with `scripts/check-budget.mjs`, a dependency-free gate that fails the build when the enforced test count drops below 115, when the bundle or `dist/` exceeds its budget, when a `.png` reappears under `dist/art/`, or when the standalone HTML stops being self-contained. It parses the test runner's own summary rather than a file list, so an unwired test file cannot make CI quieter — the exact failure Phase 1 uncovered. Eight deliberate mutations were used to prove each guard fires; CI runs the same gate.

**Accessibility.** An independent audit found the HUD header was a full-viewport box: `.hud { inset: 0 }` outranked every bare `header` rule, so the header, its 18px/10px offsets, its side insets and the safe-area top inset never applied. That is fixed, together with a focus ring that measured 1.0–1.18:1 against the live scene (now 3.55–4.00:1 via a two-tone ring), 42px mobile touch targets raised to 44px, two text colours lifted above 4.5:1, 10px type raised to 12px, and dead CSS removed. One audit claim was refuted and left alone.

| Measurement | Before | After |
| --- | --- | --- |
| Draw calls/frame, desktop 1440×960 | 397.0 | 65.2 |
| Draw calls/frame, mobile 390×844 | 232.5 | 40.8 |
| Draw calls/frame, full 144-plant garden | 1,995.6 | 72.0 |
| Attached renderables, 144 plants | 2,140 | 116 |
| Focus ring against the live scene | 1.00–1.18:1 | 3.55–4.00:1 |
| Mobile touch-target height | 42px | 44px |
| `dist/assets` JavaScript chunks | 1 | 1 (unchanged, single-chunk invariant held) |

### Known, not fixed

- 15 `THREE.WebGLRenderer: Texture marked for update but no image data found.` console warnings appear during a full sweep. The same code shape exists at the previous revision, there is no functional impact, and it is recorded here rather than silently ignored.
- `tests/appearance.spec.ts` decodes 18 atlases concurrently and takes 30–55s against a 90s timeout, so its headroom is real but not generous on a loaded machine. The service worker no longer adds measurable cost to it; the cost is the test's own decode workload.
- Offline art in the PWA begins from the second visit: first-visit boot-atlas requests happen before the worker controls the page, so they cannot be captured. The shell is offline from visit 1, and `release/play.html` remains the complete offline artifact.
- The keyboard/assistive-technology defects the audit found in `src/main.ts` and `src/garden.ts` — an incomplete dialog focus trap, a keyboard-unreachable appearance `<select>`, focus lost on garden re-render, and reduced-motion gaps in the travel flash and sprite bob — are **not** fixed. They are recorded as the next task rather than silently dropped.
- `src/cards.ts` is unimported dead code, so the two small card sheets are absent from the standalone HTML while the adult card sheets used by `src/vignette.ts` are present.
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` remain disabled.

No deployed site or remote GitHub Actions run is claimed here.
