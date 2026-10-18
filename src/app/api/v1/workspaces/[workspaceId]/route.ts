import { IdSchema, UpdateWorkspaceInputSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { getAppOrigin } from '@/lib/env/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { getWorkspace, updateWorkspace } from '@/modules/workspaces/service';

type WorkspaceRouteContext = { params: Promise<{ workspaceId: string }> };

function parseWorkspaceId(value: string): string {
  const result = IdSchema.safeParse(value);
  if (!result.success) throw new DomainError('VALIDATION_FAILED');
  return result.data;
}

export async function GET(_request: Request, context: WorkspaceRouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = parseWorkspaceId(rawWorkspaceId);
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await getWorkspace(client, workspaceId), requestId);
  });
}

export async function PATCH(request: Request, context: WorkspaceRouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = parseWorkspaceId(rawWorkspaceId);
    const input = UpdateWorkspaceInputSchema.safeParse(await readJson(request));
    if (!input.success) throw new DomainError('VALIDATION_FAILED');

    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await updateWorkspace(client, workspaceId, input.data), requestId);
  });
}
