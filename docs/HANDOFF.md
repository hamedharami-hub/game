# Handoff

Read [AGENTS.md](../AGENTS.md), [WORLD_DESIGN.fa.md](WORLD_DESIGN.fa.md) and [CHARACTER_IDENTITY.fa.md](CHARACTER_IDENTITY.fa.md) before changing the game or its characters. This repository contains the standalone Three.js game; ARSHNAZ host integration is separate.

## Run and validate

Use Node 24. `npm ci` installs dependencies. Run `npm run dev -- --port 4174` for local play, `npm test` for state and migration coverage, and `npm run build` for typecheck, asset verification, Vite and the embedded offline `dist/play.html`. `npx playwright install --with-deps chromium` installs the browser; `npx playwright test` runs desktop/mobile flows and offline checks. Do not weaken TLS verification.

## Source map

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Single scene, actors, movement, compact HUD, companion interactions and saves |
| `src/world.ts` | Continuous landscape, landmarks, residents, wind, water and saved decorations |
| `src/garden.ts` | Planting, growth visuals, harvest, keyboard grid and small garden panel |
| `src/ambience.ts` | Deterministic active-play light and weather sampling; no wall-clock or save dependency |
| `src/state.ts` | Versioned local save, migration, flowers, layout and appearance |
| `src/appearance.ts`, `src/directions.ts` | Appearance assets and eight-direction sprite mapping |
| `src/style.css` | Responsive, accessible game interface |
| `public/art/` | Approved art, immutable references and runtime atlases |
| `scripts/standalone.mjs` | Embeds literal art URLs, CSS and JS into the offline HTML |
| `tests/` | Browser flows, sprite assets, profiles and offline build |
| `release/play.html` | Tested standalone release snapshot |

## Current play and saved data

The game opens on one large connected Two-Horn landscape. The main actions are planting, arranging the garden, and visiting companions. All flowers and small garden builds are free. Flowers grow in about 1–2 minutes, keep growing while closed, and start another cycle when picked. Nearby flower diversity produces predictable visual reactions; companion moments are short and can be interrupted by player input. Light and occasional weather follow active session time, so nothing expires while the game is closed. Quiet generated wind/rain audio starts after a user gesture and pauses when the tab is hidden. The world animates gently and honors reduced-motion settings.

Keep save schema version 1, `dream-caravan:garden:v1`, profile-specific keys and migration behavior. Existing plants, placed objects, and hair/outfit choices must survive changes. The whole 12×12 plot is open in new and migrated saves. Local storage is per browser/profile; `?profile=<encoded ID>` is not authentication or cloud sync.

Legacy resource and regional fields remain in old saves for compatibility. They are not part of the current play loop; do not add costs, cooldown chores or quests back into the HUD without a clear design reason.

## Character and asset contract

The angel and Gorastakh are adult characters in a compact style. Keep the approved faces and established appearance defaults. Read `docs/CHARACTER_IDENTITY.fa.md` and `docs/IDENTITY_REFERENCES.json` before art edits; immutable references live under `public/art/reference/`. Hair and outfit are independent, with all nine combinations for each actor. The characters are 2.5D sprites with eight painted directions, not skeletal models.

Every `look-<outfit>-<hair>.webp` and `diag-<outfit>-<hair>.webp` is a transparent 4×2 atlas. Keep the 18 atlas pairs, asset manifest, source PNGs, digests and standalone embed rules intact. Build verifies approved references and runtime art. Tests should check all eight movement sectors and that all used art decodes.

## Limits and return

**Latest 2026-10-14:** immutable build42900 passes artwork/typecheck,187 Node tests/all six gates and **33/33 hardware browser tests in2.2m**. Use top of VALIDATION.md as current authority; older pending/red entries below are historical. Default SwiftShader reliability remains unresolved and real phones unmeasured. No run active; candidate remains local/unpublished, release unpromoted. Next: wider spirit-tree visual composition review, then scoped release decision/promotion and push, preserving failed-run records and existing user artifacts.

42895 actual Adreno/D3D11 hardware Chrome profile passes the limited click/photo probe (214ms click, 422ms successful download, 3.43ms average frame work). Full hardware validation 42896 is running via explicit playwright.hardware.config.ts; default software config unchanged and prior failures retained. Hardware success is not assumed for full suite or physical phones; no release promotion yet.

42894 failed at the ordinary companion click before any photo/toBlob; context close also exceeded its diagnostic bound. No download-stage evidence obtained. Stop local unchanged retries/speculative fixes: next step is controlled main-thread/GPU profiling, preferably hardware-backed browser. No background run active; diagnostic shutdown completion is not guaranteed by returned shell result. Candidate remains unpublished/red (complete31/33, focused1/3; 187 Node/build pass).

42893 capture timing: PNG callback ~3.2s/414,736 B but total download sequence ~61.8s and reopen 12.5s; PNG encoding alone does not explain the delay. Controlled 42894 now splits download event from `download.failure()` completion wait; only diagnostics changed, Blob URL lifetime unchanged. No complete suite/release active.

42892 generated four A/B/B/A rows then shell timed out at 240s. MSAA removal did not consistently improve click/photo timing; no production antialias change made. Retained diagnostic JSON, but shutdown completion unconfirmed. Stop unchanged retries; next diagnostic should measure draw completion vs PNG readback/encoding vs post-capture scheduling. Latest complete remains 31/33 and focused 1/3; candidate unpublished.

42891 fresh build: 187 tests/all gates pass; focused browser 1/3 passes (mobile photo), initial mobile controls and desktop photo fail deadlines/session teardown. No complete retry active. Controlled diagnostic 42892 A/B/B/A measures low-quality antialias on/off and capture/reopen costs; no production AA change or effectiveness claim yet. No publication.

Latest complete 42890: 31/33 passed, mobile flight status/deadline and desktop photo teardown failed; prior 42887 was 32/33. Appearance integrity/play separation passes but concurrent full-catalog decode during active SwiftShader remains documented stress failure. Follow-up source blocks airborne idle reactions and removes duplicate photo drawing/pauses scene draws during PNG encoding; fresh build in background, not yet browser validated. No publication.

2026-10-14: controlled diagnostics 42884/42885 distinguish slow game drawing from fast blank contexts; retained JSON in review-artifacts. Source now adds a nonblocking WebGL2 GPU fence gate, including explicit capture fencing; latest build passes 187 Node tests/all six gates. Diagnostic 42886 runs against this build. Browser effectiveness and a complete 33-scenario suite remain unvalidated; do not publish. The 42883 failure traces remain intact.

Latest follow-up adds guarded HUD writes and a bounded expensive-render idle budget, with 184 Node tests/build passing. Focused browser run 42883 failed 0/4 passed, all also exceeding context-teardown deadlines; no performance improvement established. Idle-HUD browser regression is added but unexecuted. No background run is active. Do not publish this unvalidated runtime candidate or substitute older focused passes for a complete latest suite.

New unpublished dream-landscape work is local: shared terrain coordinates, map rivers/lakes/spirit silhouette, redesigned spirit/tree/lake/bird scenery, radius corrections, low-power blur removal, build-time Terser and reduced-motion static-photo render policy. See the top of VALIDATION.md for current results: 182 Node tests/build pass; latest complete browser suite is 28 passed / 4 failed. The two remaining focused failures also reproduce on isolated committed baseline 84405fa (port 42882). Do not treat this comparison as a green candidate or promote release; no additional retry is active.

Latest source candidate `9d49fef` is on `main`; production build and 177 Node tests passed, and full Playwright validation on port 42875 completed with 30 passed / 0 failed. Earlier pending-run notes are historical. Physical-phone performance and the complete six-phase design remain unfinished; release snapshot is still unpromoted.

The shared-life candidate adds `State.life` with conservative v1 defaults: bounded species counts, vases, last gift and greenhouse mood color. Keep the key/version unchanged. `src/life.ts`, `src/life-world.ts`, `src/editing-history.ts`, `src/input.ts` and `src/save-files.ts` isolate new behavior. Harvest/use clears layout history to prevent duplicate product rewards. `tests/shared-life.spec.ts` exercises the real UI and persistence. Standalone export no longer copies to release automatically; promote only after validation. See `IMPLEMENTATION_PLAN.fa.md` for unimplemented full-plan features.

`src/breeding.ts` implements two explicit living-parent crosses; hybrid species persist through the existing plant/inventory decoder. `src/editing-camera.ts` bounds the session-only building camera. `src/home-layout.ts` defines the original home's doorway/walls and furniture arrangement values; `State.life.homeArrangement` defaults to tea for legacy saves. Home and photo framing passed focused browser checks at both sizes; complete latest browser validation remains pending. Placed cottages/cabins do not have interiors. `src/resident-routine.ts` provides short active-time routes and contextual greetings; local obstacle lists refresh on layout edits.

Companions and residents are local, not online multiplayer or AI. Saves do not sync across devices. The game has no ARSHNAZ task rewards. Do not invent credentials or treat local values as verified productivity points.

For gameplay changes, update `CHANGELOG.md`, `docs/WORLD_DESIGN.fa.md` and `docs/VALIDATION.md`. Run the Node tests, production build, and browser suite; check 390px mobile and 1440px desktop; refresh `release/play.html` and attach a fresh screenshot. Never commit credentials, account saves or private reference photos.

Optional ARSHNAZ copy is documented in `docs/ARSHNAZ_INTEGRATION.md`. A game repository push does not publish the host app or deploy a site.
