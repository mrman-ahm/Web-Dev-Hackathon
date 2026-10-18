# ADR 006: Safe realtime invalidation

Status: **Accepted by primary human on 2026-10-18**. Date: 2026-10-18.

## Context

New leads/messages/escalations must appear without refresh, while protected values and revoked permissions must not leak through websocket payloads.

## Decision

Use private per-member Supabase Realtime channels for minimal domain invalidation only; API refetch computes current permitted DTOs. Never publish raw business tables or financial/provider payloads.

## Alternatives considered

Raw Postgres Changes can expose sensitive columns and DELETE metadata. Polling alone does not fulfill the intended realtime experience. Rich event payloads duplicate authorization and carry stale permissions.

## Rationale

Invalidation keeps sensitive-data enforcement in one authoritative read layer. Reconnect refetch handles lost ephemeral signals.

## Consequences

Configure private-channel RLS and do not ALTER Supabase-owned realtime.messages RLS state. Join authorization can be cached; no sensitive record detail belongs in signals. Test revocation and two-tenant isolation.
