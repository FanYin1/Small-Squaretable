import { defineConfig, devices } from '@playwright/test';

const target = process.env.STORY_TEST_BASE_URL;
if (target && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(target)) {
  throw new Error('Story browser checks require a loopback HTTP target');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: ['story-entry.spec.ts', 'story-discovery.spec.ts', 'story-library.spec.ts', 'frontend-redesign.spec.ts'],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: target || 'http://127.0.0.1:5186',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: target ? undefined : {
    command: 'npm run build:client && npx vite preview --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
