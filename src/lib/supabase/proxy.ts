import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerConfig } from '../env/server';

/** Refresh an expiring cookie session before a Server Component reads it. */
export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = getSupabaseServerConfig();
  const secure = process.env.NODE_ENV === 'production';
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    cookieOptions: { path: '/', sameSite: 'lax', secure, httpOnly: true },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { path: '/', sameSite: 'lax', ...options, secure, httpOnly: true });
        }
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const { error } = await supabase.auth.getClaims();
  if (error && !isAuthSessionMissingError(error)) throw error;
  return response;
}
