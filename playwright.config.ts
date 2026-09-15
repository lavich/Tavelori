import {defineConfig} from '@playwright/test';
/** Браузерные проверки идут по production build, как и реальное использование. */
export default defineConfig({
 testDir:'tests/e2e',
 timeout:60000,
 fullyParallel:false,
 workers:1,
 use:{baseURL:'http://localhost:4173',browserName:'chromium',viewport:{width:390,height:844},deviceScaleFactor:2},
 webServer:{command:'npm run build && npx vite preview --port 4173',url:'http://localhost:4173',reuseExistingServer:true,timeout:120000},
});
