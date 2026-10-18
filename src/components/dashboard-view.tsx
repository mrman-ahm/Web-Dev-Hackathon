'use client';

import { useId } from 'react';
import type { DashboardMetric, DashboardMetricId, DashboardSnapshot, MetricValue, RemoteData } from '@/contracts/ui';
import { AsyncBoundary } from './async-boundary';
import { MoneyList } from './money';

export type DashboardViewProps = {
  state: RemoteData<DashboardSnapshot>;
  visibleWidgetIds: readonly DashboardMetricId[];
  onVisibilityChange: (ids: DashboardMetricId[]) => void;
  onRetry?: () => void;
};

function MetricContent({ value }: { value: MetricValue }) {
  switch (value.kind) {
    case 'count': return <>{value.value.toLocaleString('en-US')}</>;
    case 'duration': return value.seconds === null ? <span className="ub-muted">No responses yet</span> : <>{value.seconds < 60 ? `${Math.round(value.seconds)}s` : `${Math.floor(value.seconds / 60)}m ${Math.round(value.seconds % 60)}s`}</>;
    case 'money': return <MoneyList totals={value.totals} />;
    case 'statusCounts': return <dl>{Object.entries(value.counts).map(([name, count]) => <div key={name} className="ub-row ub-spread"><dt>{name}</dt><dd>{count}</dd></div>)}</dl>;
  }
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const id = useId();
  return <article className="ub-metric" aria-labelledby={id}><h3 id={id}>{metric.label}</h3>
    {metric.visibility === 'restricted' ? <p className="ub-restricted">Restricted</p> : <><div className="ub-metric-value"><MetricContent value={metric.value} /></div>{metric.drilldownHref && <a href={metric.drilldownHref}>View {metric.label}<span aria-hidden="true"> →</span></a>}</>}
  </article>;
}

function DashboardContent({ snapshot, visibleWidgetIds, onVisibilityChange }: { snapshot: DashboardSnapshot } & Pick<DashboardViewProps, 'visibleWidgetIds' | 'onVisibilityChange'>) {
  const pipelineTitle = useId();
  const collectionsTitle = useId();
  const appointmentTitle = useId();
  const time = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: snapshot.timezone }).format(new Date(snapshot.asOf));
  return <div className="ub-stack-lg">
    <div className="ub-row ub-spread"><h2>Operational snapshot</h2><p className="ub-muted">{snapshot.scope === 'company' ? 'Company' : 'Personal'} view · As of <time dateTime={snapshot.asOf}>{time}</time> ({snapshot.timezone})</p></div>
    <fieldset className="ub-widget-settings"><legend>Visible metrics</legend><div className="ub-widget-options">{snapshot.metrics.map((metric) => <label key={metric.id} className="ub-checkbox"><input type="checkbox" checked={visibleWidgetIds.includes(metric.id)} onChange={(event) => onVisibilityChange(event.currentTarget.checked ? [...visibleWidgetIds, metric.id] : visibleWidgetIds.filter((id) => id !== metric.id))} />{metric.label}</label>)}</div></fieldset>
    <div className="ub-metric-grid">{snapshot.metrics.filter((metric) => visibleWidgetIds.includes(metric.id)).map((metric) => <MetricCard key={metric.id} metric={metric} />)}</div>
    <section className="ub-panel ub-stack" aria-labelledby={pipelineTitle}><h2 id={pipelineTitle}>Open pipeline by stage</h2>{snapshot.openPipelineByStage.visibility === 'restricted' ? <p className="ub-restricted">Restricted</p> : snapshot.openPipelineByStage.stages.length ? <div className="ub-metric-grid">{snapshot.openPipelineByStage.stages.map((stage) => <section key={stage.stageId} className="ub-stack"><h3>{stage.stageName}</h3><MoneyList totals={stage.totals} /></section>)}</div> : <p className="ub-muted">No open opportunities.</p>}</section>
    <section className="ub-panel ub-stack" aria-labelledby={collectionsTitle}><h2 id={collectionsTitle}>Collections this month</h2>{snapshot.collections.visibility === 'restricted' ? <p className="ub-restricted">Restricted</p> : <><div className="ub-collections"><section className="ub-collection" aria-label="Gross payments received"><h3>Gross payments received</h3><MoneyList totals={snapshot.collections.grossPayments} /></section><section className="ub-collection" aria-label="Confirmed refunds"><h3>Confirmed refunds</h3><MoneyList totals={snapshot.collections.confirmedRefunds} /></section><section className="ub-collection" aria-label="Net collected revenue"><h3>Net collected revenue</h3><MoneyList totals={snapshot.collections.netCollected} /></section></div><p className="ub-muted">Confirmed payments and refunds in their confirmation month. Each currency is reported separately; net collections may be negative.</p></>}</section>
    <section className="ub-panel ub-stack" aria-labelledby={appointmentTitle}><h2 id={appointmentTitle}>Upcoming appointments</h2>{snapshot.upcomingAppointments.length ? <ul className="ub-appointment-list">{snapshot.upcomingAppointments.map((appointment) => <li key={appointment.id}><p><strong>{appointment.contactName}</strong> · {appointment.employeeName}</p><p className="ub-muted"><time dateTime={appointment.startsAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: appointment.timezone }).format(new Date(appointment.startsAt))}</time> ({appointment.timezone}) · {appointment.status}</p></li>)}</ul> : <p className="ub-muted">No upcoming appointments.</p>}</section>
  </div>;
}

/** Receives already authorized projections; no auth, fetch, accounting, or domain behavior. */
export function DashboardView({ state, visibleWidgetIds, onVisibilityChange, onRetry }: DashboardViewProps) {
  return <AsyncBoundary state={state} onRetry={onRetry} render={(snapshot) => <DashboardContent snapshot={snapshot} visibleWidgetIds={visibleWidgetIds} onVisibilityChange={onVisibilityChange} />} />;
}
