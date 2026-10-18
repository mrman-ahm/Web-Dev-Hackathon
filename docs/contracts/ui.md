# Stable presentation interfaces — first wave

Status: approved stable first-wave interface (2026-10-18).
Executable exports belong only to `src/contracts/ui.ts`, imported with type/schema-only
public entrypoints. UI must not import domain repositories, Supabase service clients,
permission evaluators, raw database types or provider SDKs. Developer 1 owns all UI and the core lane supplies
schema-parsed synthetic fixtures under `tests/fixtures/ui.ts` and real-data adapters.

```ts
type BaseLevel = 'owner'|'admin'|'user';
type AuthenticatedUser = {id:string;displayName:string;email:string};
type WorkspaceSummary = {id:string;name:string;timezone:string;defaultCurrency:string};
type NavigationItem = {id:string;label:string;href:string;icon:string;enabled:boolean};
type SessionView = {user:AuthenticatedUser;workspace:WorkspaceSummary;
  membershipId:string;baseLevel:BaseLevel;navigation:NavigationItem[]};
type UiError = {code:string;message:string;retryable:boolean;requestId?:string};
type RemoteData<T> = {status:'loading'}|{status:'error';error:UiError}
  |{status:'empty'}|{status:'ready';data:T};
type Money = {amountMinor:string;currency:string}; // nonnegative transfer/value
type MoneyTotal = {amountMinor:string;currency:string}; // signed aggregate
type MetricValue = {kind:'count';value:number}|{kind:'duration';seconds:number|null}
  |{kind:'money';totals:MoneyTotal[]}|{kind:'statusCounts';counts:Record<string,number>};
type DashboardMetricId = 'new_leads_today'|'open_pipeline_value'|'first_response_seconds'
  |'recovery_count'|'escalations_24h'|'availability'|'upcoming_appointments'|'payments_month'
  |'net_collections_month';
type DashboardMetric = {id:DashboardMetricId;label:string} & (
  {visibility:'visible';value:MetricValue;drilldownHref:string|null}
  |{visibility:'restricted'}); // no value or URL on restricted metrics
type PipelineStageValue = {stageId:string;stageName:string;totals:MoneyTotal[]};
type PipelineTotals = {visibility:'visible';stages:PipelineStageValue[]}
  |{visibility:'restricted'};
type DashboardSnapshot = {scope:'personal'|'company';workspaceId:string;asOf:string;
  timezone:string;metrics:DashboardMetric[];openPipelineByStage:PipelineTotals;
  upcomingAppointments:AppointmentSummary[];collections:{grossPayments:MoneyTotal[];
  confirmedRefunds:MoneyTotal[];netCollected:MoneyTotal[]}};
type AppointmentSummary = {id:string;contactName:string;employeeName:string;
  startsAt:string;endsAt:string;timezone:string;status:string};
type ContactSummary = {id:string;name:string;companyName:string|null;ownerName:string|null};
type LeadSummary = {id:string;contact:ContactSummary;source:'form'|'message'|'manual';
  ownerName:string;ownershipMode:'operational'|'custody';ackDeadlineAt:string|null;
  recoveryReasons:string[]};
```

`enabled` is an authorized presentation descriptor supplied by the core adapter, not
an authorization decision made by components. Hidden values arrive already removed;
UI masking alone never grants protection. Disabled navigation must explain pending
functionality rather than opening decorative fake-success screens. UI previews are
explicitly labeled **Synthetic preview data** and excluded from live dashboard routes.

Public presentation component contracts:
`AppShell({session,children,onSignOut})`, `Button`/`Input` native-compatible ref/ARIA
props, `FormField({label,error,description,children})`, `DataTable<T>({columns,rows,
getRowId,page,onPageChange})`, `Dialog({open,onOpenChange,title,description,children})`,
`AsyncBoundary<T>({state,render,onRetry})`, `DashboardView({state,visibleWidgetIds,
onVisibilityChange})`. UI reports callbacks; core owns fetch, permissions and mutations.
Use accessible DOM/dialog primitives rather than inventing keyboard/focus behavior.
Do not require all future screens for independently mergeable UI foundation work.

All UI implementation and presentation integration belong to Developer 1/GPT.
Developer 2 does not consume this contract for frontend work. Its independent contracts
are the provider adapter ports owned by Developer 1.
