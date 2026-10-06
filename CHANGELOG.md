# Changelog

## Unreleased — Waterfall, spirit tree and free landscape building
- Enriched the shared Two-Horn land with a wider, softly luminous winding river, a short waterfall with moving glints, and a spirit tree with a glowing heart and drifting lights. The grove remains part of the same walkable landscape.
- Opened a broad grove clearing around the river and spirit tree so the landmark reads clearly in the wide landscape view.
- Added free placement for trees, spirit trees, flowers, flower clusters, garden beds, cottages, cabins, gazebos, bridges, and wells. Ground previews show clear and blocked positions; placed items can be moved, rotated, and removed.
- Made the live planting garden movable. Existing flowers and their growth remain attached to the garden when it is relocated.
- Aligned the movable garden and placed objects to the curved land surface. Bridge placement can span the river, and both its saved crossing and fixed plank crossings stay walkable.
- Batched complex placement previews into one draw call (two for the live-garden footprint), while keeping previews selectable through, tinting valid/blocked positions, and disposing owned preview resources.
- Kept the top bar focused on planting, free building and companions; flight remains available in the companion menu.
- Kept construction free and saved new placements alongside existing local profiles and version-1 gardens.

## Unreleased — Draw calls, delivery and accessibility
- Cut draw calls per rendered frame from 397 to 65 on desktop and 232 to 41 on mobile. The garden soil grid alone was 144 draw calls in every frame, and each flower cost about ten more, so a full garden cost roughly 1,996; it now costs 72 and is flat in plant count. The soil grid is one instanced mesh, per-plant parts are instanced batches, the static world is merged into vertex-coloured batches, and fauna is consolidated. Rendered world pixels are unchanged to within noise (0.001% of pixels differ by more than 24).
- Made `dist/` an installable offline PWA with a web app manifest, a hand-written service worker, an SVG icon, Open Graph tags and a `<noscript>` fallback — with no new dependency and no build-config change. The single-file `release/play.html` remains the offline guarantee and was left untouched.
- Fixed a service-worker defect that made offline boot fail silently: the worker could not match its own cached bundle on hosts answering `Vary: Origin`, so it served a 503 for a file it was holding, and the app booted to a blank page. Cache lookups now ignore `Vary`.
- Added a dependency-free budget gate to `npm run build` and CI that fails when the enforced test count falls below 115, the bundle or deploy weight regresses, a `.png` reappears under `dist/art/`, or the standalone HTML stops being self-contained. It parses the runner's own summary, so an unwired test file can no longer make CI quieter.
- Fixed a layout defect where `.hud { inset: 0 }` outranked every bare `header` rule, making the header a full-viewport box: its offsets and the safe-area top inset never applied. Also raised the focus ring from 1.0–1.18:1 to 3.55–4.00:1 against the live scene, lifted mobile touch targets from 42px to 44px, raised two text colours above 4.5:1, and removed dead CSS.
- No gameplay, save format, artwork or offline behaviour changed.

## Unreleased — Performance and validation hardening
- Bounded the character-atlas cache: an unbounded map could retain 36 sheets of 1774×887 RGBA (~6.3 MB each) after a full look sweep; it is now an LRU capped at six entries, and eviction never touches a sheet a live actor is still drawing with.
- Fixed texture uploads through stale GPU objects: reassigning a texture's source without disposing it first left three.js uploading new sheets through the old GL texture. That produced `GL_INVALID_OPERATION: glTexStorage2D: Texture is immutable` and could throw on the next disposal. Every source swap now disposes first, which removed the GL errors and cut a 24-look sweep from 56 uploads / 352 MB to 25 uploads / 157 MB.
- Stopped re-uploading full atlas sheets on every save when nothing about the appearance had changed.
- Set texture anisotropy so the 2.5D billboards stay sharp at the grazing angles of the isometric camera.
- Excluded the four owner-approved provenance originals from the deployed build output: they are still kept and sha256-verified in the repository, but they were being copied into every deployment despite no runtime code path requesting them. `dist/` drops from 35.9 MB to 26.7 MB.
- Wired the 16 previously unaccounted assertions in `tests/empirical-challenge.test.ts` into `npm test` (99 enforced assertions become 115) and stopped Playwright from collecting `*.test.ts` files outside its accounting.
- Extended `tsc` coverage from 2 files to 29, so all tests and both config files are type-checked; two real type errors were fixed without suppressions.
- No gameplay, save format, artwork or offline behaviour changed.

## v0.4.0 — One world, fresh moments
- Made garden layout produce clear, deterministic visual reactions: moonflower and starlily halos, butterflies near mixed blooms, and a warmer bed with greater flowering diversity.
- Added short companion moments around fresh blooms and new garden builds; manual movement and visits remain in control.
- Added an 18-minute active-play light cycle with distinct morning, day, evening and night palettes, plus occasional breezes, light rain and a quiet generated ambient sound bed.
- Added two walkable grove discoveries: an elder-tree resting nook and a small stream-fed pond lookout.
- Improved mobile planting targets and garden-panel scrolling while preserving reduced-motion and keyboard support.
- Kept version-1 saves, flowers, layouts, appearance choices and offline growth; no new currency, daily reward or expiry was added.

## v0.3.0 — One living world
- Replaced the planet-hopping quest flow with direct entry to one broad, connected Two-Horn landscape.
- Simplified the main actions to planting, arranging the garden, and spending time with local companions.
- Made all flowers and small garden builds free; flowers grow in 1–2 minutes and begin a new bloom after harvest.
- Added gentle responses to planting, breeze-swaying trees and flowers, moving water, fireflies, warm house lights, and companion gestures.
- Preserved profile saves and character appearance choices; earlier gardens open into the full planting area.
- Removed the quest checklist, portal/map travel, resource costs and opening story dialog from normal play.

## v0.2.0 — Wardrobe and independent handoff
- Three independent hair choices and three outfits per actor; nine looks per actor, eight directions each.
- Eight painted directions per look, with short frame crossfade and reduced-motion support.
- Restrained adult story illustration at welcome and the first garden restoration; closable, no repeated travel interruptions.
- Fixed mobile header overlap that blocked the travel journal.
- Approved source artwork, optimized lossless runtime atlases, explicit asset manifest.
- Backward-compatible cosmetic fields; existing white/brown Gorastakh saves retained.
- Smooth close/wide camera framing switch; eight illustrated directions documented separately from skeletal animation.
- Independent build and CI instructions, story/art guardrails, architecture and ARSHNAZ boundary documentation.

## Earlier local prototypes
- Six independent region scenes; magical portals, sparse varied trees, flight and hover.
- Personal construction, free relocation/removal, per-region expansion up to 20, 11 additional themed projects.
- Growing plants, garden expansion to 12x12, hybrid discovery, house upgrades, local currency and account-separated saves.

## Character album
- 24 new illustrated poses: six each for angel/Gorastakh, compact/adult proportions.
- Optional travel-journal album with actor/style filters, enlarged cards, previous/next and sheet downloads.
- Original faces, black-haired angel and white-haired Gorastakh retained; no forced portraits during normal play.

## Restore approved facial identities
- Recompare character artwork with the original approved direction/portrait sheets, rather than using newly generated descendants as face references.
- Correct facial structure, brows, eye color and compact proportions in album/story and directional wardrobe sheets.
- Keep five exact original reference sheets and their hashes with per-asset provenance; preserve approved ARSHNAZ login/companion art.
- Preserve all eight movement angles, saved appearance choices and the existing restrained story/optional album behavior.
