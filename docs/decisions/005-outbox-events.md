# ADR 005: Transactional events and outbox

Status: **Proposed**. Date: 2026-10-18.

## Context

Domain changes, audit facts and intended external actions must not disappear between a DB commit and an HTTP call.

## Decision

Write immutable domain event, audit/activity and outbox intent in the domain transaction. Lease jobs with SKIP LOCKED and token-checked completion. Consumers record unique receipts atomically with effects.

## Alternatives considered

Synchronous provider HTTP inside DB/domain locks prolongs contention and still has ambiguous outcomes. In-memory events are not durable. A distributed broker does not solve semantic deduplication.

## Rationale

At-least-once delivery with explicit semantic idempotency covers worker crashes and repeated webhooks while retaining a simple monolith.

## Consequences

Exactly-once external send is not promised. Reconcile unknown outcomes and expose bounded failures. Payment/refund object uniqueness is additional to transport event IDs. Raw event tables are server-only.
