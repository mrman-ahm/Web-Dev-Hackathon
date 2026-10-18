# Security architecture

Status: approved implementation contract (2026-10-18); no security control is claimed deployed.
Cross-cutting requirements: F1.3–F1.6, F4, I1.2/I2.3/I3.2/I5 and Q1–Q5/Q13.

## Identity, session and request boundary

Supabase Auth owns salted password hashing, confirmation, login rate limits and refresh
sessions. Use PKCE and server-verified identity; never authorize from getSession's raw
cookie user or editable user_metadata. Current Supabase SSR guidance uses verified claims
for page protection and getUser where fresh user state is needed. For sensitive commands,
validate the session_id against active Auth session state or an equivalent server revocation
check, not only JWT signature. Membership/permissions always come from current DB rows.
[SSR reference](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

Cookies use Secure in deployed HTTPS and appropriate SameSite; preserve refreshed cookies
and cache headers through Next Proxy. All user/session responses are private/no-store.
Origin/Host allowlists and CSRF tokens where needed protect cookie-authenticated writes;
GET never mutates business data. Public forms have endpoint limits, validation and abuse
controls. Provider routes are exempt only from user CSRF, not provider authentication.

## Authorization model

Permission catalog proposed keys: `workspace.manage`, `members.view/manage`,
`members.availability.manage`, `permissions.manage`, `crm.contacts.*`, `crm.companies.*`,
`crm.opportunities.*` where * = view/create/edit/delete/export, `crm.values.view/edit`,
`crm.configure`, `crm.records.view_all`, `crm.filters.share`, `assignment.manage`,
`leads.view/create/edit/reassign`, `leads.view_all`, `leads.recovery.view/accept`,
`messaging.view/send`, `messaging.view_all`, `payments.view/create/send`,
`calendar.view/book`, `integrations.view/manage`, `integrations.history.view`,
`integrations.calendar.connect_own`, `notifications.destination.manage_own`,
`notifications.failures.view`, `audit.view`, `dashboard.view/company.view`.
Expand wildcard text into explicit catalog rows; do not use runtime glob permissions.

Owner has protected workspace/ownership authority. Admin defaults may configure business
resources but cannot alter Owner authority/membership. User defaults to own-record scope;
custom roles (including Manager) supply grants independently of names. Per-member deny
beats role allow; Owner administrative safety cannot be removed by a lower actor.
Default employee grants include own calendar connect/disconnect and own notification
destination management; these are explicit integration permissions and can be revoked.
Workspace bot/Twilio/Stripe credentials remain integrations.manage only. An Admin cannot
perform OAuth consent as another employee. Export/view/edit are distinct; record read scope and field rights remain necessary even
when a broad endpoint permission passes. Invitation roles/tokens cannot grant Owner.

Before data access: authenticate → active workspace membership → operation permission →
record/field scope → validation → checked DB command/RLS → explicit DTO projection.
A path workspace is a requested scope, never proof of membership. Composite workspace FKs
prevent cross-tenant relationships. Direct Data API/RPC attempts must fail as well as HTTP
attempts. RLS helpers and views follow the database contract; no public definer shortcut.

## Field-level and realtime protection

Opportunity financials are separately protected; API list/detail/export/filter/audit and
metric paths all honor `crm.values.view`. DTO uses explicit visible/hidden union; omit
values before serialization. Do not fetch secret columns into client state and hide them.
Raw message/payment/token/event tables are not published to Realtime. Private per-member
invalidation has no business values; authoritative refetch rechecks current grants.
Revocation removes/refuses future API data even if an existing socket's join policy is cached.

## Secrets, providers and privileged code

Per-workspace server-only credentials are encrypted with authenticated workspace/connection
AAD and versioned master key outside DB. Only authorized orchestration accesses them; never
log ciphertext/plaintext dumps, tokens, card data, customer messages or credential URLs.
OAuth states are one-use and actor-bound; refresh/revocation failure is actionable.
Provider signatures validate original request material before trusting any payload IDs.
Replay resistance combines signature timestamp checks where supported with durable event
and semantic object dedupe. Twilio lacks generic timestamp replay protection, so its
provider IDs and domain idempotency are essential; never invent a signature timestamp.

Ordinary user requests do not use service role. Worker/provider contexts are narrowly
scoped, authenticated separately and map workspace from verified connection metadata.
Internal job endpoint uses high-entropy rotated credential in Vault/server environment,
constant-time comparison, short timestamp tolerance and durable nonce receipt. Untrusted
requests cannot choose arbitrary workspace/actor. No privileged public/browser client.

## Data integrity, audit and logging

Audits append in the domain transaction with actor derived by server/DB; no audit PATCH/
DELETE endpoints or ordinary UPDATE/DELETE grants. Preserve history on record deletion.
Application tamper resistance does not claim protection from a database administrator;
operator retention/backups/export policy is separately reviewed. Mask sensitive before/
after fields for viewers lacking matching field permission. Provider rejection evidence
stores safe metadata/hash, not attacker-controlled bodies.

Bound inputs, parameterize SQL, encode output, reject HTML execution/unsafe URL protocols,
validate imports and file content. Logs use correlation IDs and safe enumerated codes;
observability has least-privilege access/retention. Synthetic fixtures only. Security
verification covers forged sessions/signatures, stale grants, CSRF, direct cross-tenant
IDs, privilege escalation, function EXECUTE grants, protected-field leaks and audit mutation.
