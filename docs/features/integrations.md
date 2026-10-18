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

## Adapter interfaces (server-only)

```ts
type ProviderOutcome<T> = {status:'confirmed';value:T;reference:string}
  |{status:'temporary_failure';code:string;retryAfterSeconds?:number}
  |{status:'permanent_failure';code:string}
  |{status:'unknown';code:string;reconciliationReference?:string};
interface MessagingAdapter {
  verifyInbound(input:{rawBody:Uint8Array;headers:Headers;canonicalUrl:string},
    credentials:TwilioCredentials):VerifiedMessageEvent;
  send(input:SendMessageCommand,credentials:TwilioCredentials):Promise<ProviderOutcome<SentMessage>>;
}
interface PaymentsAdapter {
  verifyWebhook(input:RawWebhook,credentials:StripeCredentials):VerifiedPaymentEvent;
  createCheckout(input:CheckoutCommand,credentials:StripeCredentials):Promise<ProviderOutcome<CheckoutSession>>;
}
interface CalendarAdapter {
  busy(input:BusyQuery,credentials:GoogleCredentials):Promise<ProviderOutcome<BusyIntervals>>;
  upsert(input:CalendarEventCommand,credentials:GoogleCredentials):Promise<ProviderOutcome<CalendarEvent>>;
  cancel(input:CancelEventCommand,credentials:GoogleCredentials):Promise<ProviderOutcome<CancelledEvent>>;
}
interface NotificationAdapter {
  send(input:{chatId:string;text:string;deliveryId:string},token:string):Promise<ProviderOutcome<{messageId:string}>>;
}
```

These normalized commands/results are defined with Zod in `src/contracts/integrations.ts`
when scaffolding lands. Provider SDK types never cross presentation/domain boundaries.
Credentials are passed by the orchestration layer; an adapter may not query arbitrary
workspace secrets or implement its own retry loop/assignment logic.

## Twilio WhatsApp Sandbox / SMS

Use official SDK signature validation with exact configured external URL (including
query and encoding) and all original form parameters; JSON endpoints use raw body hash
validation appropriate to the SDK. Do not reconstruct URL from attacker-controlled Host
or blindly trust forwarded headers. Account/To/channel must match configured connection.
Use workspace account auth token; do not implement custom HMAC algorithms.
[Twilio signing reference](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

Inbound MessageSid dedupes message/contact/lead effects. Phone matching uses canonical
E.164, with WhatsApp channel prefix normalized separately. Unknown phones invoke the
shared CRM/lead service; known contacts attach existing conversation/open intake episode.
Status callbacks can be repeated/out of order; persist sent/delivered/failed states
without regressing delivered to sent. A callback may precede outbound response: reconcile
by provider reference. Owner visibility is conversation permission plus record scope.

Outgoing send checks opted-out state at enqueue and dispatch. Confirmed provider message
reference is stored; failures stay visible with reason and controlled retry. Twilio send
may lack safe application-level idempotency for a particular operation: after uncertain
submission reconcile rather than silently create another message. Sandbox phones must
join the sandbox first; display that limitation. Real-phone inbound/reply/status and
forgery/replay evidence are required for I1 completeness.

## Stripe test payments

Use hosted Checkout in test mode; credentials and endpoint signing secret are per
connection. Verify Stripe-Signature against original bytes with the official SDK before
DB changes; enforce current timestamp tolerance and retain dedupe identities. Restrict
supported event types and pinned stable Stripe API version in the implementation; do not
adopt preview APIs merely because examples mention them.
[Stripe webhook reference](https://docs.stripe.com/webhooks).

Create payment request then Checkout job with stable idempotency key derived from request
ID. Session metadata contains opaque internal references; validate them against the
connection/workspace/contact/opportunity relationship, amount and currency. Do not trust
metadata to select an unrelated tenant. Success/cancel URLs only navigate; signed provider
facts establish money. `checkout.session.completed` is paid only when provider payment
status confirms paid; delayed methods require later success/failure events. Reconcile
actual payment objects on out-of-order events. Unique payment/refund object references
prevent double accounting across distinct event types.

Store pending/open/abandoned/expired/failed/paid/partially_refunded/refunded; display
abandonment as observed/inferred using its evidence source. Closing a browser is not proof.
Confirmed payment/refund facts dominate old failures/expiration; ledger is immutable and
currencies are never mixed. Card data goes only to hosted Stripe UI and is never stored
or logged. Send request links only via allowed messaging; preserve requester/provider refs.

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

Twilio/Stripe/Telegram SDK adapters, provider-specific signatures, normalization and
error classification/tests belong to Developer 2/Gemini. Developer 1 owns HTTP routes,
trusted workspace resolution, persistence, credentials, retries/domain effects and all UI.
Google Calendar adapter and OAuth orchestration remain entirely Developer 1.
