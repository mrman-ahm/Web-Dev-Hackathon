import { IdSchema } from '@/contracts/common';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { UpdateRoleSchema } from '@/modules/permissions/schemas';
import { updatePermissionRole } from '@/modules/permissions/service';

type RouteContext = { params: Promise<{ workspaceId: string; roleId: string }> };

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const params = await context.params;
    const workspaceId = parseId(params.workspaceId);
    const roleId = parseId(params.roleId);
    const input = UpdateRoleSchema.safeParse(await readJson(request));
    if (!input.success) throw new DomainError('VALIDATION_FAILED');
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await updatePermissionRole(client, workspaceId, roleId, input.data), requestId);
  });
}
