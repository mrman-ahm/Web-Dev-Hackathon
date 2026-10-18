# Developer 2 — Gemini provider adapters

Read [AGENTS](../../AGENTS.md), [GEMINI](../../GEMINI.md), [ownership](../ownership.md),
[engineering standards](../engineering-standards.md), and the active
[integration specification](../features/integrations.md) before editing.
The official [Participant Rubric](../requirements/rubric-traceability.md) is the acceptance
standard. Provider mocks and unit tests do not establish live rubric acceptance.

## Current integration checkpoint

The approved provider set is Textbee for SMS, Safepay Sandbox for payments, and Telegram
for escalation notifications. The existing combined adapter work is in
[`feat/pakistan-provider-adapters`](https://github.com/mrman-ahm/Web-Dev-Hackathon/tree/feat/pakistan-provider-adapters)
at reported commit `819823a`; draft integration PR #8 targets
[`feat/core-foundation`](https://github.com/mrman-ahm/Web-Dev-Hackathon/tree/feat/core-foundation).
Do not create a duplicate adapter implementation or merge either branch automatically.
Continue the focused corrections on the existing adapter branch/PR and report the new SHA.

The provider-neutral contract PR #9 is at
[`feat/provider-neutral-contracts`](https://github.com/mrman-ahm/Web-Dev-Hackathon/tree/feat/provider-neutral-contracts),
commit [`2ad1adb`](https://github.com/mrman-ahm/Web-Dev-Hackathon/commit/2ad1adb), and awaits
human review. It targets `feat/core-foundation`; it is not merged. Once its interfaces are
accepted, consume `src/contracts/integrations.ts` as the shared executable source of truth.
The active provider enums are Textbee/Safepay/Telegram/Google; Twilio and Stripe are not
active choices. Published scoped issues are Textbee #7 (R05, 12 points), Safepay #5 (R06,
12 points), and Telegram #6 (R08, 4 points). These criteria also contribute to R09; weights
are not additive. Corrective requests are recorded in those issue threads and PR #8.

## Contract-specific corrections required

### Textbee

- A successful send HTTP response maps to `SmsSubmissionV1 { state: 'queued', providerBatchRef: smsBatchId }`. It is not carrier send or handset delivery.
- For callbacks, map Textbee `idempotencyKey` to `providerEventId`, `smsId` to `providerMessageRef`, and `smsBatchId` to `providerBatchRef`. Keep both provider references; per-recipient callbacks must reconcile against the same outbound batch.
- Map inbound `receivedAt` to normalized `occurredAt` and persist it downstream; webhook arrival time must not replace it for delayed offline-phone uploads.
- Map `UNKNOWN_STATE` to `kind: 'message.unknown'` and preserve the original status in `providerState`. Do not convert an unrecognized provider state into failure.
- Preserve carrier/device failure codes and statuses, handle duplicate IDs and out-of-order callbacks without state regression, and reject malformed or forged signatures. Verify lowercase-hex HMAC-SHA256 over exact raw request bytes with the connection's subscription secret.

### Safepay Sandbox

- Use the approved checkout flow and return separate `providerTrackerRef`, `providerExpiresAt`, and `applicationPolicyExpiresAt`. Never equate the checkout tracker with a payment reference.
- Verify SHA-512 HMAC against the original body bytes. Normalize the top-level merchant event `token` as stable `providerEventId`; keep `data.tracker`, payment reference and refund reference distinct. Missing identities remain explicitly nullable or reject the event; never synthesize UUIDs or IDs from the current time.
- Only official `payment.refunded` with a valid `data.refund_amount` confirms a refund. Refund initiation is not completion. Use provider event timestamps where present; do not substitute processing time for financial time.
- Provider-confirmed expiry maps separately from the application's own checkout policy deadline.

### Telegram

- A send is confirmed only for `ok: true` and a positive integer `result.message_id`.
- Keep 429 retry timing, blocked-chat classification and unknown network outcomes. Redact bot-token-bearing URLs from errors and logs.

## Ownership and acceptance

Own only the provider adapter files and provider-specific fixtures/tests:
`src/modules/messaging/adapters/textbee.ts`,
`src/modules/payments/adapters/safepay.ts`,
`src/modules/notifications/adapters/telegram.ts`, and their matching tests under
`tests/unit/providers/`. Do not change shared contracts, routes, credentials, migrations,
workspace authorization, persistence, retry orchestration, accounting, UI or lead/contact
rules; propose an interface change in the existing contract PR first.

GPT owns authenticated provider connections, encrypted credential storage, signed webhook
routes, durable inbox/outbox and retries, CRM/customer linkage, payment reconciliation and
ledger entries, notification orchestration, and settings/status UI. Coordinate with the
core owner when the approved contract changes or an actual integration failure reveals a
boundary issue.

Use provider-shaped fixtures for adapter behavior and report exact commands/results. The
current `74 passing` and TypeScript success are Gemini-reported results, not independently
verified live acceptance. Real acceptance is still pending: incoming and outgoing SMS via
an Android SIM, Safepay Sandbox payment/refund/failure through verified webhooks, and a
real Telegram escalation alert. Keep credentials out of commits and logs.

Handoff each correction with the issue/PR, commit SHA, changed files, contract mapping,
tests/results, remaining limitations, and next owner. Human review is required before merge.
