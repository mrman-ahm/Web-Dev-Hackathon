import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { IdSchema } from '@/contracts/common';
import { CrmRecords } from '@/components/crm-records';
import { DomainError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';
import { getCurrentPermissions } from '@/modules/permissions/authorization';
import { listCompanies, listContacts } from '@/modules/crm/service';
import { getWorkspace } from '@/modules/workspaces/service';

export const metadata: Metadata = { title: 'CRM records · Unified Business Management', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

async function loadCrmPage(workspaceId: string) {
  const client = await createSupabaseServerClient({ tolerateReadOnlyCookieWriteErrors: true });
  try {
    const session = await getAuthSession(client);
    const workspace = await getWorkspace(client, workspaceId);
    const permissions = await getCurrentPermissions(client, workspaceId);
    const [companies, contacts] = await Promise.all([
      permissions.has('crm.companies.view')
        ? listCompanies(client, workspaceId, { limit: 50 })
        : Promise.resolve({ data: [], nextCursor: null }),
      permissions.has('crm.contacts.view')
        ? listContacts(client, workspaceId, { limit: 50 })
        : Promise.resolve({ data: [], nextCursor: null }),
    ]);
    return {
      user: session.user,
      workspace,
      permissions: [...permissions],
      initialCompanies: companies.data,
      initialCompanyCursor: companies.nextCursor,
      initialContacts: contacts.data,
      initialContactCursor: contacts.nextCursor,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') redirect('/login');
    if (error instanceof DomainError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')) notFound();
    throw error;
  }
}

export default async function WorkspaceCrmPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await params;
  const parsedId = IdSchema.safeParse(rawWorkspaceId);
  if (!parsedId.success) notFound();
  const props = await loadCrmPage(parsedId.data);
  return <CrmRecords {...props} />;
}
