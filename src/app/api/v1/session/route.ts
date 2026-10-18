import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';

export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const client = await createSupabaseServerClient();
    return successResponse(await getAuthSession(client), requestId);
  });
}
