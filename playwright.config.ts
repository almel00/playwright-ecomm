import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

loadDotEnv(resolveEnvFile());
const reportInfo = createReportInfo();

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(reportInfo.reportDir, 'html'), open: 'never' }],
  ],
  use: {
    baseURL: requiredEnv('BASE_URL'),
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    viewport: null,
    launchOptions: {
      args: ['--start-maximized', '--window-size=1920,1080', '--window-position=0,0'],
    },
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: path.join(reportInfo.reportDir, 'artifacts'),
});

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function resolveEnvFile() {
  const envFile = process.env.ENV_FILE || '.env';
  if (path.isAbsolute(envFile)) {
    return envFile;
  }

  return path.resolve(__dirname, envFile);
}

function createReportInfo() {
  const baseUrl = requiredEnv('BASE_URL');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const date = timestamp.slice(0, 10);
  const siteName = process.env.SITE_NAME || new URL(baseUrl).hostname;
  const siteSlug = slugify(siteName);
  const runId = process.env.REPORT_RUN_ID || `${date}-${timestamp.slice(11, 19)}-${Math.random().toString(36).slice(2, 8)}`;
  const reportDir = path.resolve(__dirname, 'test-results', 'reports', siteSlug, date, runId);

  process.env.REPORT_SITE_NAME = siteName;
  process.env.REPORT_SITE_SLUG = siteSlug;
  process.env.REPORT_DATE = date;
  process.env.REPORT_RUN_ID = runId;
  process.env.REPORT_DIR = reportDir;

  return { siteName, siteSlug, date, runId, reportDir };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-site';
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
