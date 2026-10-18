import { redirect } from 'next/navigation';
import { WorkspacePicker } from '@/components/workspace-picker';
import { DomainError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const client = await createSupabaseServerClient({ tolerateReadOnlyCookieWriteErrors: true });
  let session;
  try {
    session = await getAuthSession(client);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }

  const [onlyWorkspace] = session.workspaces;
  if (session.workspaces.length === 1 && onlyWorkspace) redirect(`/workspaces/${onlyWorkspace.id}/settings`);
  return <WorkspacePicker session={session} />;
}
