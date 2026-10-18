# Developer 2 — Gemini backend provider adapters

You are Developer 2 on a separate machine. Your complete lane is **Twilio, Stripe and
Telegram provider adapters, provider-specific webhook validation, normalized events,
error handling and tests**. No frontend/UI tasks are assigned. Developer 1/GPT owns
all frontend/core/database/persistence/credentials/retries/domain rules, Google Calendar
and shared contracts. Read [GEMINI](../../GEMINI.md), [AGENTS](../../AGENTS.md),
[ownership](../ownership.md) and [integration specification](../features/integrations.md).

## Dependency and initial task references

Architecture issue #2 / approved PR #3 supplies technical contracts; coordination issue
#4 is the current aggregate tracker. Task codes in [catalog](../coordination/backlog.json):
`twilio-adapter`, `stripe-adapter`, `telegram-adapter`. Per-task GitHub issues will be
published in one batch; do not invent numbers. Human account mapping remains unconfirmed.
This document prepares your work; the GPT supervisor does not claim your agent started.

The prerequisite is the committed shared scaffold/ports from Developer 1. If the baseline
is only local, obtain its published branch or local repository/bundle from Developer 1;
a fresh remote clone cannot see unpublished commits. Inspect the actual package/lockfile
and `src/contracts/integrations.ts` before implementation. Missing ports are a dependency,
not permission to define a second interface.

## Starting commands

After the shared scaffold commit is available in your clone, select one task and its
approved baseline; use the same Node/npm versions specified by the repository. At task
start synchronize once with the provided baseline, then:

```sh
npm ci
git switch -c feat/provider-twilio-adapter
npm run test -- tests/unit/providers/twilio.test.ts
npm run typecheck
```

Use `feat/provider-stripe-adapter` / `feat/provider-telegram-adapter` for the other packages,
or actual issue-number branch names after publication. The test command above is the
required targeted convention supplied by the scaffold; confirm package scripts exist.
Write meaningful tests, observe the missing behavior, implement, and run relevant checks.
No continuous fetching/pushing or full-suite reruns without a relevant change.

## Owned and restricted files

Own only the assigned adapter and bounded provider-specific helpers beneath:

- `src/modules/messaging/adapters/twilio.ts`
- `src/modules/payments/adapters/stripe.ts`
- `src/modules/notifications/adapters/telegram.ts`
- Matching `tests/unit/providers/{twilio,stripe,telegram}.test.ts` and synthetic fixtures.

Consume `MessagingAdapter`, `PaymentsAdapter`, `NotificationAdapter`, credentials,
commands/events and `ProviderOutcome` from core-owned `src/contracts/integrations.ts`.
Never import DB/service-role clients or domain repositories. Do not change root packages,
shared contracts, migrations/RLS/Auth, HTTP route ownership, job/retry orchestration,
credentials storage, UI or Google Calendar. Request exact interface/dependency changes
in the contract-change issue/PR, then continue independent owned work.

## Concrete acceptance

Twilio: official SDK verifies exact configured external URL/all original parameters or
raw JSON body as applicable; altered/forged request rejected safely. Normalize inbound
message/status events and outbound send responses/errors. Preserve provider references,
known uncertain submission and permanent/temporary classification. No contact/lead creation,
workspace selection or opt-out business decisions in the adapter; core orchestrates them.

Stripe: official SDK verifies original bytes/signature/tolerance; normalize supported
stable-version payment/session/refund facts and Checkout response/errors. No hosted card
data is stored/logged; never trust browser redirects as payment. Semantic accounting,
metadata/workspace validation, duplicate persistence and retries remain core responsibilities.

Telegram: implement Bot sendMessage with safe content/URL handling, token URL redaction,
429 retry_after, permanent forbidden/chat errors and unknown network outcomes. Return
normalized result, never retry or alter lead ownership inside the adapter.

Use synthetic SDK/request fixtures for unit/contract tests; show genuine valid/invalid/
missing signature and unknown-outcome cases. No real integration completeness claim from
fixtures. Real sandbox phone/Checkout/refund/chat acceptance is coordinated with D1 and
requires credentials/public HTTPS; never commit or print those credentials.

## Handoff

One scoped branch/PR per independent deliverable. Report task/issue ref, functions/files,
requirements, contract changes (or none), exact commands/results, limitations/unknowns,
commit/PR and next action. Developer 1 wires HTTP, secrets, persistence, idempotency,
retries and domain effects. Required human review precedes merge. Preserve independently
reviewable adapter boundaries and avoid backend duplication merely to show a demo.
