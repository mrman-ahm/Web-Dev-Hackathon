// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cookieStore: { getAll: vi.fn(() => []), set: vi.fn() },
  clientOptions: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => state.cookieStore }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: unknown) => {
    state.clientOptions = options;
    return {};
  },
}));
vi.mock('@/lib/env/server', () => ({
  getSupabaseServerConfig: () => ({ url: 'http://127.0.0.1:54321', anonKey: 'test-anon-key' }),
}));

import { createSupabaseServerClient } from '@/lib/supabase/server';

type CookieWrite = { name: string; value: string; options?: Record<string, unknown> };
type ClientOptions = { cookies: { setAll(cookies: CookieWrite[]): void } };

function getSetAll(): (cookies: CookieWrite[]) => void {
  if (!state.clientOptions) throw new Error('Supabase server client was not initialized.');
  return (state.clientOptions as ClientOptions).cookies.setAll;
}

const nextReadonlyCookieError = () => new Error(
  'Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options',
);

describe('Supabase server cookie writes', () => {
  beforeEach(() => {
    state.clientOptions = null;
    state.cookieStore.set.mockReset();
  });

  it('tolerates Next read-only cookie writes only when a Server Component opts in', async () => {
    state.cookieStore.set.mockImplementation(() => { throw nextReadonlyCookieError(); });
    await createSupabaseServerClient({ tolerateReadOnlyCookieWriteErrors: true });

    expect(() => getSetAll()([{ name: 'sb-session', value: 'refreshed', options: { path: '/' } }])).not.toThrow();
  });

  it('surfaces read-only cookie write failures for the default Route Handler caller', async () => {
    state.cookieStore.set.mockImplementation(() => { throw nextReadonlyCookieError(); });
    await createSupabaseServerClient();

    expect(() => getSetAll()([{ name: 'sb-session', value: 'refreshed', options: { path: '/' } }]))
      .toThrow('Cookies can only be modified in a Server Action or Route Handler.');
  });

  it('rethrows unexpected cookie write failures even when read-only tolerance is enabled', async () => {
    state.cookieStore.set.mockImplementation(() => { throw new Error('cookie store unavailable'); });
    await createSupabaseServerClient({ tolerateReadOnlyCookieWriteErrors: true });

    expect(() => getSetAll()([{ name: 'sb-session', value: 'refreshed', options: { path: '/' } }]))
      .toThrow('cookie store unavailable');
  });
});
