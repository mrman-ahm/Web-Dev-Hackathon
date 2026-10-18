import { SignupInputSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signUpWithPassword } from '@/modules/identity/service';

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const appOrigin = getAppOrigin();
    assertSameOrigin(request, appOrigin);
    const result = SignupInputSchema.safeParse(await readJson(request));
    if (!result.success) throw new DomainError('VALIDATION_FAILED');

    const client = await createSupabaseServerClient();
    const data = await signUpWithPassword(client, result.data, appOrigin);
    return successResponse(data, requestId);
  });
}
