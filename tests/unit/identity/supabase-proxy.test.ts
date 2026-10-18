// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  clientOptions: null as unknown,
  getClaims: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: unknown) => {
    state.clientOptions = options;
    return { auth: { getClaims: (...args: unknown[]) => state.getClaims(...args) } };
  },
}));
vi.mock('@/lib/env/server', () => ({
  getSupabaseServerConfig: () => ({ url: 'http://127.0.0.1:54321', anonKey: 'test-anon-key' }),
}));

import { NextRequest } from 'next/server';
import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js';
import { refreshSupabaseSession } from '@/lib/supabase/proxy';

type CookieWrite = { name: string; value: string; options?: Record<string, unknown> };
type ClientOptions = {
  cookies: {
    setAll(cookies: CookieWrite[], headers?: Record<string, string>): void;
  };
};

function setCookies(cookies: CookieWrite[], headers?: Record<string, string>): void {
  if (!state.clientOptions) throw new Error('Supabase proxy client was not initialized.');
  (state.clientOptions as ClientOptions).cookies.setAll(cookies, headers);
}

describe('Supabase session proxy', () => {
  beforeEach(() => {
    state.clientOptions = null;
    state.getClaims.mockReset();
  });

  it('forwards rotated cookies to the server render and browser response', async () => {
    state.getClaims.mockImplementation(async () => {
      setCookies(
        [{ name: 'sb-session', value: 'rotated-token', options: { path: '/', httpOnly: true } }],
        { 'x-auth-refresh': 'completed' },
      );
      return { data: { claims: { sub: 'user-id' } }, error: null };
    });
    const request = new NextRequest('http://localhost/workspaces/workspace-id/settings', {
      headers: { cookie: 'sb-session=old-token' },
    });

    const response = await refreshSupabaseSession(request);

    expect(request.cookies.get('sb-session')?.value).toBe('rotated-token');
    expect(response.cookies.get('sb-session')?.value).toBe('rotated-token');
    expect(response.headers.get('x-auth-refresh')).toBe('completed');
  });

  it('lets an unauthenticated request continue without inventing cookies', async () => {
    state.getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() });
    const request = new NextRequest('http://localhost/workspace');

    const response = await refreshSupabaseSession(request);

    expect(response.cookies.getAll()).toEqual([]);
  });

  it('propagates returned Supabase Auth provider failures', async () => {
    state.getClaims.mockResolvedValue({
      data: null,
      error: new AuthApiError('Auth provider unavailable', 503, 'unexpected_failure'),
    });
    const request = new NextRequest('http://localhost/workspace');

    await expect(refreshSupabaseSession(request)).rejects.toThrow('Auth provider unavailable');
  });

  it('does not treat an unrelated error with the missing-session message as unauthenticated', async () => {
    state.getClaims.mockResolvedValue({ data: null, error: new Error('Auth session missing!') });
    const request = new NextRequest('http://localhost/workspace');

    await expect(refreshSupabaseSession(request)).rejects.toThrow('Auth session missing!');
  });

  it('propagates refresh failures instead of serving the stale request', async () => {
    state.getClaims.mockRejectedValue(new Error('Auth transport unavailable'));
    const request = new NextRequest('http://localhost/workspace', {
      headers: { cookie: 'sb-session=stale-token' },
    });

    await expect(refreshSupabaseSession(request)).rejects.toThrow('Auth transport unavailable');
  });

  it('propagates cookie serialization failures instead of returning a partial refresh', async () => {
    state.getClaims.mockImplementation(async () => {
      setCookies([{ name: 'invalid cookie name', value: 'rotated-token' }]);
      return { data: { claims: null }, error: null };
    });
    const request = new NextRequest('http://localhost/workspace');

    await expect(refreshSupabaseSession(request)).rejects.toThrow();
  });
});
