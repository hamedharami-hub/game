# Integration into ARSHNAZ

The source host is hamedharami-hub/Arshiam. It embeds the game through src/pages/DreamCaravanView.tsx on /app/caravan, passing the signed-in user's identifier as profile. src/App.tsx registers the lazy route; sidebar components/quicklinks expose باغ و خانه. vercel.json excludes /dream-caravan/ from SPA rewriting; vite.config.ts excludes the large embedded HTML from PWA precache/navigation fallback. These host changes were local work at handoff; this standalone repository does not prove they are committed or deployed upstream.

To import a reviewed release:
1. Build/test this repo; copy dist/play.html into the host's public/dream-caravan/index.html (or set CARAVAN_ARSHNAZ_ROOT for build).
2. Bump the iframe v query in DreamCaravanView and its test to invalidate old versions.
3. Run the host's typecheck, build and iframe test; preserve the PWA/Vercel exclusions.
4. Commit the host integration deliberately and deploy only when requested. Publishing this game source alone does not update arshiam.vercel.app.

Profile-scoped local storage is for convenience, not identity verification. There are no cross-origin authenticated game messages, server reward endpoints or Firebase integration yet. Design those explicitly before linking real tasks or Leitner study scores, with idempotent server-confirmed rewards and duplicate/retry tests. Never mutate tasks from the game iframe.
