'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { SessionView } from '@/contracts/ui';
import { Button } from './button';

export type AppShellProps = { session: SessionView; children: ReactNode; onSignOut: () => void };

/** Navigation visibility is supplied by the trusted adapter, never inferred from role labels. */
export function AppShell({ session, children, onSignOut }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!navOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNavOpen(false);
        menuRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [navOpen]);
  return <div className="ub-app">
    <a href="#workspace-content" className="ub-skip">Skip to content</a>
    <header className="ub-topbar">
      <div><p className="ub-eyebrow">Unified business management</p><p className="ub-workspace-name">{session.workspace.name}</p></div>
      <Button ref={menuRef} className="ub-menu-toggle" variant="secondary" aria-controls={navId} aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>{navOpen ? 'Close navigation' : 'Open navigation'}</Button>
    </header>
    <aside id={navId} className="ub-sidebar" data-open={navOpen}>
      <nav className="ub-nav" aria-label="Workspace">{session.navigation.map((item) => item.enabled
        ? <a key={item.id} href={item.href} onClick={() => setNavOpen(false)}>{item.label}<span aria-hidden="true">↗</span></a>
        : <button key={item.id} disabled title="Not yet available">{item.label}<span className="ub-nav-pending">Not yet available</span></button>)}</nav>
      <div className="ub-sidebar-footer"><div><p>{session.user.displayName}</p><p className="ub-email">{session.user.email}</p></div><Button variant="secondary" onClick={onSignOut}>Sign out</Button></div>
    </aside>
    <main id="workspace-content" className="ub-content" tabIndex={-1}>{children}</main>
  </div>;
}
