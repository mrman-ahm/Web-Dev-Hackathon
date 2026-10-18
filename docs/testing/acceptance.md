# Acceptance and verification strategy

This is planned evidence, not passing test results. [Traceability](../requirements/traceability.md)
contains all 81 exact acceptance criteria. Tag tests/evidence by those IDs. A product
requirement is Verified only when its whole acceptance criterion has observed evidence;
a single passing unit test, scaffold or green build cannot establish full F1 or I1.

## Foundation B contract review

Check source-ID uniqueness/count and exact acceptance text against the versioned DOCX;
link integrity; entity references/constraints; DTO/event/schema names; permission keys;
no-eligible custody vs operational assignment; transaction lock ordering; durable deadlines,
leases/replay; protected-value/read/realtime boundaries; cross-provider failure isolation.
Independent architect review reports findings with severity and exact contract location.
Fix blocking contradictions, preserve limitations, then request primary human design review.
Proposals are not accepted merely because an agent found no additional issue.

## First-wave core vertical acceptance

Core implementation must provide meaningful unit, live Supabase integration and browser
checks, with actual commands documented in the scaffolding PR. Use isolated local/test
resources and synthetic people only; no production data.

| Scenario | Required observed evidence | Requirements covered partially |
| --- | --- | --- |
| Owner signup | Through real Supabase Auth, new user creates exactly one signup workspace, active Owner and seeded grants; invalid/bootstrap failure leaves no partial required state | F1.1, F1.2, Q1, Q4, Q6 |
| Login/logout/session | Real login; refresh retains session; expired access refreshes safely; logout ends/revokes requested session and protected APIs deny subsequent access | F1.1, Q1 |
| Persist workspace-scoped data | Authorized update/read of real workspace settings, version conflict test; state survives application process restart | F1.6, Q4, Q6 |
| Server authorization | Direct API/RPC/Data API attempts without membership/grant reject, regardless of hidden controls; no service-role shortcut | F1.3–F1.6, Q2 |
| Cross-tenant isolation | Two signed-in users in separate workspaces; guessed IDs, forged relation references and direct table requests deny; no response/Realtime money/token leak | F1.4–F1.6, Q2/Q3 |
| Migrations and audit | Fresh local DB setup/reset plus upgrade path; audit appended with trusted actor; ordinary API/SQL identities cannot alter/delete history | F4.1/F4.3, Q4/Q13 |
| Restart durability | Stop/start application and test database without deleting volume; persisted workspace/membership/config remain and authentication recovers according to session policy | Q5/Q6 |

Do not mark invitations, full granular role administration or every F1 criterion complete
until those are implemented and separately tested. Test session cookie/CDN/CSRF boundaries,
not merely mocked Auth methods. Unit mocks are useful for orchestration failure cases but
are explicitly distinguished from live Auth/database acceptance.

## UI foundation acceptance

Typed primitives render in isolation; schema-parsed synthetic preview fixtures are visibly
labeled and excluded from live routes. Test button/input native props and refs, form
labels/errors, table row keys/pagination, dialog focus trap/return/Escape, loading/empty/
error/retry, and navigation callbacks. No component imports domain repositories/provider
SDKs or derives new authorization semantics. DashboardView consumes DashboardSnapshot;
restricted money never appears in DOM, accessible names, serialized props or snapshots.

Browser checks at phone 390x844, tablet 768x1024 and desktop 1440x900 verify no hidden
controls/unintended page overflow. Keyboard-only navigation covers skip link, sidebar,
forms, dialogs and focus restoration. Include automated accessibility smoke checks and
manual contrast/focus evidence where automation is insufficient. Component tests are
necessary but not sufficient for responsive behavior. UI foundation remains independently
reviewable from core backend logic via the stable presentation contract.

## Later required suites

- CRM: relationships, all five field types, distinct pipelines, occupied-stage deletion,
  required-field stage move, >=3 combined filters, dynamically updating saved filters,
  complete customer activity view and protected exports.
- Leads: competing workers/capacity, ack-vs-expiry, absence, manual-vs-escalation count,
  repeated/idle/overdue recovery, custody, rule changes, stale jobs and restart deadlines.
- Webhooks: real provider-triggered sandbox delivery plus forged/altered signatures,
  repeated/out-of-order events, contact/lead semantic dedupe and provider outage isolation.
- Money: provider-confirmed captures/refunds, partial refunds, late failures, duplicate
  distinct event types for one payment, multiple currencies, all requested outcome states.
- Calendar: real consent/disconnect/refresh/revocation, free/busy, local/external conflict,
  ambiguous DST/timezone cases, confirmed reschedule/cancel and history.
- Telegram: real routed alert within 60 seconds; no destination/permanent/429/timeout
  handling; bounded retries, visible failed/unknown state and safe content.
- Dashboard: all eight real figures, glossary reconciliation, correct local periods,
  own/company permissions, >=3 permitted drill-downs, saved visibility and live updates.
- Security/audit/realtime: direct bypass tests, revoked membership/grants/session,
  immutable history, safe before/after projection and two-workspace private channels.
- Operations: fresh clone setup, synthetic seed, scheduled job/worker observability,
  backup/restore drill and public HTTPS verification for real integration acceptance.

## Independent review regression scenarios

Intake before rule activation and duplicate anonymous request with changed content;
reschedule crash/restart and overlapping replacement, failed replace preserving old slot;
new assignee's permitted related-customer/conversation scope and previous assignee denial;
late message/appointment confirmation after assignment away and back to the same actor;
same-owner transfer rejection, full escalation-chain exhaustion and explicit late recovery;
refund in a later month producing negative net total; restricted metric with no serialized
value; self-service calendar/destination success and explicit permission denial. These
pin review findings to later real database/API/browser tests, not documentation-only claims.

## Evidence and CI activation

Each PR records commands, tool/runtime versions, environment, results, blocked/skipped
checks and acceptance IDs. Initial CI adds frozen lockfile install, lint, strict typecheck,
unit/component tests and build. Database CI uses a disposable Supabase environment with
fresh migrations/RLS/command tests; live-provider smoke runs are separately authorized
with test credentials, never production secrets exposed to untrusted PR code. E2E starts
actual app/test DB, not a static screenshot. Do not create permanently skipped jobs that
suggest absent behavior passed. Keep routine checks risk-proportionate per AGENTS.

Product release remains blocked until all required acceptance is evidenced; first-wave
success is not the complete problem statement. The first integrated milestone is real
intake → one operational owner/custody → persisted deadline → atomic escalation → actual
Telegram alert → audit/activity → permitted live dashboard/drill-down.

Monthly reporting checks distinguish gross payments received from signed net collections
after confirmed refunds, retain currency grouping and permit negative net totals. Five-
second cadence is verified against installed Supabase/pg_cron and scheduler health during
implementation; it never guarantees real notification receipt by itself.
