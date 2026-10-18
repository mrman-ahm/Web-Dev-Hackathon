import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseServerConfig } from '../env/server';

type SupabaseServerClientOptions = { tolerateReadOnlyCookieWriteErrors?: boolean };

const readOnlyCookieWriteMessage = 'Cookies can only be modified in a Server Action or Route Handler.';

function isReadOnlyCookieWriteError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(readOnlyCookieWriteMessage);
}

/** A fresh, user-scoped SSR client for each request. Never use a service-role key here. */
export async function createSupabaseServerClient(
  { tolerateReadOnlyCookieWriteErrors = false }: SupabaseServerClientOptions = {},
) {
  const { url, anonKey } = getSupabaseServerConfig();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  return createServerClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    cookieOptions: { path: '/', sameSite: 'lax', secure, httpOnly: true },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { path: '/', sameSite: 'lax', ...options, secure, httpOnly: true });
          }
        } catch (error) {
          if (!tolerateReadOnlyCookieWriteErrors || !isReadOnlyCookieWriteError(error)) throw error;
        }
      },
    },
  });
}
