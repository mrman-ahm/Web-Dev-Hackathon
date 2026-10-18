# PostgreSQL database contract

Status: approved schema design (2026-10-18); not an applied migration. Developer 1 is schema steward.
Names and invariants below are the migration specification. Runtime generated database
TS types must come from applied migrations; do not hand-maintain a competing DB model.

## Common conventions and trust

- UUID primary key `id default gen_random_uuid()` unless a composite key is specified.
  Tenant rows have `workspace_id uuid not null`, `created_at timestamptz not null`,
  `updated_at timestamptz not null` and mutable aggregates have `version bigint not null
  default 1`. Append-only facts do not need mutable timestamps/version.
- Every referenced tenant table exposes `unique(workspace_id,id)`. Tenant foreign keys
  use `(workspace_id,foreign_id)` to that pair, never an unconstrained UUID-only tenant
  reference. FK lookup columns are indexed. Historical references default `RESTRICT`.
- Store UTC instants in `timestamptz`; local date fields use `date`; workspace/appointment
  timezones are validated IANA names. Monetary amounts are nonnegative `bigint` minor
  units, ISO currency text; signed ledger deltas may be negative. JSON DTO amounts are strings.
- Status/type columns use named CHECK constraints with values below. JSONB is for
  validated custom values/filters/event payloads, never unconstrained relational links.
- Business tables are `public`; server-only secrets, ledger detail, inbox, domain events,
  outbox and command helpers are `private` (not exposed through Data API). Enable RLS
  on all business tables, including private data as defense in depth. No raw business
  table is published to Realtime; see the safe invalidation contract.
- Direct user DML to invariant-bearing tables is revoked. Explicit command RPCs verify
  actor/workspace/permissions and execute complete transactions. See RLS/commands below.

## Identity, tenancy and access

| Entity / owner | Exact domain columns beyond common fields | Constraints, indexes and deletion |
| --- | --- | --- |
| `auth.users` / Supabase Auth | Provider identity/password/session store; application never duplicates password hashes | Managed by Auth. Disable/deactivate memberships and preserve history before account deletion; no automatic cascading business deletion |
| `user_profiles` / identity | `id uuid` = Auth user ID, `display_name text`, `timezone text` | PK/FK auth.users; own profile read/update only validated display fields; user deletion RESTRICT until retention plan |
| `workspaces` / identity | `name text`, `timezone text`, `default_currency text`, `owner_membership_id uuid not null`, `state active|suspended` | Deferred FK `(id,owner_membership_id)` → memberships `(workspace_id,id)`; owner must be active Owner via deferred constraint trigger; name length 1..120 |
| `memberships` / identity | `user_id uuid`, `base_level owner|admin|user`, `role_id uuid`, `status active|inactive`, `joined_at timestamptz` | Unique workspace/user; partial unique workspace where active Owner; owner cannot be deactivated or demoted without atomic transfer; inactive rows retained for history; index user/status/workspace |
| `permission_catalog` / permissions | `key text primary key`, `description text` | Deployment-controlled global catalog; no tenant-supplied permission keys |
| `roles` / permissions | `name text`, `system_default bool` | Unique workspace/lower(name); Manager is a name with grants, not a base level; restrict deletion while assigned unless reassigned transactionally |
| `role_permissions` / permissions | `role_id uuid`, `permission_key text` | PK workspace/role/permission; FK catalog; role deletion may cascade only this configuration |
| `membership_permission_overrides` / permissions | `membership_id uuid`, `permission_key text`, `effect allow|deny` | PK workspace/member/permission; deny overrides role allow; Owner administrative authority protected, not removable by a lower base level |
| `workspace_invitations` / identity | `email_normalized text`, `token_hash bytea`, `base_level admin|user`, `role_id uuid`, `invited_by uuid`, `expires_at`, `accepted_at`, `revoked_at` | Unique token hash; one live invite per workspace/email (maintain terminal state explicitly); never store raw token; accept only authenticated verified matching email; default 7-day expiry |

A signup transaction creates profile, workspace, default roles/grants, and its Owner
membership atomically using a narrowly scoped Auth bootstrap trigger. Display/workspace
names from user metadata are untrusted input, never authorization facts. Bootstrap also
creates one default disabled assignment rule (pool tier 0, 60-second acknowledgement
window, 3,600-second idle threshold) and an Offline availability row for the Owner. An
empty/disabled pool uses custody; activation requires valid configured member references.
Default values are editable persistent configuration, not hidden runtime constants. New accounts
created through invitations still have their signup workspace; accepting an invitation
adds membership to the target and does not transfer ownership. Return verified session
only according to Auth email-confirmation settings. Bootstrap failure rejects the signup
transaction rather than leaving a registered account without its required workspace.

## CRM and pipeline data

| Entity / owner | Exact domain columns | Constraints, indexes and deletion |
| --- | --- | --- |
| `customer_companies` / CRM | `name`, `website nullable`, `archived_at nullable`, `created_by uuid` | Workspace/name search index; archive by default; hard delete only with no references and audit |
| `contacts` / CRM | `company_id nullable`, `owner_membership_id nullable`, `name`, `phone_e164 nullable`, `email_normalized nullable`, `opted_out_at nullable`, `archived_at nullable` | Partial unique workspace/phone where nonnull (one canonical phone); company FK RESTRICT; index workspace/owner/created_at/id; explicit merge workflow for collisions |
| `pipelines` / CRM | `name`, `archived_at nullable` | Unique live workspace/name; multiple pipelines allowed; no delete while opportunities exist |
| `pipeline_stages` / CRM | `pipeline_id`, `name`, `position int`, `outcome open|won|lost` | Unique workspace/pipeline/position DEFERRABLE for reorder; unique `(workspace_id,pipeline_id,id)`; deleting occupied stage requires explicit destination in same pipeline in one transaction |
| `opportunities` / CRM | `contact_id not null`, `company_id nullable`, `owner_membership_id nullable`, `pipeline_id`, `stage_id`, `title`, `closed_at nullable`, `archived_at nullable` | Composite stage FK includes pipeline; company must match contact when populated (checked command/trigger); index workspace/pipeline/stage/owner and contact/created_at |
| `private.opportunity_financials` / CRM | `opportunity_id`, `amount_minor bigint`, `currency text` | PK workspace/opportunity; amount >=0; separate RLS permission `crm.values.view`; no direct browser/realtime publication; delete only with opportunity according to retention |
| `custom_field_definitions` / CRM | `entity_kind contact|company|opportunity`, `pipeline_id nullable`, `key`, `label`, `value_type text|number|date|dropdown|checkbox`, `options jsonb`, `archived_at nullable` | Pipeline only allowed for opportunity; unique scope/entity/pipeline/key using NULLS NOT DISTINCT; options validated unique immutable keys; type change requires explicit conversion migration |
| `custom_field_values` / CRM | `field_id`, `contact_id nullable`, `company_id nullable`, `opportunity_id nullable`, `value jsonb` | Exactly one target via num_nonnulls=1; three real composite target FKs; partial unique target/field indexes; trigger checks target kind, same pipeline and value type/options; archived definition remains readable historically |
| `stage_required_fields` / CRM | `stage_id`, `field_id` | PK workspace/stage/field; require definition applies to stage's pipeline and is active; moving opportunity checks values in same locked transaction |
| `tags` / CRM | `name`, `color_token nullable` | Unique workspace/lower(name); no arbitrary CSS/HTML values |
| `record_tags` / CRM | `tag_id`, `contact_id nullable`, `opportunity_id nullable` | Exactly one real target; partial unique target/tag; removal audited as relevant configuration/record change |
| `saved_filters` / CRM | `created_by`, `entity_kind contact|opportunity`, `name`, `visibility personal|workspace`, `filter_ast jsonb` | Validated allowlisted AST, not SQL; index workspace/creator; reevaluate current records and permissions on every read |
| `activity_entries` / CRM | `contact_id nullable`, `opportunity_id nullable`, `lead_id nullable`, `actor_membership_id nullable`, `kind`, `occurred_at`, `summary`, `source_event_id nullable`, `note_text nullable` | At least one valid related target; unique workspace/source_event_id/kind/target projection; indexes each target/occurred_at/id; notes may be edited only through versioned service with audit, system facts append-only |

Text/number/date/dropdown/checkbox JSON values are respectively string, JSON number,
ISO date string, configured option key string, and boolean. Numbers have bounded
precision/size; no NaN/Infinity. Definition updates validate existing values and required
stage constraints; no silent data dropping. Tags/filters enforce read scope and protected
value permission on filtering/export, not only rendering.

## Lead engine: one source of current ownership

| Entity | Domain columns | Constraints / indexes |
| --- | --- | --- |
| `employee_availability` | `membership_id`, `status available|busy|on_leave|offline`, `open_lead_limit int`, `changed_by` | PK workspace/membership; limit >=1; active membership required; no browser-presence inference |
| `assignment_rules` | `name`, `is_default bool`, `enabled bool`, `cursor bigint`, `idle_threshold_seconds int`, `version` | One default rule per workspace (partial unique workspace where is_default); validate positive configurable-second thresholds and tiers before enable |
| `assignment_rule_members` | `rule_id`, `membership_id`, `position int` | Unique rule/member and rule/position; stable ordered round robin |
| `assignment_tiers` | `rule_id`, `level int`, `kind pool|backup|manager`, `membership_id nullable`, `ack_window_seconds int` | PK workspace/rule/level; contiguous levels; target member required for backup/manager; same eligibility checks at every level |
| `lead_intake_endpoints` | `public_id uuid`, `name`, `enabled bool`, `allowed_fields jsonb`, `allowed_origins text[]`, `rate_limit_config jsonb`, `created_by` | Unique public_id maps trusted endpoint to workspace; public may submit only, never read config/tenant records; disabling stops new intake |
| `leads` | `contact_id`, `opportunity_id nullable`, `conversation_id nullable`, `source form|message|manual`, `source_reference nullable`, `intake_key text`, `state open|closed`, `accountable_membership_id not null`, `ownership_mode operational|custody`, `rule_id`, `rule_version`, `tier_level int`, `assignment_version bigint`, `assignment_cycle_id uuid`, `first_assigned_at nullable`, `assigned_at nullable`, `ack_deadline_at nullable`, `acknowledged_at nullable`, `first_acknowledged_at nullable`, `last_action_at`, `escalation_count int`, `recovery_flags text[]`, `closed_at nullable` | Unique workspace/intake_key; partial unique workspace/conversation_id for open leads when nonnull; conversation/contact relationship checked; exactly one nonnull owner FK; operational rows require assignment timestamps/deadline until acknowledged; custody on fresh intake has null assignment timestamps; closed rows no active deadline; indexes workspace/state/owner, workspace/contact, partial workspace/ack_deadline_at where open unacknowledged operational, workspace/last_action_at |
| `lead_assignment_history` | `lead_id`, `assignment_version`, `assignment_cycle_id`, `from_membership_id nullable`, `to_membership_id`, `mode operational|custody`, `reason initial|deadline_expired|manual|absence|eligibility_recovered|custody`, `actor_membership_id nullable`, `occurred_at`, `tier_level` | Unique workspace/lead/assignment_version; append-only transition facts. Current owner exists only on leads, not a second editable active-assignment table |
| `lead_acknowledgements` | `lead_id`, `assignment_version`, `actor_membership_id`, `action_kind explicit|note|message|call_log|stage_change|appointment`, `source_action_id`, `occurred_at` | Unique workspace/lead/assignment_version; FK to assignment history; actor must be current operational owner; only domain service can insert |

Escalation history is the subset of assignment history with reason `deadline_expired`;
no redundant mutable escalation table. Count increments only for actual automatic
reassignment due to timeout, not absence/manual transfer or an unsuccessful candidate
search. Recovery is a derived authorized query, not a separate editable ownership queue.
Rule changes apply to future transitions; existing deadline and snapshotted rule version
remain stable unless an explicit audited migration reconfigures active assignments.

## Providers, money, appointments and durable work

| Entity / owner | Domain columns | Constraints, indexes and sensitive handling |
| --- | --- | --- |
| `integration_connections` / integrations | `provider textbee|safepay|google|telegram`, `membership_id nullable`, `status disconnected|connected|error|reconnect_required`, `provider_account_ref`, `public_endpoint_id`, `last_success_at`, `last_error_code`, `config jsonb`, `version` | Workspace-scoped connection; employee key required for Google; uniqueness provider/account endpoint rules prevent ambiguous routing; status/config contains no credentials |
| `private.integration_secrets` / integrations | `connection_id`, `key_version`, `ciphertext bytea`, `nonce bytea`, `auth_tag bytea` | PK workspace/connection; AES-256-GCM envelope encryption; key outside DB; workspace/connection/version authenticated as AAD; no Data API grants |
| `private.oauth_states` / calendar | `state_hash`, `membership_id`, `connection_id`, `pkce_verifier_ciphertext`, `redirect_path`, `expires_at`, `used_at` | One-use state hash, 10-minute expiry; bind actor/workspace/redirect allowlist; tokens encrypted in integration secrets |
| `conversations` / messaging | `contact_id`, `channel whatsapp|sms`, `connection_id`, `owner_membership_id`, `last_message_at` | Unique workspace/connection/contact/channel; owner changes through explicit lead/conversation service policy, not by adapter |
| `messages` / messaging | `conversation_id`, `connection_id`, `origin_lead_id nullable`, `origin_assignment_version nullable`, `origin_actor_membership_id nullable`, `direction inbound|outbound`, `body`, `provider_message_ref nullable` (Textbee `smsId`), `provider_batch_ref nullable` (Textbee `smsBatchId`), `provider_state nullable` (original state for diagnostics), `state received|pending|sent|delivered|failed|unknown`, `failure_code nullable`, `requested_by nullable`, `received_at nullable`, `sent_at`, `delivered_at`, `client_request_key nullable` | Composite connection FK and consistency with conversation; origin context all-or-none, FK to lead assignment history; unique connection/provider message ref if present; outbound unique workspace/client key; preserve inbound provider `receivedAt` in `received_at`; correlate per-recipient statuses by both `smsId` and `smsBatchId`; `UNKNOWN_STATE` maps to `unknown`, never `failed`; body private to authorized conversation viewers; failed/unknown rows retained |
| `payment_requests` / payments | `opportunity_id`, `contact_id`, `requested_by`, `connection_id`, `amount_minor`, `currency`, `provider_tracker_ref nullable`, `provider_payment_ref nullable`, `checkout_url nullable`, `client_request_key text`, `state pending|open|abandoned|expired|policy_expired|failed|paid|partially_refunded|refunded`, `provider_expires_at nullable`, `application_policy_expires_at nullable`, `paid_at nullable` | Unique connection/tracker and client key; amount >0; contact/opportunity relationship checked; URL allowlisted Safepay HTTPS; only provider-confirmed event/reconciliation sets `expired`; local policy deadline sets `policy_expired`; late provider-confirmed payment may reconcile a policy-expired request to paid; browser redirect never proves payment |
| `private.payment_events` / payments | `payment_request_id`, `connection_id`, `provider_event_id` (Safepay top-level token), `provider_tracker_ref`, `provider_payment_ref nullable`, `kind payment_confirmed|refund_confirmed|payment_failed|provider_expired|abandoned`, `amount_minor nullable`, `currency nullable`, `occurred_at nullable` (provider event time), `received_at`, `provider_refund_ref nullable` | Composite FK to payment request and connection, with matching connection enforced; unique connection/event and nonnull refund ref; only verified `payment.refunded` with valid `refund_amount` creates `refund_confirmed`; do not treat refund initiation as completion; successful/refund facts require amounts and currency, failure/expiry may omit them; immutable money facts and monotonic reconciliation prevent duplicate/late event regression; read only through permitted projections |
| `calendar_connections` / calendar | `integration_connection_id`, `membership_id`, `calendar_ref`, `timezone`, `last_sync_at`, `sync_token nullable` | Common UUID id PK plus unique(workspace_id,id) and unique(workspace_id,integration_connection_id); one active primary selected calendar per member; tokens only in encrypted secrets; revoked status inherited from integration metadata |
| `appointments` / calendar | `contact_id`, `opportunity_id nullable`, `employee_membership_id`, `calendar_connection_id`, `starts_at`, `ends_at`, `timezone`, `provider_event_ref`, `provider_etag nullable`, `state pending|confirmed|rescheduling|cancelling|cancelled|failed|conflict`, `request_key`, `requested_by`, `origin_lead_id nullable`, `origin_assignment_version nullable`, `origin_actor_membership_id nullable`, `failure_code` | Origin context all-or-none and assignment-history FK; end > start; unique connection/event; workspace/request idempotency; current change preserves old confirmed times until remote confirms replacement; actual overlap exclusion lives on appointment_reservations below |
| `private.calendar_operations` / calendar | `appointment_id`, `kind create|reschedule|cancel`, `requested_by`, `expected_appointment_version`, `desired_starts_at nullable`, `desired_ends_at nullable`, `desired_timezone nullable`, `expected_provider_etag nullable`, `state pending|running|confirmed|failed|unknown`, `request_key`, `origin_lead_id nullable`, `origin_assignment_version nullable`, `origin_actor_membership_id nullable` | One nonterminal operation per appointment; immutable requested range/actor/precondition survives restart; job references operation ID; composite FKs/context checks |
| `appointment_reservations` / calendar | `appointment_id`, `operation_id nullable`, `employee_membership_id`, `starts_at`, `ends_at`, `kind current|proposed`, `released_at nullable` | Active workspace/employee range exclusion using btree_gist and tstzrange '[)'; at most one current and one proposed per appointment; replacement range may overlap its own current range only, never another appointment; implement exclusion strategy described below |
| `notification_destinations` / notifications | `membership_id`, `connection_id`, `chat_id text`, `verified_at nullable`, `enabled bool` | Unique workspace/member/provider connection; only owner member/admin-authorized update; chat ID treated as sensitive contact data; verification challenge before enabling |
| `notification_deliveries` / notifications | `event_id`, `lead_id`, `recipient_membership_id`, `destination_id nullable`, `state pending|sent|failed|unknown`, `provider_message_ref nullable`, `sent_at`, `last_error_code` | Unique workspace/event/recipient (Telegram is the chosen channel); missing destination produces visible failure; no silent skip; safe minimal content |
| `private.integration_events` / integrations | `connection_id`, `direction inbound|outbound`, `provider_event_ref`, `event_type`, `payload_ciphertext nullable`, `payload_hash`, `authenticity verified|rejected`, `state received|processed|failed|ignored`, `received_at`, `processed_at`, `safe_error_code` | Unique connection/provider inbound event identity; rejection records store safe metadata/hash only; encrypted normalized payload retention bounded; no raw payment/card body |
| `private.integration_attempts` / integrations | `integration_event_id`, `attempt_no`, `started_at`, `finished_at`, `result success|temporary_failure|permanent_failure|unknown`, `http_status`, `provider_reference`, `safe_error_code` | Unique event/attempt; redacted inbound/outbound history, no credential URLs |
| `private.domain_events` / jobs | `id`, `workspace_id`, `name`, `schema_version int`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `occurred_at`, `actor_kind user|system|provider`, `actor_id nullable`, `correlation_id`, `causation_id nullable`, `payload jsonb` | Immutable, unique aggregate/version/name where event semantics require it; no secrets/card data; API never exposes raw event table |
| `private.outbox_jobs` / jobs | `event_id nullable`, `kind`, `dedupe_key`, `payload jsonb`, `state pending|running|succeeded|failed`, `available_at`, `attempts`, `max_attempts`, `lease_token uuid nullable`, `lease_until nullable`, `last_error_code`, `completed_at` | Unique workspace/kind/dedupe_key; partial available_at/id index pending/running; token-checked finish; dead jobs retained for authorized inspection |
| `private.consumer_receipts` / jobs | `consumer_name`, `event_id`, `processed_at` | PK consumer/event; receipt and domain effects commit atomically |
| `private.idempotency_requests` / API | `membership_id nullable`, `actor_scope text not null`, `scope`, `key`, `request_hash`, `state`, `response_code`, `response_json`, `expires_at` | Unique workspace/actor_scope/scope/key; actor_scope is server-derived member:<membershipId> or public:<endpointId>, never nullable; mismatch returns conflict; no credentials or secret responses in cache; 24h minimum replay retention |
| `private.worker_dispatch_receipts` / jobs | `nonce uuid primary key`, `signed_at timestamptz`, `accepted_at timestamptz` | One-use dispatch nonce after HMAC/timestamp verification; short retention exceeds replay tolerance; no anonymous EXECUTE |
| `audit_entries` / audit | `actor_kind`, `actor_membership_id nullable`, `event_type`, `target_type`, `target_id uuid`, `before_json`, `after_json`, `occurred_at`, `correlation_id`, `source_event_id nullable` | Append-only; index workspace/occurred_at/id, event_type, actor; sensitive values redacted or in separately protected payload; deletion targets are immutable identity references, not cascading FKs |
| `dashboard_preferences` / dashboard | `membership_id`, `visible_widget_ids text[]` | PK workspace/membership; allowlisted widget identifiers; only own preferences writable |

Payment/refund facts store positive amounts; accounting totals are signed. Dashboard separately reports gross payments received, confirmed refunds and signed net
collected revenue by currency. A dashboard month sums captures confirmed in that workspace-local month minus refunds confirmed in
that month, even when the capture was earlier; net monthly totals may be negative. Lifetime
collected revenue is all confirmed captures minus all confirmed refunds.

Payment accounting sums one confirmed capture per provider payment reference and one
confirmed debit per provider refund reference, grouped by currency. Distinct webhook
event IDs can describe the same payment: semantic money uniqueness is required as well
as event deduplication. The migration must implement unique confirmed payment/refund
object indexes, not rely on the abbreviated event-identity index alone.

## Calendar reservations and related-record scope

A requested reschedule creates a durable calendar operation and proposed reservation in
the same transaction, while preserving the current reservation and appointment times.
To permit a replacement overlapping its own old range without allowing other bookings,
use a NOLOGIN-definer checked command that locks the employee booking guard row first,
then checks overlaps against all other appointment IDs. The GiST exclusion constraint
uses `(workspace_id =, employee_membership_id =, appointment_id <>, range &&)` with
btree_gist operators: ranges for the same appointment may overlap, different appointments
may not. Test exact operator support/DDL in migration verification; if deployment version
cannot support it, use the serialized guard + constraint trigger, not an incorrect ordinary
exclusion blocking self-overlap. On confirmed replace, release current, promote proposed,
update appointment/version and activity together. On permanent failure release proposed
only; unknown outcome retains both until provider reconciliation. Cancellation releases
current only after remote confirmation. Provider calls never hold booking locks.

Current operational lead ownership grants *related record scope* only when the caller
also has that resource's view permission: linked contact/company/opportunity can be read
without rewriting their independent owner columns. Company access is restricted to the
permitted related record projection, not all sibling contacts. `leads.conversation_id`
identifies an optional message-origin conversation; its owner projection changes atomically
with that lead's owner, and one open lead per conversation prevents conflicting projections.
A new assignee needs messaging.view to read it; previous lead owner loses that derived
scope immediately unless another independent ownership/view-all grant permits it. Complete
customer view composes each allowed subresource independently; no permission expansion
through contact association, tags, exports or activity. Message sends/appointments persist
origin actor/lead/assignment version, and confirmation rechecks that exact epoch (not just
same member ID), current deadline and permissions before qualifying acknowledgement.

## Transaction/locking contract

All workspace ownership/capacity/rule mutations lock the workspace row first. Thereafter
lock membership/availability rows by UUID order, then lead IDs by UUID order, then other
rows. Worker selects/locks candidate workspace rows with `FOR UPDATE SKIP LOCKED` before
locking its due leads; it must not lock a lead before its workspace. This intentionally
serializes allocation within a 5–30-person workspace and prevents limit oversubscription,
cursor races and absence/acknowledgement deadlocks. Revisit only with measured need.

A lead transition writes owner/mode/version/deadline, immutable history, audit, activity,
domain event and outbox in one transaction. At most one assignment_version increment per
actual ownership transition. Stale ack/deadline tasks check current version. Database
clock decides deadlines. Jobs/provider calls never hold a workspace/domain lock across HTTP.
CRM stage moves and required-field validation share one transaction/row lock. Optimistic
`expectedVersion` rejects conflicting ordinary edits rather than silently overwriting.

## RLS and command access

- `authenticated` receives only explicitly reviewed SELECT grants; ordinary direct DML
  to membership, permissions, financials, leads, history, jobs and audit is revoked.
- Every read policy requires active workspace membership and resource/record permission.
  Personal CRM/lead/message policies require permitted ownership unless a view-all grant
  applies. Admin cannot mutate Owner through any command. Revoked membership denies
  access immediately based on database state, not stale role claims.
- `private.has_permission(workspace_id,key)` is a narrowly scoped, fixed-search-path
  authorization helper reading trusted membership/grants. It binds actor to `auth.uid()`,
  never user_metadata; all names fully qualified. It can use a reviewed definer context
  only to avoid policy recursion on authorization tables, never return arbitrary rows.
- Domain command RPCs are reviewed `SECURITY DEFINER` wrappers where needed to permit
  transactions while denying direct DML. Revoke EXECUTE from PUBLIC/anon by default;
  grant only named commands to authenticated. Pin empty search_path and recheck actor,
  workspace, session revocation, permission, record scope and inputs inside every command.
  Use a dedicated NOLOGIN/NOBYPASSRLS executor role with explicit grants, not unrestricted
  postgres/service_role for user commands. Test RLS and privilege boundaries separately.
- Views use `security_invoker=true`; no unsafe owner-bypassing view is exposed. Sensitive
  field permission applies to detail/list/export/filter/audit projections. Financials,
  tokens, inbox and raw events have no broad browser grants.
- Worker/provider privileged functions live in private schema with explicit narrow
  execution grants. Internal dispatch authentication is separate from user Auth. Fixed
  system actor is recorded; the request cannot choose an arbitrary user actor.

## Deletion, migrations and operational recovery

Archive tenant records by default. Refuse deletion of active Owner, occupied stages,
referenced contacts or members without a coordinated transfer/archive plan. Historical
actors remain identifiable after deactivation. Workspace deletion is an administrator-led
retention operation, not routine cascading CRUD. Audit and money facts do not cascade.

Create migrations with the installed CLI, never invent an applied timestamp. One database
steward allocates sequence/order. Validate fresh reset and upgrade of prior schema, actual
constraints/indexes/RLS/grants, seed setup and rollback/forward-repair. Never change an
already shared applied migration. Pin CLI/tool package versions, record actual server
extension versions, and do not pin CREATE EXTENSION versions now ignored by Supabase.
No production database changes are part of this proposed contract.
