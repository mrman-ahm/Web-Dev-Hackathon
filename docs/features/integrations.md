# Integration architecture

Status: approved provider boundaries (2026-10-18); no integration is implemented or real acceptance
claimed. Each adapter lives behind injected ports and never owns CRM allocation,
permission or money-state rules. Provider limits must be rechecked at implementation.

## Shared ingress, egress and secrets

A connection belongs to one workspace; Google additionally belongs to one membership.
Random endpoint IDs locate a candidate connection but are not authentication. Verify
provider signature before treating the resolved workspace as trusted. Invalid requests
produce redacted rejection metadata/hash and 4xx, never a trusted domain event. Rate-limit
unknown endpoints/rejections to avoid audit amplification and do not store attacker bodies.

A verified inbound event is inserted durably with unique connection/provider identity,
normalized encrypted minimal payload and an inbox job. Return 2xx after commit; duplicate
verified event returns 2xx without duplicate effects. Failure to persist returns retryable
non-2xx. Consumer transaction commits domain effects, semantic dedupe and receipt together.
Separate transport event dedupe from object-level money/message uniqueness.

Outbound request intent, integration history and job are committed first. A worker claims
by lease token, calls provider outside a DB transaction, then records normalized outcome
and domain state. Job attempt records preserve failures. Temporary 429/5xx/network errors
use provider Retry-After or bounded exponential backoff with jitter; permanent 4xx/auth/
validation errors stop and explain remediation. An uncertain network outcome is `unknown`,
requires reconciliation or an explicit duplicate-risk retry decision, not blind replay.

Default bounded policy proposal: 5 attempts, delays 5s/15s/30s/120s after failures;
respect larger Retry-After; notification first retries prioritize the within-minute target.
No retry bypasses opt-out, connection revocation, changed permissions or destination state.
Permanent/exhausted errors remain visible to authorized administrators. Timeouts are
bounded per provider (initial 10s), with a 45s job lease and token-checked completion;
extend lease before longer work or reclaim safely. Token mismatch cannot overwrite a
new worker's result. Provider idempotency/reconciliation is still essential after a crash.

Credentials entered by an authorized administrator are write-only request fields; never
returned or shown in full. Store per-workspace encrypted secrets in private schema with
key/version outside DB; log safe codes only. The worker invocation credential lives in
Supabase Vault and the server environment; it is independent of per-workspace tokens.
Connection changes are authorized/audited and invalidate affected jobs safely. No paid
provider/project provisioning or production resource mutation occurs without explicit scope.

## Versioned adapter interfaces (server-only)

The active provider-neutral ports and Zod schemas live in src/contracts/integrations.ts.
Messaging uses SmsAdapterV1 / SmsWebhookEventV1 with Textbee; payments use
PaymentsAdapterV1 / SafepayPaymentEventV1 with Safepay Sandbox; notifications use
NotificationAdapterV1 with Telegram. Active connection choices are Textbee, Safepay,
Google Calendar and Telegram. Legacy provider wire schemas, if retained for a migration,
are not active connection choices.

Adapters receive explicit credentials and normalized commands. They never query workspace
secrets or own persistence, assignment, accounting, idempotency storage or retries. Results
must distinguish confirmed, temporary failure, permanent failure and unknown outcome.
Provider SDK types stay inside adapter modules. Core verifies the connection/workspace,
authorizes the action, persists intent/event, and applies business effects transactionally.

## Textbee Android SMS

A workspace configures a Textbee API key, device selection and webhook subscription. The
send API accepts E.164 recipients and returns an smsBatchId when Textbee queues a batch.
HTTP 200 means accepted and pending; it does not prove that the phone sent the SMS or that
the carrier delivered it. A later MESSAGE_SENT callback means the Android phone handed it
to the carrier. MESSAGE_DELIVERED is available only when the carrier reports delivery.

Textbee signs each webhook body with its subscription signing secret. The route verifies
X-Signature as lowercase-hex HMAC-SHA256 over the exact raw bytes using a constant-time
comparison before parsing or trusting any payload fields. Each subscription has its own
secret. Invalid signatures are rejected without storing an event or applying CRM effects.
Deduplicate the durable inbox on idempotencyKey; Textbee retries the same delivery with
the same key. Textbee does not guarantee event order, so reconciliation must compare the
provider timestamps and never regress a delivered/final state because an earlier callback
arrived late.

Keep smsId (one message) and smsBatchId (the originating send request) in separate fields.
A bulk batch produces per-recipient events; correlate each status callback to both the
message and its batch. Preserve the original provider status in diagnostics. UNKNOWN_STATE
is non-final and must not be presented as failed. Preserve Android/carrier error code and
reason for MESSAGE_FAILED; the provider marks that message final, so an employee retry
creates a new visible send attempt rather than resending the same failed provider message.

For MESSAGE_RECEIVED, use the provider receivedAt time, not webhook arrival time. An
offline Android phone may upload a message later; Textbee documents that events older than
48 hours may be stored without a webhook, so reconciliation may need the provider message
history API. A sender can be a phone number, short code or text sender name. Preserve the
original sender, and perform CRM phone matching only when it is a valid normalized E.164
number; do not invent a customer identity from a label or short code.

References: [Textbee sending](https://textbee.dev/docs/sending-sms/sending-sms),
[Textbee webhook verification and retries](https://textbee.dev/docs/webhooks), and
[Textbee event shapes/order](https://textbee.dev/docs/webhooks/events). Full R05 acceptance
requires an actual Android phone/SIM to receive a message, send an incoming message, and
show a real reply plus provider status callbacks through the running application.

## Safepay Sandbox payments

Use Safepay Sandbox hosted Checkout; never store or log card data. Create the payment
tracker server-side with the documented /order/payments/v3/ flow using the merchant API
key, intent, mode, currency, integer minor-unit amount and application metadata. Then get
a short-lived passport token from /client/passport/v1/token and generate the checkout URL
from the tracker, token, environment, source, and allowlisted success/cancel URLs using the
supported SDK/helper. Do not use an undocumented order-init route or guess a checkout URL.
Browser redirect or local policy timeout is not payment confirmation.

Verify the merchant webhook over the exact raw request body with the configured webhook
signing secret and documented SHA-512 HMAC in X-SFPY-SIGNATURE. Reject invalid signatures
before parsing or changing payment/accounting state. The top-level token is a stable event
identity. data.tracker identifies the persisted checkout tracker. These identities are not
interchangeable with payment or refund object references; leave absent references null and
correlate to a trusted saved tracker. Provider metadata is untrusted input and can help only
after it matches that persisted tracker and workspace.

Normalize official payment.succeeded, payment.failed and payment.refunded facts from their
actual envelopes and provider timestamps, preferring event-specific charged_at, failed_at
or refunded_at when present. Only payment.refunded confirms a completed refund. Require
data.refund_amount for that event; never interpret a refund request/initiation or an amount
field as a completed refund. Use one durable event identity plus separate tracker/payment/
refund keys to prevent duplicate ledger entries. Failed, delayed, out-of-order or unknown
events must not overwrite a confirmed payment/refund fact.

Store providerExpiresAt separately from applicationPolicyExpiresAt. An application-owned
checkout deadline can mark local workflow as no longer actionable; it is not evidence that
Safepay expired the tracker. A provider-confirmed expiry may be recorded only from a
verified provider fact. Keep gross payments, confirmed refunds and signed net totals
separate by currency and confirmation month.

References: [Safepay Express Checkout](https://safepay-docs.netlify.app/build-your-integration/express-checkout/?platform=web),
[Safepay merchant webhook types](https://safepay-docs.netlify.app/developers/webhooks/webhook-types/),
and [Safepay HMAC verification](https://safepay-docs.netlify.app/developers/webhooks/verify-hmac-signatures/).
Full R06 acceptance requires a real Safepay Sandbox checkout, verified payment webhook,
provider-confirmed refund and persisted ledger reconciliation.

## Telegram escalation notifications

Per-workspace bot token managed with integrations.manage; per-member destination managed
with notifications.destination.manage_own (default allowed, configurable). Verify each
member destination by a user-initiated bot challenge so staff cannot accidentally route
lead data to another chat. Use Bot API sendMessage with safe plain text/formatting, bounded
content and an allowlisted application lead link. Include lead identity, source, reason and
link, but no payment values or excess customer data. The bot token appears in the required
API URL, so redact the full URL from transport logs and errors. [Telegram Bot API reference](https://core.telegram.org/bots/api#sendmessage).

Confirm send success only from a valid response with ok=true and a positive integer
result.message_id. Preserve 429 retry_after, blocked-chat/permanent errors and uncertain
network outcomes for core orchestration. One delivery per escalation/new owner. A missing
or invalid destination yields visible permanent failure and in-app fallback, not a silent
send. Telegram has no universal send idempotency: keep timeout outcomes unknown and make
any duplicate-risk retry visible. Lead reassignment itself remains exactly once/version.
Full R08 acceptance requires an actual Telegram alert after escalation and a working link
to the correctly authorized lead.

## Google OAuth and Calendar

Employee with integrations.calendar.connect_own (default allowed, configurable) connects
their own Google account through OAuth authorization code + state/PKCE,
offline access, least required event/freebusy scopes and allowlisted exact callback.
State is one-use, hashed, actor/workspace-bound, 10-minute TTL. Callback requires matching
logged-in actor; token exchange/refresh are server-only and encrypted. Do not replace a
valid stored refresh token when Google omits it on a later consent response. Serialize
refresh per connection; revoked/invalid_grant marks reconnect_required and blocks booking.
[Google OAuth reference](https://developers.google.com/identity/protocols/oauth2/web-server).

Read free/busy immediately before booking; local employee/range exclusion prevents our
own overlaps. Google does not atomically reserve across external writers: if a race is
observed, expose conflict/warning and safe recovery rather than claim impossible global
conflict prevention. Keep only needed busy intervals, not unrelated event descriptions.
[Free/busy reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).

Use deterministic provider event ID from appointment UUID for create retry/reconciliation;
use provider ETag/If-Match for update when supported. Persist starts/ends as UTC with
IANA display zone; reject ambiguous local times without offset resolution. Pending local
reservation is not confirmed until provider success. Each create/reschedule/cancel has a durable calendar operation holding requested times,
actor, originating acknowledgement context and provider ETag. Job references that operation,
not a browser payload. Rescheduling reserves both old and proposed ranges (self-overlap
allowed, overlap with another appointment rejected). Permanent failure releases proposed
only; unknown outcome retains both for reconciliation. Rescheduling preserves old confirmed
times until replacement success; cancellation remains cancelling until confirmed. Record
activity on confirmed create/reschedule/cancel. A disconnected calendar cannot be booked;
Admins see status, not OAuth tokens. Ongoing provider sync/reconciliation detects remote
change/revocation; only platform-originated write behavior is required by I3.6, with any
extra two-way editing promise explicitly scoped and tested.

## Telegram escalation notifications

Per-workspace bot token managed with integrations.manage; per-member destination managed
with notifications.destination.manage_own (default allowed, configurable). Per-member chat destination verified by user-initiated bot
challenge so staff cannot accidentally route lead data to another chat. API Bot
`sendMessage`, plain text or correctly escaped safe formatting, bounded content and
allowlisted application lead link. Content includes lead identity, source, reason and
link; no payment values or excess customer data. Token appears in provider URL, so redact
URL from HTTP logs/errors. [Bot API reference](https://core.telegram.org/bots/api#sendmessage).

One delivery per escalation event/new owner. Missing/invalid destination yields visible
permanent failure and in-app fallback, not a silent send. Honor retry_after for 429 and
stop permanent forbidden/blocked-chat errors. Telegram does not provide universal send
idempotency: uncertain timeout is retained as unknown; limited retry may duplicate an
alert, which must be documented. Lead reassignment itself remains exactly once/version.
Acceptance requires actual Telegram receipt within the same minute under healthy setup;
measure occurrence-to-receipt, record provider/network limitations and failures honestly.

## Operations and acceptance

Central integrations page shows disconnected/connected/error/reconnect-required, last
success, recent redacted inbound/outbound attempts, limits and recovery actions. Only
configured permissions can change connections; connection edits are audited. One failed
provider never blocks unrelated CRM/auth/other provider work. Webhooks need public HTTPS;
local tests use a tunnel/deployed test endpoint plus real provider-driven actions. Signed
synthetic payloads validate parsing/forgery but never prove real delivery/completeness.

## Developer 2 adapter handoff boundary

Textbee/Safepay/Telegram SDK adapters, provider-specific signatures, normalization and
error classification/tests belong to Developer 2/Gemini. Developer 1 owns HTTP routes,
trusted workspace resolution, persistence, credentials, retries/domain effects and all UI.
Google Calendar adapter and OAuth orchestration remain entirely Developer 1.
