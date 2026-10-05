import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
export default defineConfig({testDir:'./tests',timeout:90000,workers:1,webServer:{command:'npm run preview -- --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:!process.env.CI,timeout:30000},use:{baseURL:'http://127.0.0.1:4174',launchOptions:{executablePath,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}});
