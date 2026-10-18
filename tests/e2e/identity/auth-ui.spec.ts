import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const localSupabase = /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(process.env.SUPABASE_URL ?? '');

test('mobile signup, workspace settings and login follow persisted Auth state', async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!localSupabase, 'This acceptance test writes only to the dedicated local Supabase project.');
  await page.setViewportSize({ width: 390, height: 844 });

  const suffix = randomUUID();
  const email = `ui-${suffix}@example.test`;
  const password = 'StrongPassword123!';
  const workspaceName = `UI Workspace ${suffix.slice(0, 8)}`;

  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Work email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('textbox', { name: 'Your name' }).fill('UI Test Owner');
  await page.getByRole('textbox', { name: 'Workspace name' }).fill(workspaceName);
  const signupResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/signup');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  const signupResponse = await signupResponsePromise;
  expect(signupResponse.status()).toBe(200);

  await page.waitForURL(/\/workspaces\/[0-9a-f-]+\/settings$/, { timeout: 30_000 });
  const browserSession = await page.evaluate(async () => {
    const response = await fetch('/api/v1/session');
    const payload = await response.json() as { data?: { workspaces?: unknown[] }; error?: { code?: string } };
    return { status: response.status, workspaceCount: payload.data?.workspaces?.length ?? null, errorCode: payload.error?.code ?? null };
  });
  expect(browserSession).toEqual({ status: 200, workspaceCount: 1, errorCode: null });
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  const nameField = page.getByRole('textbox', { name: 'Workspace name' });
  await expect(nameField).toHaveValue(workspaceName);
  await nameField.fill(`${workspaceName} Updated`);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Workspace settings saved.' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Work email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]+\/settings$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Workspace name' })).toHaveValue(`${workspaceName} Updated`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
