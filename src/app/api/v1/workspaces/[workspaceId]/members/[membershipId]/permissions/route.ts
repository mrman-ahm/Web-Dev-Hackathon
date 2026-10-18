import { IdSchema } from '@/contracts/common';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { ReplaceOverridesSchema } from '@/modules/permissions/schemas';
import { replaceMemberOverrides } from '@/modules/permissions/service';

type RouteContext = { params: Promise<{ workspaceId: string; membershipId: string }> };

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const params = await context.params;
    const workspaceId = parseId(params.workspaceId);
    const membershipId = parseId(params.membershipId);
    const input = ReplaceOverridesSchema.safeParse(await readJson(request));
    if (!input.success) throw new DomainError('VALIDATION_FAILED');
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    const result = await replaceMemberOverrides(client, workspaceId, membershipId, input.data.expectedVersion, input.data.overrides);
    return successResponse(result, requestId);
  });
}
