#!/usr/bin/env node
/**
 * Dream Caravan - regression budget gate.
 *
 * WHY THIS EXISTS
 * Phase 1 found 16 real tests executing while no runner counted them, plus a
 * docs/VALIDATION.md that had drifted to numbers from an older revision.
 * Nothing in CI would have caught either. This gate turns four measurable
 * quality properties into a build failure instead of slow drift:
 *
 *   1. Test-count floor. `npm test` must still report at least 115 tests with
 *      zero failures. The count is parsed from the runner's OWN summary line
 *      (spec `(i) tests 115` or TAP `# tests 115`). There is deliberately no
 *      hard-coded file list: the old `test` script rotted precisely because it
 *      named files instead of asking the runner what it actually ran. A summary
 *      that cannot be parsed is a FAILURE, never a silent pass.
 *   2. Bundle budget. Raw and gzip bytes of every dist/assets .js file.
 *   3. Deploy weight. Total dist/ bytes, plus "no .png may reappear under
 *      dist/art/" (the Phase 1 preserved-artwork exclusion regressing).
 *   4. Standalone integrity. dist/play.html exists and embeds its artwork,
 *      i.e. no raw `/art/` reference survives inside it.
 *
 * ORIGINAL BASELINE SNAPSHOT - the measurement the original budgets were derived from
 * (2026-10-06, git 40b9cb0 + completed Phase 1 changes plus the Phase 2
 * landings). Both Phase 2 teammates kept editing after it was taken, so read
 * these numbers as provenance for the budgets, not as current state: the gate
 * prints live measured values and margins on every run. The landings were PWA
 * (dist/sw.js, dist/manifest.webmanifest, dist/icons/icon.svg, +267 B SW
 * registration in the bundle) and world-perf (+4,888 B of hand-rolled instancing
 * in src/world.ts, src/garden.ts, src/fauna.ts, no BufferGeometryUtils import):
 *   npm test               115 tests / 0 failures (8 files found by the runner)
 *   dist/assets/*.js       621,534 B raw, 168,706 B gzip at zlib level 9
 *   dist/ total            26,710,382 B in 35 files
 *   dist/art/*.png         0 files
 *   dist/play.html         13,518,504 B, 0 raw `/art/` refs, 21 embedded data:image payloads
 *
 * BUDGETS AND WHY THESE HEADROOMS
 *   minTests  115         exact floor - a floor needs no headroom; it only ever
 *                         rises as tests are added, and never silently falls.
 *   jsRaw     660,000 B   baseline + 38,466 B (+6.19%)
 *   jsGzip    185,000 B   baseline + 16,294 B (+9.66%)
 *   distTotal 27,500,000 B baseline + 789,618 B (+2.96%)
 * The original bundle budgets were frozen at baseline + 6% while the Phase 2
 * landings were still in flight. On 2026-10-07, the compact single-world map,
 * safe landmark walking, arrival cues and numeric/save guards measured 657,085
 * B raw / 182,319 B gzip. The caps below give those features about 0.4% raw and
 * 1.4% gzip headroom. Structural regressions remain much larger: a second copy
 * of three, a new dependency or artwork entering the bundle all add 100 kB+.
 * The dist headroom absorbs the remaining in-flight edits (src/style.css) plus
 * another half-megabyte asset, yet it still fires on any 790 kB+ regression. It
 * sits 8,450,980 B below the 35,950,980 B that re-including the four preserved
 * PNGs (9,240,598 B) would produce, so that regression trips the deploy budget
 * on its own even without the .png rule.
 *
 * The gate reads whatever is in dist/ right now, so it must not be run while
 * another process is midway through `vite build`: a torn output fails closed
 * (e.g. "dist/play.html is missing"). CI runs it as ordered steps, so this only
 * matters for hand-run local builds.
 *
 * Re-baselining is a deliberate act: change the constant below and say in the
 * commit message which measured number moved and why.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // <repo>/scripts/check-budget.mjs -> <repo>/
const DIST = join(ROOT, 'dist');
const ASSETS = join(DIST, 'assets');
const ART = join(DIST, 'art');
const STANDALONE = join(DIST, 'play.html');

/**
 * Gzip level 9, fixed here so the number is reproducible and independent of any
 * reporter. Vite's own report uses slightly different zlib options: it printed
 * "616.65 kB | gzip: 167.61 kB" where this gate measures 167,182 B.
 */
const GZIP_LEVEL = 9;
/** node --test must never hang this gate forever. */
const TEST_TIMEOUT_MS = 300_000;

const BUDGET = Object.freeze({
  minTests: 115,
  jsRawBytes: 660_000,
  jsGzipBytes: 185_000,
  distBytes: 27_500_000,
  maxArtPng: 0,
});

// ---------------------------------------------------------------- reporting
const rows = [];
const failures = [];
const notes = [];

/** Record one measured value and whether it is inside budget. */
function record(name, measured, budgetText, ok, marginText, failureText) {
  rows.push({ name, measured, budgetText, ok, marginText });
  if (!ok) failures.push(failureText);
}

function fmtBytes(n) {
  return `${n.toLocaleString('en-US')} B`;
}

/** Margin left against a budget, in bytes and as a percentage of that budget. */
function fmtByteMargin(measured, budget) {
  const diff = budget - measured;
  return `${diff.toLocaleString('en-US')} B (${((diff / budget) * 100).toFixed(1)}% of budget)`;
}

// ------------------------------------------------------------- test runner
/**
 * Run `npm test` (the package.json script, the single source of truth for what
 * the runner executes) with stdout+stderr redirected straight to a temp file -
 * no pipes, so this works under confined sandboxes too. Returns the captured
 * text plus the process result.
 */
function runTestSuite() {
  const logPath = join(tmpdir(), `caravan-budget-${process.pid}.log`);
  const fd = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync('npm test', {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', fd, fd],
      timeout: TEST_TIMEOUT_MS,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  } finally {
    closeSync(fd);
  }
  let output = '';
  try {
    output = readFileSync(logPath, 'utf8');
  } catch {
    /* handled by the caller as a missing summary */
  }
  rmSync(logPath, { force: true });
  return { result, output };
}

/**
 * Parse the runner's own summary. Accepts both the default spec reporter
 * ("(i) tests 115") and the TAP reporter ("# tests 115"), taking the last
 * occurrence of each key. Also counts pass/fail marks as a fallback signal so a
 * purely cosmetic reporter change cannot be mistaken for "zero tests".
 */
function parseTestSummary(output) {
  const summary = {};
  let passMarks = 0;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '').trim();
    const match = /^(?:\u2139|#)?\s*(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)$/.exec(line);
    if (match) {
      summary[match[1]] = Number(match[2]);
      continue;
    }
    if (/^(?:\u2714|ok\s+\d+)/.test(line)) passMarks += 1;
  }
  return { summary, passMarks };
}

const testLog = [];
function collectTestRow() {
  console.log('running: npm test (count parsed from the runner summary, no hard-coded file list) ...');
  const { result, output } = runTestSuite();

  if (result.error) {
    record(
      'test count (npm test)',
      'did not run',
      `>= ${BUDGET.minTests} tests`,
      false,
      '',
      `test count (npm test): could not run the suite (${result.error.message})`,
    );
    return;
  }
  if (result.status !== 0) {
    const lines = output.split(/\r?\n/).filter((l) => l.trim());
    testLog.push(...lines.slice(-40));
    record(
      'test count (npm test)',
      `exit ${result.status}${result.signal ? ` (${result.signal})` : ''}`,
      `exit 0, >= ${BUDGET.minTests} tests`,
      false,
      '',
      `test count (npm test): the suite itself did not pass (exit ${result.status}${
        result.signal ? `, signal ${result.signal}` : ''
      })`,
    );
    return;
  }

  const { summary, passMarks } = parseTestSummary(output);
  let tests = summary.tests;
  let how = 'runner summary';
  if (tests === undefined && passMarks > 0) {
    tests = passMarks;
    how = 'pass-mark fallback (runner summary not recognised)';
    notes.push('The test runner printed no recognised summary line; the count came from pass marks.');
  }
  if (tests === undefined) {
    const lines = output.split(/\r?\n/).filter((l) => l.trim());
    testLog.push(...lines.slice(-40));
    record(
      'test count (npm test)',
      'unreadable',
      `>= ${BUDGET.minTests} tests`,
      false,
      '',
      'test count (npm test): no summary line and no pass marks were parseable - failing closed rather than assuming the suite ran',
    );
    return;
  }

  const failed = summary.fail ?? 0;
  const skipped = (summary.skipped ?? 0) + (summary.todo ?? 0);
  const ok = tests >= BUDGET.minTests && failed === 0;
  record(
    'test count (npm test)',
    `${tests} tests (${failed} failed, ${skipped} skipped) [${how}]`,
    `>= ${BUDGET.minTests} tests, 0 failed`,
    ok,
    tests - BUDGET.minTests >= 0 ? `${tests - BUDGET.minTests} tests above the floor` : '',
    failed > 0
      ? `test count (npm test): ${failed} test(s) failed`
      : `test count (npm test): only ${tests} tests ran, floor is ${BUDGET.minTests} - a test file was dropped or is no longer wired into the runner`,
  );
}

// ------------------------------------------------------------------ dist/io
function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
    else if (entry.isSymbolicLink()) {
      try {
        if (statSync(full).isFile()) out.push(full);
      } catch {
        /* dangling symlink: not deploy weight */
      }
    }
  }
  return out;
}

function collectBuildRows() {
  if (!existsSync(DIST)) {
    record(
      'dist/ build output',
      'missing',
      'present',
      false,
      '',
      `dist/ build output: ${DIST} does not exist - run \`npm run build\` before the budget gate`,
    );
    return;
  }

  // ---- 2. bundle budget -------------------------------------------------
  const jsFiles = existsSync(ASSETS) ? walkFiles(ASSETS).filter((f) => f.endsWith('.js')) : [];
  if (jsFiles.length === 0) {
    record(
      'bundle JS raw',
      'no dist/assets/*.js',
      `<= ${fmtBytes(BUDGET.jsRawBytes)}`,
      false,
      '',
      'bundle JS raw: no emitted JavaScript found under dist/assets - the bundle is missing or was renamed',
    );
  } else {
    let raw = 0;
    let gzip = 0;
    for (const file of jsFiles) {
      const bytes = readFileSync(file);
      raw += bytes.length;
      gzip += gzipSync(bytes, { level: GZIP_LEVEL }).length;
    }
    const rawOk = raw <= BUDGET.jsRawBytes;
    record(
      'bundle JS raw',
      `${fmtBytes(raw)} in ${jsFiles.length} file(s)`,
      `<= ${fmtBytes(BUDGET.jsRawBytes)}`,
      rawOk,
      fmtByteMargin(raw, BUDGET.jsRawBytes),
      `bundle JS raw: ${fmtBytes(raw)} exceeds the ${fmtBytes(BUDGET.jsRawBytes)} budget by ${(
        raw - BUDGET.jsRawBytes
      ).toLocaleString('en-US')} B`,
    );
    const gzipOk = gzip <= BUDGET.jsGzipBytes;
    record(
      `bundle JS gzip (level ${GZIP_LEVEL})`,
      fmtBytes(gzip),
      `<= ${fmtBytes(BUDGET.jsGzipBytes)}`,
      gzipOk,
      fmtByteMargin(gzip, BUDGET.jsGzipBytes),
      `bundle JS gzip: ${fmtBytes(gzip)} exceeds the ${fmtBytes(BUDGET.jsGzipBytes)} budget by ${(
        gzip - BUDGET.jsGzipBytes
      ).toLocaleString('en-US')} B`,
    );
  }

  // ---- 3. deploy weight + preserved-artwork exclusion -------------------
  const allFiles = walkFiles(DIST);
  let total = 0;
  for (const file of allFiles) total += statSync(file).size;
  const totalOk = total <= BUDGET.distBytes;
  record(
    'deploy weight dist/ total',
    `${fmtBytes(total)} in ${allFiles.length} file(s)`,
    `<= ${fmtBytes(BUDGET.distBytes)}`,
    totalOk,
    fmtByteMargin(total, BUDGET.distBytes),
    `deploy weight: dist/ is ${fmtBytes(total)}, over the ${fmtBytes(BUDGET.distBytes)} budget by ${(
      total - BUDGET.distBytes
    ).toLocaleString('en-US')} B`,
  );

  if (!existsSync(ART)) {
    record(
      'dist/art/*.png',
      'dist/art missing',
      `${BUDGET.maxArtPng} .png files`,
      false,
      '',
      'dist/art/*.png: dist/art does not exist, so artwork was not copied into the build output',
    );
  } else {
    const strayPng = walkFiles(ART).filter((f) => f.toLowerCase().endsWith('.png'));
    const pngOk = strayPng.length <= BUDGET.maxArtPng;
    const listed = strayPng.slice(0, 5).map((f) => f.slice(DIST.length + 1));
    record(
      'dist/art/*.png',
      `${strayPng.length} file(s)${listed.length ? `: ${listed.join(', ')}${strayPng.length > 5 ? ', ...' : ''}` : ''}`,
      `<= ${BUDGET.maxArtPng}`,
      pngOk,
      '',
      `dist/art/*.png: ${strayPng.length} .png file(s) reappeared under dist/art (${listed.join(
        ', ',
      )}${strayPng.length > 5 ? ', ...' : ''}) - the Phase 1 preserved-artwork exclusion in vite.config.ts regressed`,
    );
  }

  // ---- 4. standalone integrity ------------------------------------------
  if (!existsSync(STANDALONE)) {
    record(
      'standalone dist/play.html',
      'missing',
      'present, no raw /art/ refs',
      false,
      '',
      'standalone: dist/play.html is missing - the self-contained build broke (scripts/standalone.mjs)',
    );
  } else {
    const html = readFileSync(STANDALONE, 'utf8');
    // Report BYTES, not string length: the page contains multi-byte Persian
    // text, so html.length would understate the file by ~2.5 kB and disagree
    // with `ls -l` and with the deploy-weight row.
    const htmlBytes = Buffer.byteLength(html, 'utf8');
    // Strip embedded data URIs first: base64 text could otherwise contain the
    // five characters "/art/" by chance, and a match inside a base64 payload is
    // not a raw asset reference.
    const withoutDataUris = html.replace(/data:[^,;"'()\s]*;base64,[A-Za-z0-9+/=\s]*/g, '');
    const rawArtRefs = withoutDataUris.match(/\/art\//g) ?? [];
    const embedded = html.match(/data:image\//g) ?? [];
    const ok = rawArtRefs.length === 0 && htmlBytes > 0;
    record(
      'standalone dist/play.html',
      `${fmtBytes(htmlBytes)}, ${rawArtRefs.length} raw /art/ ref(s), ${embedded.length} embedded image(s)`,
      'present, 0 raw /art/ refs',
      ok,
      '',
      `standalone: dist/play.html still references raw artwork paths (${rawArtRefs.length} occurrence(s) of "/art/") - scripts/standalone.mjs failed to inline them`,
    );
  }
}

// ---------------------------------------------------------------------- main
console.log('Dream Caravan budget gate');
console.log(`root: ${ROOT}`);

collectTestRow();
collectBuildRows();

const nameWidth = Math.max(...rows.map((r) => r.name.length));
const measuredWidth = Math.max(...rows.map((r) => r.measured.length));
console.log('');
for (const row of rows) {
  console.log(
    `  [${row.ok ? 'ok  ' : 'FAIL'}] ${row.name.padEnd(nameWidth)}  ${row.measured.padEnd(measuredWidth)}  ${
      row.ok ? 'budget' : 'BUDGET'
    } ${row.budgetText}${row.marginText ? `   margin ${row.marginText}` : ''}`,
  );
}
for (const note of notes) console.log(`  note: ${note}`);

if (testLog.length) {
  console.log('\nlast lines from npm test:');
  for (const line of testLog) console.log(`  | ${line}`);
}

if (failures.length) {
  console.log('');
  console.error(`BUDGET GATE FAILED: ${failures.length} of ${rows.length} checks violated.`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    '\nIf the new value is intentional, re-measure it and update the matching constant in scripts/check-budget.mjs in the same commit.',
  );
  process.exitCode = 1;
} else {
  console.log(`\nPASS: all ${rows.length} budget checks met (test floor, bundle raw+gzip, deploy weight, standalone integrity).`);
}
