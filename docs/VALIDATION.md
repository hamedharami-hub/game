# Validation — 2026-10-06 · v0.3.0

| Check | Result |
| --- | --- |
| `npm test` — save migration, planting, growth, harvest and construction | 9 passed, 0 failed/skipped |
| `npm run build` — art verification, TypeScript, Vite and standalone export | Passed |
| Approved artwork validation | 18 directional atlases, four card sheets and immutable face references verified |
| `PLAYWRIGHT_PORT=4175 npx playwright test` | 8 passed, 0 failed/skipped |
| `git diff --check` | Passed |

Browser coverage: 1440px desktop and 390px mobile planting/building/companion flows; mobile action placement; local save reload; reduced-motion and keyboard use; all eight movement directions; character and card image decoding; and the standalone offline HTML with one document request.

Earlier version-1 saves retain plants, personal appearance and profile isolation. Their garden expands to the complete 12×12 plot without resetting plant age. The standalone release at `release/play.html` was regenerated from the validated build.

Fresh screenshots: [desktop connected world](../previews/connected-world-1440.png) · [mobile planting panel](../previews/planting-390.png).

The production build has a Vite advisory that the uncompressed JavaScript chunk exceeds 500 kB; it is 147 kB gzipped. Browser checks use Chromium software rendering. Frame rate has not been benchmarked on physical phones, and no deployed site or remote GitHub Actions run is claimed here.
