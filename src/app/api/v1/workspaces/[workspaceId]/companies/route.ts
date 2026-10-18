import { CompanyDtoSchema, IdSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { getAppOrigin } from '@/lib/env/server';
import { listResponse, newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { createCompany, listCompanies, parseCrmListQuery } from '@/modules/crm/service';

type RouteContext = { params: Promise<{ workspaceId: string }> };

function workspaceId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const id = workspaceId(rawWorkspaceId);
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    const page = await listCompanies(client, id, parseCrmListQuery(new URL(request.url).searchParams));
    return listResponse(CompanyDtoSchema, page.data, page.nextCursor, requestId);
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId } = await context.params;
    const id = workspaceId(rawWorkspaceId);
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await createCompany(client, id, await readJson(request)), requestId, 201);
  });
}
