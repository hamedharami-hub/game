# Dream Caravan / کاروان رؤیاها — agent handoff

Read README.md, docs/HANDOFF.md, docs/ART_DIRECTION.fa.md and docs/WORLD_DESIGN.fa.md before editing. This is an independent game repository, not the whole ARSHNAZ app.

## Preserve approved design
- The angel and Gorastakh are ADULT characters in a cute compact/chibi style, not children. Their relationship is romantic. Gorastakh is the wise ruler of the Two-Horn world.
- Preserve the approved faces, luminous ivory horns pointing upward, angel wings/halo and magical runic clothing. Changing hair/outfits must not change facial identity. Use ONLY immutable originals in public/art/reference/ and docs/IDENTITY_REFERENCES.json as facial references. Runtime atlases/cards are descendants, never authoritative identity references. Read docs/CHARACTER_IDENTITY.fa.md before any character-art edits. Do not substitute emoji, generic avatars or photorealistic humans.
- Current chapter stays in the Two-Horn world. Six full-size independent regions: garden, greenhouse, home, village, grove, sanctuary. Only the active region renders; hidden geometry is cached in memory. Do not claim streaming or true skeletal characters.
- Nature, soul, magic, invention and love should be visible in the world. Avoid making this an ordinary village or flooding the screen with text.

## Preserve behavior and data
- Keep SAVE_KEY and backward-compatible decodeSave migration. Never reset saved worlds as a shortcut. Preserve profile isolation, stable plant coordinates/age, cooldowns, paid upgrades and selected appearances.
- Default angel: BLACK hair and CLASSIC original white/gold dress. Default Gorastakh: WHITE hair and CLASSIC original black/gold runic robes. Preserve these defaults and old saved choices.
- Hair (black/brown/white) and outfit (classic/traveler/celestial) are independent per character, all nine combinations per character supported.
- No real ARSHNAZ task rewards, Firebase or runtime AI are implemented. Do not invent credentials, alter task data or present local essence as verified productivity points.
- Keep mobile touch, desktop keyboard, reduced-motion behavior, free relocation and collision/occupancy validation. Planting and construction must visibly affect the active world.
- New areas must use the region lifecycle. Avoid rendering all areas together or regenerating geometry each frame. Share/instance geometry where possible and dispose unique resources on replacement.

## Validate and return
Use Node 24, npm ci, npm test, npm run build; install Playwright Chromium if needed and run npx playwright test. The config starts preview automatically. No skipped tests or disabled assertions to hide regressions.
Check mobile 390 px and desktop 1440 px, actual planting/moving, region switching, persisted account-specific data and independent appearance choices. Verify dist/play.html is self-contained.
Use a separate branch and supply a reviewable PR or commit, screenshots, tests and migration notes. No secrets, node_modules, original personal photos or account saves in Git. Keep generated artwork sources and the cardinal/diagonal asset contract. Eight painted angles are implemented; do not regress to four by ignoring diagonal sheets. Automatic story adult portraits occur only at welcome and first restoration. The optional 24-card album in the travel journal may show adult/compact art when explicitly opened; preserve its filters, gallery navigation and sheet downloads. Update CHANGELOG.md and docs/CHANGE_REQUEST.md when functionality changes.

For efficient AI context, read src/ and docs/ rather than dumping release/play.html or image base64. The embedded offline export is deliberately large; it is an artifact, not the editable source.
