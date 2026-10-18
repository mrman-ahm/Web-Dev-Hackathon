import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { IdSchema } from '@/contracts/common';
import { WorkspaceSettings } from '@/components/workspace-settings';
import { DomainError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';
import { getWorkspace } from '@/modules/workspaces/service';

export const metadata: Metadata = { title: 'Workspace settings · Unified Business Management', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const parsedId = IdSchema.safeParse(workspaceId);
  if (!parsedId.success) notFound();

  const client = await createSupabaseServerClient();
  let user;
  let workspace;
  try {
    const session = await getAuthSession(client);
    user = session.user;
    workspace = await getWorkspace(client, parsedId.data);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') redirect('/login');
    if (error instanceof DomainError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')) notFound();
    throw error;
  }
  return <WorkspaceSettings user={user} workspace={workspace} />;
}
