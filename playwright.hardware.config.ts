import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

// Explicit local hardware-backed validation; does not replace software-renderer
// coverage or silently change the default/CI rendering environment.
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    launchOptions: { channel: 'chrome', headless: false },
  },
});
