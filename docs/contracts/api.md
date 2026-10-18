# API contract v1

Status: approved v1 adoption set (2026-10-18). These endpoints are not
implemented. After approval, `src/contracts/*.ts` Zod schemas are the executable source
of truth; types use `z.infer`, fixtures are parsed by those schemas, and docs link them.
Do not maintain a parallel hand-written DTO tree. Route handlers and server-rendered
application calls invoke the same application services and permission checks.

## Transport, identity and compatibility

Base `/api/v1/workspaces/:workspaceId`. Resolve identity from a verified Supabase
cookie session, then load active membership in the path workspace; never trust a
workspace header or client role. Wrong-tenant record IDs return NOT_FOUND after caller
workspace authorization. Auth pages/operations use the same origin and configured PKCE
callback. Provider/internal routes have their own authentication, never session bypass.

Authenticated responses are `Cache-Control: private, no-store`; do not cache Set-Cookie
or workspace responses across users. JSON success is `{data:T,meta:{requestId:string}}`.
Lists use `{data:T[],meta:{requestId,nextCursor:string|null}}`. Errors:

```ts
type ApiError = { error: { code: ErrorCode; message: string;
  fieldErrors?: Record<string,string[]>; retryable: boolean; requestId: string } };
type ErrorCode = 'VALIDATION_FAILED'|'UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'
  |'CONFLICT'|'STALE_VERSION'|'DEADLINE_EXPIRED'|'ASSIGNMENT_CHANGED'
  |'RATE_LIMITED'|'PROVIDER_UNAVAILABLE'|'RECONNECT_REQUIRED'|'INTERNAL_ERROR';
```

Use HTTP 400 validation, 401 unauthenticated/revoked, 403 forbidden, 404 missing/wrong
tenant, 409 conflict/version/deadline, 429 throttled and 503 temporary external failure.
Return safe messages; log correlation, not secrets or raw objects. No stack trace in DTO.
Mutations return 201 for new resource, 200 for updated resource or a typed accepted job
(`202`, `{operationId,status:'pending'}`). A pending provider operation is not success.

All IDs UUID; instants RFC3339 UTC strings; custom date-only values YYYY-MM-DD. Money:
`{amountMinor:string,currency:string}` with nonnegative integer minor-unit string and
ISO currency. Dashboard totals use separate `MoneyTotal` with a signed integer minor-unit string;
request/record `Money` remains nonnegative. No float currency arithmetic or aggregation
of different currencies.
Every mutable entity includes `version:number` within JS safe integer bounds; reject
out-of-range serialization. Editing takes `expectedVersion` (positive integer).

All create/action requests accept `Idempotency-Key` UUID, required for public intake,
messages, payments, appointments and lead ownership actions. Scope key by workspace,
actor and route/operation. Same body returns prior permitted result; changed body =>409.
Store durable result/semantic key, minimum 24h; provider event dedupe retention follows
provider history/retention, not the HTTP key TTL. Persist no credential response.

Pagination: opaque cursor binding last `(sortValue,id)`, filter hash, workspace and
viewer scope; limit defaults 25, max100. Allowlisted sort keys; stable id tiebreaker;
never accept raw SQL. Filter AST bounded depth4, max20 terms, operators eq/ne/in/contains/
gte/lte/between and AND/OR groups. Stage/tag/owner/date/custom field types validated;
protected-value filter requires value permission. Exports recheck same permissions.
Compatibility: additive optional fields allowed; breaking fields/semantics require
contract-change issue and consumer migration; do not silently change v1.

## Canonical shared schema blueprint

Implement these as named Zod schemas, then infer types. Unknown input keys are rejected;
external provider payload validation preserves raw bytes for signatures before parsing.

```ts
type Id = string; type Instant = string;
type ActorContext = {userId:Id; workspaceId:Id; membershipId:Id}; // server-created only
type BaseLevel = 'owner'|'admin'|'user';
type Availability = 'available'|'busy'|'on_leave'|'offline';
type Money = {amountMinor:string; currency:string}; // nonnegative
type MoneyTotal = {amountMinor:string; currency:string}; // signed aggregate
type AckContext = {leadId:Id;assignmentVersion:number}; // actor derived server-side
type Versioned = {id:Id;version:number};
type UserDto = {id:Id;displayName:string;email:string};
type WorkspaceDto = Versioned & {name:string;timezone:string;defaultCurrency:string};
type MemberDto = Versioned & {userId:Id;displayName:string;baseLevel:BaseLevel;
  roleId:Id;status:'active'|'inactive';availability:Availability};
type ContactDto = Versioned & {name:string;companyId:Id|null;ownerMembershipId:Id|null;
  phoneE164:string|null;email:string|null;optedOut:boolean;customFields:Record<string,FieldValue>};
type CompanyDto = Versioned & {name:string;website:string|null;customFields:Record<string,FieldValue>};
type FieldValue = string|number|boolean|null;
type FieldDefinitionDto = Versioned & {entityKind:'contact'|'company'|'opportunity';
  pipelineId:Id|null;key:string;label:string;valueType:'text'|'number'|'date'|'dropdown'|'checkbox';
  options:{key:string;label:string}[]};
type StageDto = Versioned & {pipelineId:Id;name:string;position:number;
  outcome:'open'|'won'|'lost';requiredFieldIds:Id[]};
type OpportunityDto = Versioned & {title:string;contactId:Id;companyId:Id|null;
  ownerMembershipId:Id|null;pipelineId:Id;stageId:Id;customFields:Record<string,FieldValue>;
  value:{visibility:'visible';money:Money}|{visibility:'hidden'}};
type LeadDto = Versioned & {contactId:Id;opportunityId:Id|null;source:'form'|'message'|'manual';
  state:'open'|'closed';accountableMembershipId:Id;ownershipMode:'operational'|'custody';
  assignmentVersion:number;assignedAt:Instant|null;ackDeadlineAt:Instant|null;
  acknowledgedAt:Instant|null;recoveryReasons:RecoveryReason[]};
type RecoveryReason = 'overdue_acknowledgement'|'repeated_escalation'|'idle'
  |'awaiting_eligible_employee'|'escalation_chain_exhausted';
type MessageDto = Versioned & {conversationId:Id;direction:'inbound'|'outbound';body:string;
  state:'received'|'pending'|'sent'|'delivered'|'failed'|'unknown';failureCode:string|null};
type PaymentDto = Versioned & {opportunityId:Id;contactId:Id;requestedBy:Id;money:Money;
  state:'pending'|'open'|'abandoned'|'expired'|'policy_expired'|'failed'|'paid'
    |'partially_refunded'|'refunded'; checkoutUrl:string|null;
  providerTrackerRef:string|null;providerPaymentRef:string|null;
  providerExpiresAt:Instant|null;applicationPolicyExpiresAt:Instant|null};
type AppointmentDto = Versioned & {contactId:Id;opportunityId:Id|null;employeeMembershipId:Id;
  startsAt:Instant;endsAt:Instant;timezone:string;state:'pending'|'confirmed'|'rescheduling'
  |'cancelling'|'cancelled'|'failed'|'conflict';providerReference:string|null};
type IntegrationDto = Versioned & {provider:'textbee'|'safepay'|'google'|'telegram';
  membershipId:Id|null;status:'disconnected'|'connected'|'error'|'reconnect_required';
  lastSuccessAt:Instant|null;lastError:{code:string;message:string}|null;limits:string[]};
type AuditDto = {id:Id;eventType:string;actor:{kind:'user'|'system'|'provider';
  displayName:string|null};target:{type:string;id:Id};occurredAt:Instant;
  before:Record<string,unknown>|null;after:Record<string,unknown>|null}; // masked projection
```

## Adopted operations

All workspace routes below inherit authentication, membership, record/field scope,
server validation, no-store, RLS and audit rules. `V` means expectedVersion is required.
Permission keys are capabilities, not role-name checks; base-level protection of Owner
is an additional guard. Read grants have own/all record scope as specified in security.

| Method / workspace-relative path | Request / query | Response data | Permission / atomic behavior |
| --- | --- | --- | --- |
| GET `/api/v1/session` (global) | none | `{user:UserDto,workspaces:WorkspaceDto[]}` | Verified identity; own memberships only |
| POST `/api/v1/auth/signup` | email/password/displayName/workspaceName/timezone/currency | `{requiresEmailConfirmation:boolean}` or session result | Public rate limit; Auth/bootstrap transaction |
| POST `/api/v1/auth/login`, POST `/api/v1/auth/logout` | email/password; logout scope local/global | user session; `{signedOut:true}` | Origin protection, provider session revocation semantics |
| GET/PATCH `/` | V + name/timezone/defaultCurrency | WorkspaceDto | read member; workspace.manage for patch; configuration audit |
| GET `/members` | cursor/search/status | MemberDto[] | members.view; no email leakage to unrelated viewers |
| POST `/invitations` | email/baseLevel/roleId | `{id,expiresAt}` | members.manage; never invite Owner; raw token only sent via configured Auth invitation flow |
| POST `/invitations/accept` | token | MemberDto | Verified matching email, one-use hashed token; no arbitrary workspace grants |
| PATCH `/members/:id` | V + baseLevel/roleId/status | MemberDto | members.manage; cannot change Owner as Admin; safe deactivation |
| GET/POST/PATCH `/roles[/:id]` | name/permissionKeys; V on edit | role `{id,name,permissionKeys,version}` | permissions.manage on writes; protected system authority |
| PUT `/members/:id/permissions` | V + overrides `{key,effect}[]` | effective keys/overrides/version | permissions.manage; audit; session claims not authoritative |
| POST `/owner-transfer` | targetMembershipId + expectedWorkspaceVersion | WorkspaceDto | current Owner only; atomically retain one active Owner/custody |
| GET/POST/PATCH/DELETE `/contacts[/:id]` | Contact create/patch fields; V on edits/deletion | ContactDto or archive result | crm.contacts.view/create/edit/delete; relationships/phone uniqueness |
| GET/POST/PATCH/DELETE `/companies[/:id]` | name/website/customFields; V | CompanyDto or archive result | crm.companies.view/create/edit/delete |
| GET `/contacts/:id/customer-view` | bounded subresource cursors | permitted contact, opportunities, messages, payments, appointments, activity | Component-specific grants; no single broad customer-view bypass |
| GET/POST/PATCH/DELETE `/opportunities[/:id]` | title/contact/pipeline/stage/owner/customFields/money; V | OpportunityDto | crm.opportunities.*; money writes require crm.values.edit |
| POST `/opportunities/:id/move` | V + stageId + optional ackContext | OpportunityDto | edit; same pipeline and required fields validated transactionally |
| GET/POST/PATCH `/pipelines[/:id]` | name; V | pipeline `{id,name,stages,version}` | crm.configure for writes |
| POST/PATCH `/pipelines/:id/stages[/:stageId]` | name/outcome/requiredFieldIds; V | StageDto | crm.configure; incompatible changes rejected |
| PUT `/pipelines/:id/stage-order` | V + orderedStageIds | StageDto[] | one transaction, exact membership/permutation |
| DELETE `/pipelines/:id/stages/:stageId` | V + moveToStageId when occupied | `{deletedId}` | crm.configure; move affected opportunities safely before deletion |
| GET/POST/PATCH `/custom-fields[/:id]` | FieldDefinition input; V | FieldDefinitionDto | crm.configure writes; type conversion requires migration decision |
| GET/POST/DELETE `/tags[/:id]` | name/colorToken | tag DTO | CRM record/config permission as applicable |
| GET/POST/PATCH/DELETE `/saved-filters[/:id]` | entityKind/name/visibility/filterAst; V | saved filter DTO | permitted entity view; own filter writes; workspace sharing grant |
| POST `/exports` | entityKind/filterAst/columns | `{operationId,status:'pending'}` | entity export + field permissions; safe authorized download |
| GET/POST/PATCH `/lead-intake-endpoints[/:id]` | name/enabled/allowedFields/allowedOrigins/rateLimitConfig; V | public endpoint metadata | assignment.manage; trusted workspace mapping, no provider connection masquerade |
| GET/POST `/leads` | query; `{contactId,opportunityId?,source:'manual',sourceReference?}` | LeadDto | leads.view/create; atomic allocation/custody |
| POST `/public/intake/:endpointId` (global) | name/phone/email/message + idempotency key | `{receiptId,status:'received'}` | Public endpoint config/rate limit; no owner/record disclosure |
| POST `/leads/:id/acknowledge` | assignmentVersion | LeadDto | current operational owner; time/version checked under workspace lock |
| POST `/leads/:id/reassign` | assignmentVersion + targetMembershipId + reason | LeadDto | leads.reassign; eligible different target; same owner rejected; manual != escalation; starts new cycle |
| POST `/leads/:id/recover` | assignmentVersion + action accept_current | LeadDto | leads.recovery.accept; current operational owner Available; only overdue/no-candidate or exhausted chain; records explicit late acknowledgement, no fake reassignment/escalation |
| POST `/leads/:id/close` | V + reason | LeadDto | leads.edit + ownership scope; clears active deadline |
| POST `/leads/:id/actions` | assignmentVersion + kind note/call_log + content | activity + LeadDto | leads.edit; qualifying actor action acknowledges only valid current assignment |
| PUT `/members/:id/availability` | V + status | MemberDto | own availability or members.availability.manage; absence transfers unacknowledged leads atomically |
| GET/PUT `/assignment-rules/default` | V + pool + tiers + idleThresholdSeconds | rule DTO | assignment.manage writes; versioned snapshot/validation |
| GET `/recovery` | reason/owner/cursor | LeadDto[] with reasons | leads.recovery.view + record scope; no fake mutable queue |
| GET `/conversations`, GET `/conversations/:id/messages` | cursor | conversation DTO; MessageDto[] | messaging.view + conversation ownership/all scope |
| POST `/conversations/:id/messages` | body + optional ackContext + idempotency key | MessageDto pending | messaging.send; opt-out checked at enqueue and actual send |
| POST `/messages/:id/retry` | V + idempotency key | MessageDto | messaging.send; reconcile unknown outcome before duplicate risk |
| POST `/opportunities/:id/payment-requests` | money + idempotency key | PaymentDto pending | payments.create; contact/opportunity and currency checks |
| GET `/payment-requests`, GET `/payment-requests/:id` | cursor/status | PaymentDto | payments.view + related CRM scope |
| POST `/payment-requests/:id/send` | channel/conversationId + idempotency key | MessageDto pending | payments.send + messaging.send; no implicit opt-out bypass |
| POST `/calendar/connect` | same-origin redirectPath | `{authorizationUrl}` | integrations.calendar.connect_own + own membership; state/PKCE |
| DELETE `/calendar/connections/:id` | V | IntegrationDto | integrations.calendar.connect_own + own membership; revoke/safely cancel pending jobs |
| GET `/calendar/busy` | employeeMembershipId/from/to/timezone | `{busy:{startsAt,endsAt}[],checkedAt}` | calendar.book + permitted employee; no unrelated event detail |
| GET/POST/PATCH/DELETE `/appointments[/:id]` | contact/opportunity/employee/start/end/timezone + optional ackContext; V | AppointmentDto | calendar.view/book; pending/rescheduling/cancelling explicit; provider outcome drives confirmed state |
| GET `/dashboard`, GET/PATCH `/dashboard/preferences` | scope personal/company, range; widgetIds | DashboardSnapshot; preferences | dashboard.view; company requires dashboard.company.view; field/record grants still apply |
| GET `/integrations`, GET `/integrations/:id/history` | cursor/date/result | IntegrationDto[]; redacted history | integrations.view/history.view |
| PUT/DELETE `/integrations/:provider` | provider-specific write-only credentials/config; V | IntegrationDto | integrations.manage; never echo credentials; audit changes |
| PUT `/notifications/destination` | chatId + enabled | masked destination/status | notifications.destination.manage_own + own membership; verification required |
| GET `/notification-deliveries` | status/cursor | redacted delivery DTO | notifications.failures.view for admin visibility |
| GET `/audit` | eventType/actor/from/to/cursor | AuditDto[] | audit.view and field masking; no audit write/delete routes |

Provider-specific public endpoints:
`POST /api/webhooks/textbee/:endpointId/messages`, `/status`, and
`POST /api/webhooks/safepay/:endpointId`; configured connection identifier locates the
secret but is not authentication. Verify signature before trusted workspace effects.
Textbee verifies `X-Signature` as lowercase-hex HMAC-SHA256 over the exact raw body with
the connection's subscription secret. Safepay verifies `X-SFPY-SIGNATURE` as SHA-512
HMAC over the exact raw request bytes. The endpoint ID only selects a candidate configured
connection; reject unknown/disabled connections and invalid signatures before enqueueing
trusted business work. Textbee's stable `idempotencyKey` is the webhook event identity;
store `smsId` and `smsBatchId` separately. Safepay's top-level `token` is the event identity,
`data.tracker` is the checkout correlation key, and payment/refund references remain
separate nullable values. Never infer successful payment from a redirect. A local policy
deadline produces `policy_expired`; `expired` is reserved for provider-confirmed expiry.
`GET /api/oauth/google/callback` validates state/actor; `POST /api/internal/jobs/run`
requires HMAC-SHA256 of timestamp, nonce and original body using a rotating high-entropy
internal credential. Cron signs with Vault secret; server verifies constant-time, <=30s
clock skew, fixed body schema and unused nonce receipt before claiming jobs. Never send
the raw credential in the URL or logs. Body permits only bounded batch size, timestamp
and nonce; callers cannot choose arbitrary actors or invoke arbitrary SQL.
See [integrations](../features/integrations.md) for payload/auth rules.
