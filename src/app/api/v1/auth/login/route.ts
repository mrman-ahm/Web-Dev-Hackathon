import { LoginInputSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signInWithPassword } from '@/modules/identity/service';

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const result = LoginInputSchema.safeParse(await readJson(request));
    if (!result.success) throw new DomainError('VALIDATION_FAILED');

    const client = await createSupabaseServerClient();
    return successResponse(await signInWithPassword(client, result.data), requestId);
  });
}
