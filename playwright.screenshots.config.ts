import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
/** Скриншоты для README: те же production build и мобильный экран, что у e2e, но отдельный прогон вне CI. */
export default defineConfig({
  ...base,
  testDir: "scripts/screenshots",
});
