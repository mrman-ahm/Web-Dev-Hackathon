import { ContactDtoSchema, IdSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { assertSameOrigin, readJson } from '@/lib/http/request';
import { getAppOrigin } from '@/lib/env/server';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { archiveContact, getContact, updateContact } from '@/modules/crm/service';

type RouteContext = { params: Promise<{ workspaceId: string; contactId: string }> };

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { workspaceId: rawWorkspaceId, contactId: rawContactId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(ContactDtoSchema.parse(await getContact(client, parseId(rawWorkspaceId), parseId(rawContactId))), requestId);
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId, contactId: rawContactId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await updateContact(client, parseId(rawWorkspaceId), parseId(rawContactId), await readJson(request)), requestId);
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    assertSameOrigin(request, getAppOrigin());
    const { workspaceId: rawWorkspaceId, contactId: rawContactId } = await context.params;
    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    return successResponse(await archiveContact(client, parseId(rawWorkspaceId), parseId(rawContactId), await readJson(request)), requestId);
  });
}
