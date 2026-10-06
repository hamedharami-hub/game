# Dream Caravan — project handoff

Read README.md, docs/HANDOFF.md, docs/WORLD_DESIGN.fa.md and docs/CHARACTER_IDENTITY.fa.md before major changes. This is the standalone Three.js game, not the whole ARSHNAZ app.

## Current design
- The game stays on one large, connected Two-Horn landscape. Its garden, home, greenhouse, grove and village are landmarks in the same world, not separate planets or portal scenes.
- Keep the main loop calm and direct: plant, watch, harvest, arrange, and spend time with local companions. Avoid mandatory quests, resource grinds, long instructions and extra HUD systems.
- Planting and small builds are free. Flowers continue growing while the game is closed. Preserve touch, keyboard, reduced-motion, and readable contrast behavior.
- The local companion characters are not online multiplayer or AI. Do not add Firebase, credentials or unverified ARSHNAZ task rewards.

## Character and save contracts
- The angel and Gorastakh are adults in a compact/chibi style; their relationship is romantic. Preserve approved faces, upward ivory horns, angel wings/halo and magical clothing.
- Immutable approved face sources are in `public/art/reference/` and documented in `docs/IDENTITY_REFERENCES.json`. Read `docs/CHARACTER_IDENTITY.fa.md` before any character-art edit. Runtime atlases are descendants, not identity references.
- Defaults remain black-haired/classic angel and white-haired/classic Gorastakh. Keep hair and outfit independent, all nine combinations per character, and all eight painted directions. The images are 2.5D sprites, not skeletal models.
- Keep `SAVE_KEY`, version-1 decoding, profile isolation and existing plant coordinates, growth and appearance choices. Migrate old saves; never reset them to simplify implementation.
- Save data is local to the browser. It is not authentication or cross-device sync.

## Validation and release
- Use Node 24; run `npm ci`, `npm test`, `npm run build`, and `npx playwright test` for functional changes. Keep assertions meaningful; do not skip failures.
- Check 390px mobile and 1440px desktop, planting, harvesting, building, companions, persistence, all eight movement directions, reduced motion and offline `dist/play.html`.
- Update `CHANGELOG.md`, `docs/WORLD_DESIGN.fa.md` and `docs/VALIDATION.md` for gameplay changes. Refresh `release/play.html` from a validated build.
- Keep approved source art, manifests and provenance intact. Do not commit credentials, account saves or private reference photos. The standalone build is generated; edit `src/`, assets and scripts instead.
