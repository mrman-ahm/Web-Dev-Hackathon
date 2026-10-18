'use client';

import Link from 'next/link';
import type { AuthSessionDto } from '@/contracts/auth';
import { SignOutButton } from './sign-out-button';

export function WorkspacePicker({ session }: { session: AuthSessionDto }) {
  return <div className="ub-workspace-shell">
    <a href="#workspace-main" className="ub-skip">Skip to workspaces</a>
    <header className="ub-workspace-header">
      <div><p className="ub-eyebrow">Unified Business Management</p><p className="ub-workspace-name">Choose a workspace</p></div>
      <div className="ub-row"><span>{session.user.displayName}</span><SignOutButton /></div>
    </header>
    <main id="workspace-main" className="ub-workspace-main" tabIndex={-1}>
      <div className="ub-page">
        <div className="ub-stack">
          <p className="ub-eyebrow">Your account</p>
          <h1>Select a workspace</h1>
          <p className="ub-muted">Choose the workspace you want to open.</p>
        </div>
        {session.workspaces.length ? <ul className="ub-workspace-list" aria-label="Available workspaces">
          {session.workspaces.map((workspace) => <li key={workspace.id}>
            <Link href={`/workspaces/${workspace.id}/settings`}>
              <span>{workspace.name}</span><small>{workspace.timezone} · {workspace.defaultCurrency}</small><span aria-hidden="true">→</span>
            </Link>
          </li>)}
        </ul> : <section className="ub-panel ub-stack" role="status">
          <h2>No active workspaces</h2>
          <p>You are signed in, but no active workspace is available for this account.</p>
        </section>}
      </div>
    </main>
  </div>;
}
