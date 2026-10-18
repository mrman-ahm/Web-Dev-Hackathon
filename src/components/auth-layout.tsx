import type { ReactNode } from 'react';

export function AuthLayout({
  heading,
  description,
  children,
  footer,
}: {
  heading: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return <div className="ub-auth-layout">
    <a href="#auth-main" className="ub-skip">Skip to account form</a>
    <main id="auth-main" className="ub-auth-main" tabIndex={-1}>
      <div className="ub-auth-heading">
        <p className="ub-eyebrow">Unified Business Management</p>
        <h1>{heading}</h1>
        <p className="ub-muted">{description}</p>
      </div>
      <section className="ub-panel ub-auth-panel" aria-label={heading}>{children}</section>
      <div className="ub-auth-footer">{footer}</div>
    </main>
    <aside className="ub-auth-story" aria-label="Product principle">
      <div>
        <p className="ub-auth-story-kicker">A clearer way to run the next step</p>
        <h2>One accountable owner for every incoming lead.</h2>
        <p>UBMP is being built to make missed responses visible and give teams a clear recovery path.</p>
      </div>
      <p className="ub-auth-story-note">Core workflows are being connected. This account flow uses your saved workspace data.</p>
    </aside>
  </div>;
}
