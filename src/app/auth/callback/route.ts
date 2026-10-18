import { DomainError } from '@/lib/errors';
import { errorResponse, newRequestId } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';

function redirectToApp(origin: string, status: 'confirmed' | 'confirmation-failed'): Response {
  const target = new URL(status === 'confirmed' ? '/workspace' : '/login', origin);
  if (status === 'confirmation-failed') target.searchParams.set('auth', status);
  return new Response(null, {
    status: 303,
    headers: { location: target.toString(), 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = newRequestId();
  let appOrigin: string;
  try {
    appOrigin = getAppOrigin();
  } catch (error) {
    return errorResponse(error, requestId);
  }

  const code = new URL(request.url).searchParams.get('code');
  if (!code || code.length > 4096) return redirectToApp(appOrigin, 'confirmation-failed');

  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new DomainError('UNAUTHENTICATED');
    await getAuthSession(client);
    return redirectToApp(appOrigin, 'confirmed');
  } catch {
    return redirectToApp(appOrigin, 'confirmation-failed');
  }
}
