# Engineering standards

These are acceptance standards for future implementation, not claims about existing code.

## Backend and domain boundaries

- Use strict TypeScript; do not silence errors with unbounded `any` or unchecked casts.
  Keep domain rules in modules, data access in explicit boundaries, and handlers thin.
- Validate every external input server-side, including identifiers, imports and provider
  payloads. Use typed request/response schemas; client validation is for feedback only.
- Authenticate, establish workspace membership, and authorize operation/field access
  before protected data access. Enforce on APIs, jobs, exports and subscriptions.
- Return stable error codes and useful safe messages; keep internal details in redacted
  structured logs with correlation IDs. Never swallow failures or return false success.
- Define transaction boundaries around business invariants. Use database constraints,
  locks/version checks and idempotency keys; browser state cannot enforce correctness.
- Make retries bounded and safe. Persist job intent, deadlines, attempts and outcomes;
  recover after restart. Do not rely on in-memory or browser timers for escalation.

## Database and metrics

- Scope tenant records and relationships to the workspace; use PostgreSQL RLS as defense
  in depth alongside server permissions. Privileged clients must be narrowly scoped.
  Explicitly test cross-tenant identifiers and service-role paths.
- Enforce foreign keys, required values, uniqueness and valid state transitions in the
  database. Assign/escalate atomically with exactly one active accountable owner.
  Handle simultaneous workers, stale versions, duplicate events and no-eligible-owner cases.
- Use reviewed versioned migrations. Never edit an applied shared migration; add a
  corrective one. Include fresh-setup, upgrade, rollback/forward-repair and data-loss evidence.
- Define deletion behavior for related records and occupied stages before exposing it.
  Preserve audit entries; no application endpoint may edit/delete audit history.
- Persist provider event IDs with appropriate workspace/provider uniqueness. Commit
  deduplication and effects atomically; do not acknowledge success before durable recording.
- Derive metrics from the source glossary. First response is first assignment to first
  acknowledgement; manual reassignment is separate from escalation. Recovery includes
  overdue acknowledgement, two or more escalations, or configured inactivity. Open value
  excludes won/lost opportunities. Collected revenue is provider-confirmed payments minus
  confirmed refunds. Define workspace timezone boundaries and currency handling in Foundation B.

## Frontend

- Use agreed shared tokens/components and typed contracts; keep domain policy out of
  presentation components. Mask protected values in every output including exports.
- Support phone/tablet/laptop, semantic controls, labels, keyboard access, visible focus,
  meaningful contrast and non-color status cues. Manage dialog focus and error associations.
- Provide loading, empty, success, failure and actionable recovery states. Validate forms
  accessibly. Confirm destructive actions; paginate large lists and keep filtering responsive.
- Show fixtures as fixtures. No hardcoded successes, decorative integrations, fabricated
  live metrics, or projected revenue labeled as collected revenue.

## Integrations and security

- Verify signatures against the provider-required original request/body/URL before
  side effects. Reject and record forgery safely; validate authenticated payload content too.
- Keep OAuth tokens, signing secrets, privileged database keys and provider credentials
  server-side, encrypted/access-controlled as appropriate. Never log or return full secrets.
- Check workspace and integration permission on connection changes; audit them. Isolate
  failures between providers and record inbound/outbound references, attempts and outcomes.
- Deduplicate inbound events. Use provider idempotency support or reconciliation for
  uncertain outbound results. Never blindly retry a non-idempotent operation.
- Classify temporary/permanent failures; bound attempts, use delay/backoff, expose exhausted
  retries to authorized staff and permit safe recovery. Follow opt-outs and provider limits.
- Enforce least privilege, expiring/revocable sessions, login abuse protection, safe output
  encoding, parameterized queries, and applicable CSRF protection. Treat uploads as untrusted.
- Payment card entry stays on hosted provider pages; never store/log card numbers.
  Redact personal data in logs, fixtures, screenshots and PR evidence.
- All real webhook verification requires reachable HTTPS and provider sandbox evidence;
  mocks may test logic but do not establish integration completeness.

## Testing and completion

Use unit tests for rules; database integration tests for constraints/RLS/transactions;
concurrency tests for duplicate/competing assignment, escalation and webhook work;
security tests for direct API denial, tenant/field access and forgery; end-to-end tests
for critical user flows; provider sandbox tests for actual delivery and reconciliation.
Include restart/retry tests for durable automation, accessibility/responsive evidence for
UI, and acceptance criteria tied to official requirement IDs. Test failure paths as well
as happy paths. Keep deterministic fixtures synthetic and isolated from production.
Run checks relevant to the change and report commands/outcomes/limitations. No passing
claim from inspection alone. Exact commands are activated with scaffolding, as described
in [testing](testing.md). No required product behavior may be omitted for a hackathon deadline.
