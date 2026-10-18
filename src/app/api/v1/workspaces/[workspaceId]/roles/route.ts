import { IdSchema } from '@/contracts/common';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { CreateRoleSchema } from '@/modules/permissions/schemas';
import { createPermissionRole, getPermissionConfiguration } from '@/modules/permissions/service';

type RouteContext = { params: Promise<{ workspaceId: string }> };

function parseWorkspaceId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const workspaceId = parseWorkspaceId((await context.params).workspaceId);
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await getPermissionConfiguration(client, workspaceId), requestId);
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const workspaceId = parseWorkspaceId((await context.params).workspaceId);
    const input = CreateRoleSchema.safeParse(await readJson(request));
    if (!input.success) throw new DomainError('VALIDATION_FAILED');
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await createPermissionRole(client, workspaceId, input.data), requestId, 201);
  });
}
