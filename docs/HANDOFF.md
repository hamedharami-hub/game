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
| `src/state.ts` | Versioned local save, migration, flowers, layout and appearance |
| `src/appearance.ts`, `src/directions.ts` | Appearance assets and eight-direction sprite mapping |
| `src/style.css` | Responsive, accessible game interface |
| `public/art/` | Approved art, immutable references and runtime atlases |
| `scripts/standalone.mjs` | Embeds literal art URLs, CSS and JS into the offline HTML |
| `tests/` | Browser flows, sprite assets, profiles and offline build |
| `release/play.html` | Tested standalone release snapshot |

## Current play and saved data

The game opens on one large connected Two-Horn landscape. The main actions are planting, arranging the garden, and visiting companions. All flowers and small garden builds are free. Flowers grow in about 1–2 minutes, keep growing while closed, and start another cycle when picked. The world animates gently and honors reduced-motion settings.

Keep save schema version 1, `dream-caravan:garden:v1`, profile-specific keys and migration behavior. Existing plants, placed objects, and hair/outfit choices must survive changes. The whole 12×12 plot is open in new and migrated saves. Local storage is per browser/profile; `?profile=<encoded ID>` is not authentication or cloud sync.

Legacy resource and regional fields remain in old saves for compatibility. They are not part of the current play loop; do not add costs, cooldown chores or quests back into the HUD without a clear design reason.

## Character and asset contract

The angel and Gorastakh are adult characters in a compact style. Keep the approved faces and established appearance defaults. Read `docs/CHARACTER_IDENTITY.fa.md` and `docs/IDENTITY_REFERENCES.json` before art edits; immutable references live under `public/art/reference/`. Hair and outfit are independent, with all nine combinations for each actor. The characters are 2.5D sprites with eight painted directions, not skeletal models.

Every `look-<outfit>-<hair>.webp` and `diag-<outfit>-<hair>.webp` is a transparent 4×2 atlas. Keep the 18 atlas pairs, asset manifest, source PNGs, digests and standalone embed rules intact. Build verifies approved references and runtime art. Tests should check all eight movement sectors and that all used art decodes.

## Limits and return

Companions and residents are local, not online multiplayer or AI. Saves do not sync across devices. The game has no walkable building interiors or ARSHNAZ task rewards. Do not invent credentials or treat local values as verified productivity points.

For gameplay changes, update `CHANGELOG.md`, `docs/WORLD_DESIGN.fa.md` and `docs/VALIDATION.md`. Run the Node tests, production build, and browser suite; check 390px mobile and 1440px desktop; refresh `release/play.html` and attach a fresh screenshot. Never commit credentials, account saves or private reference photos.

Optional ARSHNAZ copy is documented in `docs/ARSHNAZ_INTEGRATION.md`. A game repository push does not publish the host app or deploy a site.
