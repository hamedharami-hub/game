# Validation — 2026-10-06 · v0.4.0

| Check | Result |
| --- | --- |
| `npm test` — save migration, planting, growth, harvest, construction and ambience sampling | 15 passed, 0 failed/skipped |
| `npm run build` — artwork checks, TypeScript, production bundle and standalone export | Passed |
| Approved artwork validation | 18 directional atlases, four card sheets and immutable face references verified |
| `npx playwright test` | 10 passed, 0 failed/skipped |
| `git diff --check` | Passed |

Browser coverage includes desktop (1440px) and mobile (390px) planting/building/companion flows, no mobile horizontal overflow, local save reload and version-1 offline recovery, garden and companion reactions, ambience independent of wall-clock jumps, reduced motion, keyboard movement, image decoding, and the standalone offline HTML with one document request. The browser run reported no page errors.

Legacy saves retain plants, personal appearance and profile isolation. The garden expands to the complete 12×12 plot without resetting plant age. The standalone release at `release/play.html` is regenerated from the production build.

Fresh screenshots: [desktop connected grove](../previews/connected-world-v04-1440.png) · [mobile planting panel](../previews/planting-v04-390.png).

The production JavaScript bundle is 572.52 kB uncompressed (152.71 kB gzipped); Vite reports its existing advisory for chunks over 500 kB. A headless Chromium software-rendering check loaded the current build in about 2.6s at 1440×960 and 0.8s at 390×844. Frame intervals varied too widely under this renderer to make a physical-device smoothness claim; no real-phone benchmark was run.

No deployed site or remote GitHub Actions run is claimed here.
