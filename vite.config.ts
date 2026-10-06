import { readFileSync, rmSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Why this config exists.
 *
 * The PNGs listed under `preservedArtwork` in docs/IDENTITY_REFERENCES.json are
 * owner-approved originals kept in `public/art/` as in-repo provenance: they are
 * sha256-checked by `npm run verify-art`, so they must never be deleted, moved or
 * edited. `public/` is Vite's publicDir, so Vite copies those ~9.24 MB of sources
 * into `dist/` verbatim, even though no runtime code path requests them and the
 * self-contained build (`scripts/standalone.mjs`) never embeds them.
 *
 * The fix is to prune only the build-output copies after the bundle is written.
 * The originals stay in the repository: do NOT "helpfully" delete them to shrink
 * the build, that breaks `npm run verify-art` and destroys approved source art.
 * Everything else here is left at Vite's defaults on purpose — `scripts/standalone.mjs`
 * depends on the default `dist/assets/*.js` and `dist/assets/*.css` names.
 */

const IDENTITY_MANIFEST = ['docs', 'IDENTITY_REFERENCES.json'] as const;

/**
 * Read `preservedArtwork[].path` from the identity manifest (never a hard-coded
 * file list, so the exclusion cannot drift from the provenance record) and
 * return each entry as a path relative to `publicDir`, which is the shape Vite
 * copies into the output directory.
 */
function readPreservedArtworkPaths(root: string, publicDir: string): string[] {
  const manifestPath = resolve(root, ...IDENTITY_MANIFEST);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `[caravan] cannot read the preserved-artwork manifest ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const preserved = (parsed as { preservedArtwork?: unknown } | null)?.preservedArtwork;
  if (!Array.isArray(preserved)) return [];

  const relativePaths: string[] = [];
  for (const entry of preserved) {
    const declared = (entry as { path?: unknown } | null)?.path;
    if (typeof declared !== 'string' || declared.length === 0) continue;
    const absolute = resolve(root, declared);
    const relativePath = relative(publicDir, absolute);
    // Only files that publicDir actually mirrors into the output can be pruned.
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) continue;
    relativePaths.push(relativePath);
  }
  return relativePaths;
}

/**
 * Deletes the preserved provenance sources from the build output only.
 * Idempotent: a file that is already absent (or was never copied) is not an error.
 */
function excludePreservedArtwork(): Plugin {
  let outDir = '';
  let preservedPaths: string[] = [];

  return {
    name: 'caravan:exclude-preserved-artwork',
    apply: 'build',
    configResolved(config) {
      if (config.command !== 'build') return;
      outDir = resolve(config.build.outDir);
      const publicDir = config.publicDir ? resolve(config.publicDir) : '';
      preservedPaths = publicDir ? readPreservedArtworkPaths(config.root, publicDir) : [];
    },
    closeBundle() {
      if (!outDir) return;
      for (const relativePath of preservedPaths) {
        const target = resolve(outDir, relativePath);
        // Containment guard: never unlink anything outside the output directory.
        if (target !== outDir && !target.startsWith(outDir + sep)) {
          console.warn(`[caravan] skipped preserved artwork outside the build output: ${relativePath}`);
          continue;
        }
        try {
          rmSync(target, { force: true });
        } catch (error) {
          console.warn(
            `[caravan] could not prune preserved artwork from the build output (${relativePath}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [excludePreservedArtwork()],
});
