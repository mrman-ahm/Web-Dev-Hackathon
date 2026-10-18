import Link from 'next/link';

export default function Home() {
  return <main className="ub-home">
    <div className="ub-home-top"><p className="ub-eyebrow">Unified Business Management</p><p className="ub-home-mark">UBMP</p></div>
    <div className="ub-home-copy">
      <p className="ub-eyebrow">Built for teams that follow through</p>
      <h1>Accountability starts with the next lead.</h1>
      <p className="ub-home-intro">A workspace for service teams building a clearer path from first contact to follow-up.</p>
      <nav className="ub-row" aria-label="Account">
        <Link href="/signup" className="ub-button">Create a workspace</Link>
        <Link href="/login" className="ub-button" data-variant="secondary">Sign in</Link>
      </nav>
      <p className="ub-home-note">Core CRM and provider workflows are still being connected. This account flow stores real workspace settings.</p>
    </div>
    <aside className="ub-home-principle"><p className="ub-eyebrow">Product principle</p><h2>Every incoming lead should have one accountable owner.</h2><p>Missed responses should be escalated or made visible for recovery.</p></aside>
  </main>;
}
