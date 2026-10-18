import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const localSupabase = (() => {
  try {
    const url = new URL(process.env.SUPABASE_URL ?? '');
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
      && Boolean(url.port) && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
})();

function decodeSessionCookie(value: string): Record<string, unknown> {
  const json = value.startsWith('base64-')
    ? Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(value);
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Unexpected Supabase session cookie.');
  return parsed as Record<string, unknown>;
}

function encodeSessionCookie(session: Record<string, unknown>): string {
  return `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
}

function authSessionCookie(cookies: Array<{ name: string; value: string }>) {
  const candidate = cookies.find((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
  if (!candidate) return undefined;
  const name = candidate.name.replace(/\.\d+$/, '');
  const parts = cookies
    .filter((cookie) => cookie.name === name || /^\d+$/.test(cookie.name.slice(name.length + 1)) && cookie.name.startsWith(`${name}.`))
    .sort((left, right) => {
      const leftIndex = left.name === name ? -1 : Number(left.name.slice(name.length + 1));
      const rightIndex = right.name === name ? -1 : Number(right.name.slice(name.length + 1));
      return leftIndex - rightIndex;
    });
  return { name, value: parts.map((part) => part.value).join('') };
}

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
  const cookies = await page.context().cookies();
  const authCookie = authSessionCookie(cookies);
  expect(authCookie).toBeDefined();
  if (!authCookie) throw new Error('Auth session cookie was not set.');
  const expiredSession = decodeSessionCookie(authCookie.value);
  const originalRefreshToken = expiredSession.refresh_token;
  expect(typeof originalRefreshToken).toBe('string');
  expiredSession.expires_at = Math.floor(Date.now() / 1000) - 60;
  expiredSession.expires_in = 0;
  const cookieTemplate = cookies.find((cookie) => cookie.name === authCookie.name || cookie.name.startsWith(`${authCookie.name}.`));
  if (!cookieTemplate) throw new Error('Auth session cookie attributes were not found.');
  const context = page.context();
  for (const cookie of cookies.filter((item) => item.name === authCookie.name || item.name.startsWith(`${authCookie.name}.`))) {
    await context.clearCookies({ name: cookie.name });
  }
  const encodedSession = encodeSessionCookie(expiredSession);
  const cookieParts = encodedSession.match(/.{1,3180}/g) ?? [''];
  for (const [index, value] of cookieParts.entries()) {
    await context.addCookies([{
      name: cookieParts.length === 1 ? authCookie.name : `${authCookie.name}.${index}`,
      value,
      url: new URL(page.url()).origin,
      httpOnly: cookieTemplate.httpOnly,
      secure: cookieTemplate.secure,
      sameSite: cookieTemplate.sameSite,
      ...(cookieTemplate.expires > 0 ? { expires: cookieTemplate.expires } : {}),
    }]);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible({ timeout: 30_000 });
  const refreshedCookie = authSessionCookie(await context.cookies());
  expect(refreshedCookie).toBeDefined();
  if (!refreshedCookie) throw new Error('Refreshed Auth session cookie was not set.');
  const refreshedSession = decodeSessionCookie(refreshedCookie.value);
  expect(refreshedSession.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  expect(refreshedSession.refresh_token).not.toBe(originalRefreshToken);

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
