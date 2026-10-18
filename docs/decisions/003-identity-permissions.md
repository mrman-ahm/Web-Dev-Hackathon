# ADR 003: Identity, sessions and configurable permissions

Status: **Accepted by primary human on 2026-10-18**. Date: 2026-10-18.

## Context

Owner/Admin/User base levels coexist with Manager configured by permissions. Direct API, record scope, protected values and tenant denial must all work.

## Decision

Use Supabase Auth SSR cookies/verified identity, active DB memberships, role grants and per-member allow/deny overrides. User commands keep user context; protected commands recheck session revocation. Owner authority has explicit guards.

## Alternatives considered

Hardcoded role-name checks fail Manager/custom permissions. Editable user metadata is unsafe. Role claims alone are stale after permission changes.

## Rationale

Current DB authorization plus RLS rejects guessed IDs and stale grants. Separate DTO projection prevents financial leakage across lists/exports/realtime.

## Consequences

Authorization is central and tested at HTTP, RPC and direct Data API layers. Ordinary user code must not use service-role clients. Signup bootstrap failure must roll back the required workspace creation.
