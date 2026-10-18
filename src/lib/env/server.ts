import { DomainError } from '../errors';

export type SupabaseServerConfig = { url: string; anonKey: string };

export function getAppOrigin(): string {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new DomainError('INTERNAL_ERROR');

  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== value || (!localHttp && url.protocol !== 'https:')) throw new Error('invalid origin');
    return url.origin;
  } catch {
    throw new DomainError('INTERNAL_ERROR');
  }
}

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const value = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!value || !anonKey) throw new DomainError('INTERNAL_ERROR');

  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.pathname !== '/' || url.search || url.hash || (!localHttp && url.protocol !== 'https:')) {
      throw new Error('invalid Supabase URL');
    }
    return { url: url.origin, anonKey };
  } catch {
    throw new DomainError('INTERNAL_ERROR');
  }
}
