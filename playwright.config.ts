import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7777'
const e2eDataDir = fileURLToPath(new URL('./.e2e-data', import.meta.url))

const webServer = process.env.E2E_BASE_URL
  ? undefined
  : {
      command: 'bun run dev',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATA_DIR: e2eDataDir,
      },
    }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  ...(webServer ? { webServer } : {}),
})
