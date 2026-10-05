# Validation — 2026-10-04

Validated locally using Node 24 and Chromium with software WebGL on the managed environment.

| Check | Result |
| --- | --- |
| Frozen-lockfile install of independent repository (`npm ci`) | Passed, 28 packages installed |
| Pure state/migration/direction tests (`npm test`) | 17 passed, 0 failed/skipped |
| Asset contract/hash verification | 18 atlases and one story illustration verified |
| Typecheck + production + standalone build, original and independent checkout | Passed |
| Browser suite before final dialog cleanup | 16 passed, 2 failed: closed story DOM retained, not a movement-angle failure |
| Final retest after cleanup: directions and complete journey/offline export | 7 passed, 0 failed/skipped, desktop and mobile |
| Host ARSHNAZ iframe test | 1 passed |
| Host ARSHNAZ typecheck/production build | Passed; later game-only static artifact refreshed |

All 18 named browser scenarios have passing results in the relevant runs. The last run deliberately reran the two failing cases and the five complete journey/offline flows affected by closed-dialog cleanup; it was not a new full 18-case run. Initial mobile header overlap was also found and fixed; full mobile journeys passed subsequently. No tests were disabled or asserted away.

Covered: 9 independent hair/outfit combinations per actor, all 18 image atlases decoded, eight camera-relative movement angles, close/wide framing, limited story illustrations, planting/relocation/growth/expansion, account isolation, saved construction, all six regions, spending/cooldowns/hybrid, complete initial inventions and offline HTML with one document request and no dependent network requests.

WebP runtime assets were encoded losslessly with exact RGBA equality checked against PNG sources. Source faces/angles were visually reviewed. This is functional validation, not a frame-rate benchmark on physical phones. Remote GitHub Actions have not run, and this document does not establish a deployed site or online repository.

The editable source and tests are the review basis. release/play.html is an embedded generated artifact. No original private reference photos, account save data or credentials are included.

## Album update
- Build/typecheck/asset digests passed; 17 state tests passed.
- Desktop 1440 and mobile 390 album tests passed: 24 cards, actor/style filtering, enlarged previous/next, return focus, successful sheet download, four decoded sheets and unchanged non-empty persisted game state.
- Existing standalone game smoke passed with only its document request.
- Initial album test invocation reused the prior host checkout preview and was stopped; verification was rerun against this independent repository's current dist. No assertions were removed.
- Dedicated standalone album check passed: all four embedded sheets decoded, all 24 cards shown, no dependent network requests (one document request only).
