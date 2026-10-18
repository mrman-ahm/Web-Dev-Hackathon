import { CompanyDtoSchema, IdSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { getAppOrigin } from '@/lib/env/server';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { archiveCompany, getCompany, updateCompany } from '@/modules/crm/service';

type RouteContext = { params: Promise<{ workspaceId: string; companyId: string }> };

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { workspaceId: rawWorkspaceId, companyId: rawCompanyId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(CompanyDtoSchema.parse(await getCompany(client, parseId(rawWorkspaceId), parseId(rawCompanyId))), requestId);
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId, companyId: rawCompanyId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await updateCompany(client, parseId(rawWorkspaceId), parseId(rawCompanyId), await readJson(request)), requestId);
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId, companyId: rawCompanyId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await archiveCompany(client, parseId(rawWorkspaceId), parseId(rawCompanyId), await readJson(request)), requestId);
  });
}
