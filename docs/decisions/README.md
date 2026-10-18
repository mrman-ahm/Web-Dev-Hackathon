# Architecture decisions

Accepted high-level preferences and explicit human answers are distinguished from proposed
implementation details. A proposed ADR becomes Accepted only with a linked primary-human
review/decision. Agent review is evidence, not human approval. All entries below include
context, decision, alternatives, rationale and consequences.

| ADR | Status |
| --- | --- |
| [001 — Modular monolith](001-modular-monolith.md) | Accepted by primary human 2026-10-18 |
| [002 — PostgreSQL/Supabase tenant data](002-postgres-tenancy.md) | Accepted by primary human 2026-10-18 |
| [003 — Identity, sessions and configurable permissions](003-identity-permissions.md) | Accepted by primary human 2026-10-18 |
| [004 — Durable lead scheduling](004-durable-scheduling.md) | Accepted by primary human 2026-10-18 |
| [005 — Transactional events and outbox](005-outbox-events.md) | Accepted by primary human 2026-10-18 |
| [006 — Safe realtime invalidation](006-safe-realtime.md) | Accepted by primary human 2026-10-18 |
| [007 — Provider adapters and truthful outcomes](007-provider-adapters.md) | Accepted by primary human 2026-10-18 |

The primary human approved the technical architecture/ADRs in the PR #3 design review
on 2026-10-18, requiring corrected developer ownership and explicit gross/net collections.
Those corrections are applied; no repeated approval of the same decisions is required.
Runtime verification and required PR merge review remain separate gates.
