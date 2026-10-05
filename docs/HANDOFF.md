# Handoff to other design and coding tools

Start with AGENTS.md. This repository contains the actual playable Three.js/TypeScript game and editable illustrated assets, not only a screenshot prototype. Read ART_DIRECTION.fa.md and WORLD_DESIGN.fa.md for the approved story and visual requirements.

## Run and build

Node 24 recommended; install with `npm ci`. Run `npm run dev -- --port 4174`; `npm test` runs pure state tests. `npm run build` typechecks, builds Vite and generates **dist/play.html**, a fully embedded offline playable HTML. `npx playwright install --with-deps chromium` and `npx playwright test` run meaningful browser checks. Playwright starts preview automatically and may reuse an already-running local preview. CI uses its installed browser; CHROMIUM_PATH optionally selects a local executable. Never weaken TLS or verification for installation.

Builds do not write outside this repository. Optional ARSHNAZ integration: `CARAVAN_ARSHNAZ_ROOT=/absolute/path/to/Arshiam npm run build` copies play.html to that app's public/dream-caravan/index.html. It does not commit, push or deploy the host app.

## Architecture

| File | Responsibility |
| --- | --- |
| src/state.ts | Pure state, backward-compatible save decoding, validated planting/relocation, growth, rewards, expenses, expansion, appearance |
| src/state.test.ts | Meaningful invariant and migration tests |
| src/main.ts | Scene, actors, input, dialogs, route-independent game lifecycle, storage adapter |
| src/world.ts | Six region roots, active visibility, landmarks, projects, personalized decorations, NPCs |
| src/garden.ts | Soil interactions, accessible grid, plant stages, instanced vegetation |
| src/appearance.ts | Literal asset manifest, colors and outfits |
| src/style.css | Responsive Persian RTL controls, dialogs and HUD |
| public/art/ | Runtime atlases and approved artwork |
| public/art/source/ | Original PNG wardrobe atlas sources; WebP is a lossless encoding for runtime |
| scripts/standalone.mjs | Embeds all selectable images, CSS and JS; rejects a build without assets |
| tests/ | Real desktop/mobile browser flows, offline export and account isolation |
| release/play.html | Committed tested playable snapshot; regenerate on release |
| previews/ | Screenshots for review; they are not interactive builds |

## Saved state contract

Save schema remains version 1 with additive fields and migration defaults. `dream-caravan:garden:v1` is the guest key. `?profile=<encoded ID>` scopes local storage to the account, clipped to 128 characters. It is **not authentication** and not cloud sync. Old saves migrate; do not rename keys without migration.

Plants retain ID, species, stable integer cell, plantedAt, boostMs, lastWaterAt and lastHarvestAt. Growth uses elapsed wall-clock time while closed. Repositioning never resets age. Mature flowers survive harvest. Do not move old plants when expanding.

Each region has its own level 0..20 and 8+4*level construction slots. Garden terrain radius starts at 26; other regions at 32; expansion adds 4 radius, costs 3+3*currentLevel essence and preserves layout. This is different from the 4x4..12x12 planting grid. Decorations have region, slot and kind; occupancy and spending are validated. Relocation is free; removal does not refund. `worldSeed` preserves account-specific layout jitter; guest seeds become persistent on first successful save.

Hair and outfit fields are separate per actor. Preserve old gorHair white/brown selections. New defaults: angel black/classic; Gorastakh white/classic. Appearance is cosmetic and free.

## Asset contract

Every `look-<outfit>-<hair>.webp` is a transparent **4 column x 2 row** atlas. Equal cells with safe padding. Top row angel, bottom Gorastakh. Columns front, side, back, opposite side. Angel side ordering and Gorastakh side ordering follow current faceDirection mapping; inspect existing assets before swapping UVs. Runtime sprites use repeat(.25,.5) and offset; retain complete bodies and transparent padding. These are **illustrated 2.5D billboards with eight painted angles**, not editable skeletal vectors or full 3D meshes. Source PNGs permit redesign but do not contain editable vector paths. A future 3D implementation needs new modeling/rigging work.

The standalone embedder recognizes literal `/art/*.png` and `/art/*.webp` URLs. Keep new URLs literal in appearance.ts and check offline tests; runtime string-concatenated paths are not automatically embedded. Native Vite build is intended for origin-root hosting. For subpath hosting, explicitly adapt asset paths and rerun offline/root integration checks.

## Real current capabilities and limitations

Six independently rendered areas, soil planting, four growth stages, water/harvest cooldowns, expansion, paid visible projects, houses up to palace, one fixed hybrid recipe, personal decoration placement/move/remove, local light gathering, flight/hover, moving faceless Two-Horn residents, appearance selection and local persistence work. Buildings have no walkable interiors; navigation has no collision/pathfinding; NPCs have no generated dialogue/orders; AI is not called during play. New themed projects are visual structures, not independent gameplay systems or passive income. Currency is local demo essence, not ARSHNAZ productivity rewards. Hidden scenes remain allocated. Performance was functionally tested, not benchmarked on all physical phones.

## ARSHNAZ connection boundary

The host currently embeds `/dream-caravan/index.html?v=<release>&profile=<userID>` in a lazy iframe via DreamCaravanView. Host-side integration files belong to the separate Arshiam repository and are described in docs/ARSHNAZ_INTEGRATION.md. This game repo can develop independently. Future verified task rewards require a server-side idempotent reward ledger and authenticated synchronization. Do not trust query strings or client-local essence as proof of completed tasks.

## How to return changes for review

Create a branch, explain user-visible changes and preserve canonical faces. Include changed asset source/optimized versions, test evidence, fresh mobile/desktop screenshots, migration notes and limitations. Update release/play.html from the validated build. Provide commit/PR URL; the owner will bring it back to Codex for review. Never upload credentials, local saves or original personal reference photos. Do not merge/deploy production unless the owner requests it.


## Eight-direction movement and story moments

Movement accepts arbitrary directions and diagonal keyboard input. Each of the 18 actor looks now has eight painted angles: four cardinal frames in look-* and four diagonal frames in diag-*. These are two compatible 4x2 sheets per wardrobe combination, with angel top and Gorastakh bottom. Diagonal columns are FRONT-RIGHT, BACK-RIGHT, BACK-LEFT, FRONT-LEFT, at sectors 1/3/5/7. Existing cardinal sheets keep their original actor-specific side order. src/directions.ts maps camera-relative vectors; main.ts blends the outgoing/incoming painted frame over 160ms. It is not a skeletal walking cycle. Preserve directions in both native and standalone builds, and test all eight key combinations. Reduced motion skips the blend.

Close play and wide overview are switchable through the camera button, with smooth distance change. Soil editing prioritizes the close garden framing. These are one-camera framings, not split-screen or simultaneous scenes.

Adult-proportioned artwork in story-adults.webp is used in exactly two places: the initial welcome and the first garden-restoration milestone. Both remain skippable/closable; no forced video or arbitrary cinematic on normal travel. These story illustrations intentionally show canonical original costumes with black-haired angel and white-haired Gorastakh, while gameplay uses saved wardrobe selections. The short entrance motion obeys reduced-motion settings. Keep this restrained placement rather than adding large portraits to every action.

The self-contained release embeds every selectable image and is about 53 MiB in this revision. Do not load its base64 into an LLM prompt; use the small TypeScript sources, handoff docs and selected images. Native source/build keeps image files separate and loads the relevant atlas lazily. Hosting native assets separately in ARSHNAZ is a possible future optimization and has not been implemented here.

Build validates the artwork manifest and file digests first. After intentional artwork edits, preserve source PNG, regenerate lossless WebP and update dimensions/sha256 in ASSET_MANIFEST.json. A mismatched digest is a failed build, not a test to suppress.

## Optional character album
`src/cards.ts` defines 24 curated cards across four six-panel source sheets. In the travel journal, choose «آلبوم شخصیت‌ها»; filter actor/style, open a card, navigate or download its six-image sheet. All cards are freely viewable; no random loot, purchase or invented productivity reward. Adult story auto-display remains restricted to the original two moments; the album is explicitly opened. Images depict canonical defaults, independent of wardrobe. Sources are 3x2 PNG sheets, runtime WebP; CSS crops with background-size 300% 200%. They are still illustrations with a subtle reduced-motion-aware entrance, not newly rigged character animations. Local game saves are unchanged.

## Fixed character identities
Read CHARACTER_IDENTITY.fa.md and IDENTITY_REFERENCES.json before any artwork generation. The five public/art/reference originals are immutable approved facial sources (adult/compact, per actor); runtime art is never the next generation's facial source. The owner explicitly rejected facial drift on 2026-10-04. IDENTITY_AUDIT.json records reviewed replacements and previous/current source digests. Build checks original reference digests and per-runtime-sheet provenance; this validates files, not visual likeness. Keep facial reviews separate from browser tests. Original approved game compatibility artwork and ARSHNAZ login/companion artwork were reviewed and retained. Use the latest corrected package instead of earlier delivered images for continued work.
