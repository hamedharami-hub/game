import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const port = Number(process.env.PLAYWRIGHT_PORT || 4175);
const baseURL = `http://127.0.0.1:${port}`;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  // `*.test.ts` are node:test suites owned by `npm test`; keep Playwright's collection to its own specs.
  // `_*.spec.ts` are throwaway diagnostic probes (see the tsconfig exclude): they must never join a full run.
  testIgnore: ['**/*.test.ts', '**/_*.spec.ts'],
  timeout: 90_000,
  workers: 1,
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 30_000,
  },
  use: {
    baseURL,
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
});
