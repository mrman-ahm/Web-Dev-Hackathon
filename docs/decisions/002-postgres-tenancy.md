# ADR 002: PostgreSQL/Supabase tenant data

Status: **Proposed**. Date: 2026-10-18.

## Context

Workspace boundaries, cross-record integrity, atomic ownership, flexible fields and real persistence are mandatory.

## Decision

Use Supabase PostgreSQL with workspace-scoped composite FKs, RLS on tenant data, explicit constraints/indexes and reviewed command RPCs. Separate protected financials/secrets from broadly readable records.

## Alternatives considered

One database per tenant isolates strongly but complicates setup/migrations at this scale. JSON-only records weaken integrity. Server checks without RLS leave direct Data API paths exposed.

## Rationale

Relational constraints and transactional locks address the central guarantee; Supabase Auth/Realtime/Cron fit the agreed stack.

## Consequences

Schema steward is the core lane. RLS is not field protection or a substitute for permissions. Database contract and live migrations must agree; no production schema is changed by architecture approval.
