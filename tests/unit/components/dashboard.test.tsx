import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSnapshot, SessionView } from '@/contracts/ui';
import { DashboardView } from '@/components/dashboard-view';
import { AppShell } from '@/components/app-shell';
import { formatMoney } from '@/components/money';

afterEach(cleanup);

const snapshot: DashboardSnapshot = {
  scope: 'company', workspaceId: 'preview-workspace', asOf: '2026-10-18T09:30:00Z', timezone: 'Asia/Karachi',
  metrics: [{ id: 'new_leads_today', label: 'New leads today', visibility: 'visible', value: { kind: 'count', value: 12 }, drilldownHref: '/leads' }, { id: 'open_pipeline_value', label: 'Open pipeline value', visibility: 'restricted' }],
  openPipelineByStage: { visibility: 'restricted' }, upcomingAppointments: [], collections: { visibility: 'visible', grossPayments: [{ amountMinor: '20000', currency: 'USD' }], confirmedRefunds: [{ amountMinor: '25000', currency: 'USD' }], netCollected: [{ amountMinor: '-5000', currency: 'USD' }, { amountMinor: '100', currency: 'JPY' }] },
};
const session: SessionView = { user: { id: 'preview-user', displayName: 'Amina', email: 'amina@example.test' }, workspace: { id: 'preview-workspace', name: 'Northstar Services', timezone: 'Asia/Karachi', defaultCurrency: 'USD' }, membershipId: 'preview-member', baseLevel: 'owner', navigation: [{ id: 'dashboard', label: 'Overview', href: '/dashboard', icon: 'overview', enabled: true }, { id: 'calendar', label: 'Calendar', href: '/calendar', icon: 'calendar', enabled: false }] };

describe('DashboardView', () => {
  it('renders supplied values, omits restricted drilldowns and distinguishes gross/refunds/signed net by currency', () => {
    render(<DashboardView state={{ status: 'ready', data: snapshot }} visibleWidgetIds={['new_leads_today', 'open_pipeline_value']} onVisibilityChange={vi.fn()} />);
    expect(screen.getByRole('link', { name: /New leads today/ })).toHaveAttribute('href', '/leads');
    const restricted = screen.getByRole('article', { name: 'Open pipeline value' });
    expect(within(restricted).getByText('Restricted')).toBeInTheDocument();
    expect(within(restricted).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gross payments received' })).toHaveTextContent('$200.00');
    expect(screen.getByRole('region', { name: 'Confirmed refunds' })).toHaveTextContent('$250.00');
    expect(screen.getByRole('region', { name: 'Net collected revenue' })).toHaveTextContent('-$50.00');
    expect(screen.getByRole('region', { name: 'Net collected revenue' })).toHaveTextContent('¥100');
  });

  it('never substitutes zeros for protected collection totals', () => {
    render(<DashboardView state={{ status: 'ready', data: { ...snapshot, collections: { visibility: 'restricted' } } }} visibleWidgetIds={[]} onVisibilityChange={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Collections this month' })).toHaveTextContent('Restricted');
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('reports visibility selection without mutating incoming data', async () => {
    const changed = vi.fn();
    render(<DashboardView state={{ status: 'ready', data: snapshot }} visibleWidgetIds={['new_leads_today']} onVisibilityChange={changed} />);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Open pipeline value' }));
    expect(changed).toHaveBeenCalledWith(['new_leads_today', 'open_pipeline_value']);
  });

  it('formats signed minor units without rounding large integer amounts', () => {
    expect(formatMoney({ amountMinor: '900719925474099301', currency: 'USD' })).toBe('$9,007,199,254,740,993.01');
    expect(formatMoney({ amountMinor: '-1', currency: 'USD' })).toBe('-$0.01');
    expect(formatMoney({ amountMinor: '-1001', currency: 'KWD' })).toBe('-KWD 1.001');
  });
});

describe('AppShell', () => {
  it('consumes authorized navigation descriptors and reports sign-out', async () => {
    const signOut = vi.fn();
    render(<AppShell session={session} onSignOut={signOut}><h1>Workspace overview</h1></AppShell>);
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: /Calendar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calendar/ })).toBeDisabled();
    expect(screen.getByText('Not yet available')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#workspace-content');
  });
});
