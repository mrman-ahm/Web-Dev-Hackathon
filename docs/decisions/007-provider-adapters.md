# ADR 007: Provider adapters and truthful outcomes

Status: **Accepted by primary human on 2026-10-18**. Date: 2026-10-18.

## Context

Twilio, Stripe, Google Calendar and Telegram have different authenticity, idempotency, error and OAuth rules; real sandbox acceptance is mandatory.

## Decision

Use server-only provider ports with normalized confirmed/temporary/permanent/unknown outcomes. Shared orchestration owns secrets, retry/history and domain commands; adapters own provider translation/verification.

## Alternatives considered

SDK calls throughout route/UI modules duplicate rules and expose secrets. Fake adapters cannot demonstrate required real integration. Treating timeouts as safe retry can duplicate side effects.

## Rationale

Explicit ports isolate provider failures and enable deterministic tests without pretending those tests prove delivery.

## Consequences

Pin supported SDK/API versions during implementation, verify official docs, redact credential-bearing URLs, preserve failures and record real sandbox evidence. No adapter may invent lead ownership, authorization or money semantics.
