import { AuditDtoSchema, IdSchema } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { listResponse, newRequestId, withApiErrors } from '@/lib/http/response';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireActiveUser } from '@/modules/identity/service';
import { listAuditEntries, parseAuditQuery } from '@/modules/audit/service';

type AuditRouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: AuditRouteContext): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = IdSchema.safeParse(rawWorkspaceId);
    if (!workspaceId.success) throw new DomainError('VALIDATION_FAILED');

    const client = await createSupabaseServerClient();
    await requireActiveUser(client);
    const query = parseAuditQuery(new URL(request.url).searchParams);
    const page = await listAuditEntries(client, workspaceId.data, query);
    return listResponse(AuditDtoSchema, page.data, page.nextCursor, requestId);
  });
}
