import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { IdSchema } from '@/contracts/common';
import type { WorkspaceDto } from '@/contracts/api';
import { DomainError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/modules/identity/service';
import { getWorkspace } from '@/modules/workspaces/service';
import { SignOutButton } from '@/components/sign-out-button';
import { PermissionsSettings } from './permissions-settings';

export const metadata: Metadata = { title: 'Permissions · Unified Business Management', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PermissionsSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId: rawWorkspaceId } = await params;
  const id = IdSchema.safeParse(rawWorkspaceId);
  if (!id.success) notFound();
  const client = await createSupabaseServerClient();
  let workspace: WorkspaceDto;
  let user;
  try {
    const session = await getAuthSession(client);
    user = session.user;
    workspace = await getWorkspace(client, id.data);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') redirect('/login');
    if (error instanceof DomainError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')) notFound();
    throw error;
  }
  return <div className="ub-workspace-shell">
    <a href="#permissions-content" className="ub-skip">Skip to permissions</a>
    <header className="ub-workspace-header">
      <div><p className="ub-eyebrow">Unified Business Management</p><p className="ub-workspace-name">{workspace.name}</p></div>
      <div className="ub-row"><span>{user.displayName}</span><SignOutButton /></div>
    </header>
    <PermissionsSettings workspace={workspace} />
  </div>;
}
