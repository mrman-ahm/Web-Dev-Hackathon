# ADR 004: Durable lead scheduling

Status: **Proposed**. Date: 2026-10-18.

## Context

Escalation survives browsers/restarts and I4.1 requires real alert receipt within a minute. Minute-only web schedules leave no healthy-path margin.

## Decision

Persist deadlines in PostgreSQL. Supabase Cron invokes a bounded due-transition function every 5 seconds; separate Cron/pg_net dispatches outbox worker HTTPS every 5 seconds. Database workspace locks serialize candidate selection and transitions.

## Alternatives considered

Browser/in-memory timers lose work. Minute-only Vercel Cron has insufficient margin. A new hosted workflow service adds infrastructure before existing Supabase primitives are exhausted.

## Rationale

Supabase Cron documents second-level SQL/HTTP scheduling. DB time/constraints make state changes durable; external sends remain outside locks.

## Consequences

Monitor scheduler lateness, oldest due row/job and delivery latency. Database/provider outages break latency targets and require visible recovery. Validate installed extensions, public HTTPS, credential rotation and hosting quotas before enabling schedules; do not claim deployed timing from this design.
