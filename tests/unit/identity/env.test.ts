// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppOrigin } from '@/lib/env/server';

afterEach(() => vi.unstubAllEnvs());

describe('server runtime configuration', () => {
  it('accepts the exact local app origin without requiring Supabase values', () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    expect(getAppOrigin()).toBe('http://localhost:3000');
  });

  it('rejects a path-bearing or insecure remote app origin', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example/path');
    expect(() => getAppOrigin()).toThrowError(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    vi.stubEnv('APP_ORIGIN', 'http://app.example');
    expect(() => getAppOrigin()).toThrowError(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });
});
