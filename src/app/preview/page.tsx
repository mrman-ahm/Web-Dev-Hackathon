'use client';

import { useState, type FormEvent } from 'react';
import type { DashboardMetricId, LeadSummary } from '@/contracts/ui';
import { syntheticDashboard, syntheticLead, syntheticSession } from '../../../tests/fixtures/ui';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { FormField } from '@/components/form-field';
import { Dialog } from '@/components/dialog';
import { DataTable } from '@/components/data-table';
import { DashboardView } from '@/components/dashboard-view';
import { AsyncBoundary } from '@/components/async-boundary';

const previewSession = {
  ...syntheticSession,
  navigation: [{ id: 'preview', label: 'Component preview', href: '/preview', icon: 'overview', enabled: true }, { id: 'operations', label: 'Operations', href: '/operations', icon: 'leads', enabled: false }],
};
const rows: LeadSummary[] = [syntheticLead, { ...syntheticLead, id: '66666666-6666-4666-8666-666666666666', contact: { ...syntheticLead.contact, name: 'Preview Solar Customer' } }, { ...syntheticLead, id: '77777777-7777-4777-8777-777777777777', contact: { ...syntheticLead.contact, name: 'Preview Clinic Customer' } }];

/** Deliberately isolated synthetic fixtures; never an operational dashboard route. */
export default function ComponentPreview() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [visibleIds, setVisibleIds] = useState<DashboardMetricId[]>(syntheticDashboard.metrics.map((metric) => metric.id));
  const [page, setPage] = useState(0);
  const [email, setEmail] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  function validatePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(`Preview input accepted: ${email}. No data was saved.`);
  }
  return <AppShell session={previewSession} onSignOut={() => setFeedback('Preview only: no authenticated session exists here.')}>
    <div className="ub-page">
      <div className="ub-preview-banner"><strong>Synthetic preview data</strong><p>Component examples only. These records, totals and actions do not represent a live business workspace.</p></div>
      <header className="ub-row ub-spread"><div className="ub-stack"><p className="ub-eyebrow">UI foundation · Developer 1</p><h1>Component workspace</h1><p className="ub-muted">Accessible building blocks for customer operations.</p></div><Button onClick={() => setDialogOpen(true)}>Open example dialog</Button></header>
      {feedback && <p role="status" className="ub-preview-banner">{feedback}</p>}
      <DashboardView state={{ status: 'ready', data: syntheticDashboard }} visibleWidgetIds={visibleIds} onVisibilityChange={setVisibleIds} />
      <div className="ub-preview-columns">
        <section className="ub-panel ub-stack-lg"><h2>Form primitives</h2><form className="ub-stack" onSubmit={validatePreview}><FormField label="Work email" description="Preview validation only. Nothing is sent or saved."><Input type="email" name="workEmail" autoComplete="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></FormField><div><Button type="submit">Validate example form</Button></div>{formMessage && <p role="status">{formMessage}</p>}</form><FormField label="Example invalid field" error="A company name is required."><Input defaultValue="" /></FormField><div className="ub-row"><Button disabled>Disabled action</Button><Button variant="secondary" onClick={() => setFeedback('Example action invoked. No backend operation occurred.')}>Example secondary action</Button></div></section>
        <section className="ub-stack"><h2>Feedback states</h2><AsyncBoundary state={{ status: 'loading' }} render={() => null} /><AsyncBoundary state={{ status: 'empty' }} render={() => null} /><AsyncBoundary state={{ status: 'error', error: { code: 'PREVIEW_UNAVAILABLE', message: 'Example temporary error. Use retry to request another attempt.', retryable: true, requestId: 'synthetic-request' } }} render={() => null} onRetry={() => setFeedback('Preview retry invoked. No network request was sent.')} /></section>
      </div>
      <section className="ub-panel ub-stack"><h2>Customer intake table</h2><p className="ub-muted">Custody is explicit accountability while a lead awaits an eligible employee.</p><DataTable caption="Synthetic lead intake" rows={rows.slice(page * 2, page * 2 + 2)} columns={[{ id: 'contact', header: 'Contact', cell: (row) => row.contact.name }, { id: 'source', header: 'Source', cell: (row) => row.source }, { id: 'owner', header: 'Accountable owner', cell: (row) => row.ownerName }, { id: 'mode', header: 'Ownership', cell: (row) => row.ownershipMode === 'custody' ? 'Owner custody · awaiting eligible employee' : 'Operational' }]} getRowId={(row) => row.id} page={{ index: page, size: 2, totalRows: rows.length }} onPageChange={setPage} /></section>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="Edit saved view" description="A synthetic example of accessible modal form behavior."><FormField label="View name"><Input defaultValue="My open leads" /></FormField><Button onClick={() => { setDialogOpen(false); setFeedback('Preview dialog closed. No view was saved.'); }}>Finish preview</Button></Dialog>
    </div>
  </AppShell>;
}
