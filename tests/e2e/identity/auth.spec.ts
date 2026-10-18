import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const localSupabase = /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(process.env.SUPABASE_URL ?? '');

test('signup, workspace persistence, stale-write rejection and logout use the active cookie session', async ({ request }) => {
  test.skip(!localSupabase, 'This acceptance test writes only to the dedicated local Supabase project.');

  const crossOrigin = await request.post('/api/v1/auth/login', {
    headers: { origin: 'https://attacker.example' },
    data: { email: 'nobody@example.test', password: 'NotARealPassword123!' },
  });
  expect(crossOrigin.status()).toBe(403);

  const suffix = randomUUID();
  const signup = await request.post('/api/v1/auth/signup', {
    headers: { origin: appOrigin },
    data: {
      email: `http-${suffix}@example.test`,
      password: 'StrongPassword123!',
      displayName: 'HTTP Test Owner',
      workspaceName: `HTTP Test Workspace ${suffix.slice(0, 8)}`,
      timezone: 'Asia/Karachi',
      defaultCurrency: 'PKR',
    },
  });
  expect(signup.status()).toBe(200);
  expect(signup.headers()['cache-control']).toContain('private, no-store');
  const signupBody = await signup.json();
  expect(signupBody.meta.requestId).toBeTruthy();
  expect(signupBody.data.requiresEmailConfirmation).toBe(false);
  const session = signupBody.data.session;
  expect(session.user.email).toBe(`http-${suffix}@example.test`);
  expect(session.workspaces).toHaveLength(1);

  const signupLogout = await request.post('/api/v1/auth/logout', {
    headers: { origin: appOrigin }, data: { scope: 'local' },
  });
  expect(signupLogout.status()).toBe(200);
  expect((await request.get('/api/v1/session')).status()).toBe(401);

  const login = await request.post('/api/v1/auth/login', {
    headers: { origin: appOrigin },
    data: { email: `http-${suffix}@example.test`, password: 'StrongPassword123!' },
  });
  expect(login.status()).toBe(200);
  const loginSession = (await login.json()).data;
  expect(loginSession.user.id).toBe(session.user.id);
  const workspace = loginSession.workspaces[0];

  const sessionResponse = await request.get('/api/v1/session');
  expect(sessionResponse.status()).toBe(200);
  expect((await sessionResponse.json()).data.user.id).toBe(session.user.id);

  const workspaceResponse = await request.get(`/api/v1/workspaces/${workspace.id}`);
  expect(workspaceResponse.status()).toBe(200);
  expect((await workspaceResponse.json()).data).toMatchObject({ id: workspace.id, version: workspace.version });

  const update = {
    expectedVersion: workspace.version,
    name: `${workspace.name} Updated`,
    timezone: workspace.timezone,
    defaultCurrency: workspace.defaultCurrency,
  };
  const updatedResponse = await request.patch(`/api/v1/workspaces/${workspace.id}`, {
    headers: { origin: appOrigin }, data: update,
  });
  expect(updatedResponse.status()).toBe(200);
  expect((await updatedResponse.json()).data.version).toBe(workspace.version + 1);

  const staleResponse = await request.patch(`/api/v1/workspaces/${workspace.id}`, {
    headers: { origin: appOrigin }, data: update,
  });
  expect(staleResponse.status()).toBe(409);
  expect((await staleResponse.json()).error.code).toBe('STALE_VERSION');

  const otherWorkspace = await request.get('/api/v1/workspaces/33333333-3333-4333-8333-333333333333');
  expect(otherWorkspace.status()).toBe(403);

  const logout = await request.post('/api/v1/auth/logout', {
    headers: { origin: appOrigin }, data: { scope: 'local' },
  });
  expect(logout.status()).toBe(200);
  expect((await logout.json()).data).toEqual({ signedOut: true });

  const revokedSession = await request.get('/api/v1/session');
  expect(revokedSession.status()).toBe(401);
  expect((await revokedSession.json()).error.code).toBe('UNAUTHENTICATED');
});

test('email callback never redirects to a caller-supplied external target', async ({ request }) => {
  const response = await request.get('/auth/callback?code=invalid&next=https%3A%2F%2Fattacker.example', {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(`${appOrigin}/login?auth=confirmation-failed`);
  expect(response.headers()['cache-control']).toContain('private, no-store');
});
