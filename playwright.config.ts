import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
 retries: process.env.CI ? 2 : 0, reporter: 'list',
 use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
 projects: [{name:'desktop',use:{...devices['Desktop Chrome']}},
 {name:'tablet',use:{...devices['iPad Mini']}}, {name:'mobile',use:{...devices['iPhone 13']}}],
 webServer: {command:'npm run dev -- --hostname 127.0.0.1', url:'http://localhost:3000', reuseExistingServer: !process.env.CI},
});
