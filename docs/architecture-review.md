# Foundation B architecture review

Scope: requirements, architecture, database, API/UI/event contracts, lead automation,
integrations and security. Independent read-only architecture agent review on 2026-10-18,
followed by a focused review of corrections. This is not primary-human approval or proof
of running behavior. The primary human subsequently approved the contracts/ADRs on 2026-10-18, subject to
targeted ownership and gross/net corrections, now applied.

| Finding | Correction |
| --- | --- |
| Rescheduling target and both reservations were not durable | Persist calendar_operations, requested range/actor/ETag and current/proposed reservations; define confirmed/failed/unknown cleanup |
| Delayed provider acknowledgement lacked assignment context | Persist originating actor/lead/assignment version; exact-epoch confirmation check, including assignment back to same actor |
| New lead owner could lack related customer/conversation scope | Explicit derived read scope with resource grants; conversation projection updated atomically; unrelated records stay protected |
| First intake had no rule or public endpoint configuration | Bootstrap disabled default rule and explicit lead_intake_endpoints tenant mapping; custody before activation |
| Constraints referenced missing columns; anonymous uniqueness was nullable | Add connection/client/context columns/FKs and server-derived nonnull actor_scope |
| Same-owner transfer/reset semantics conflicted | Reject same-owner manual transfer; explicit cycle/exhaustion and proposed late recovery without false reassignment |
| Self-service provider permissions were vague | Exact configurable own-calendar and own-destination permissions with safe defaults |
| Restricted metric still required value; refunds could make negative totals | No-value restricted union; signed MoneyTotal, cash-event-month refund attribution |

Focused follow-up confirmed original fixes and regression scenarios and reported no
further blocking contradiction in those corrections. Two remaining mechanical issues
(calendar connection ID/FK target and delivery uniqueness referring to absent channel)
were corrected explicitly afterward. Migration DDL, RLS execution, auth/provider delivery,
concurrency and responsive behavior remain future implementation acceptance, not reviewed
runtime results. [Acceptance strategy](testing/acceptance.md) records each regression case.

Primary human approval on 2026-10-18 accepts the technical contracts and listed ADRs,
finite escalation/late recovery, durable five-second configuration, custody and signed
monthly net totals. Required targeted corrections: two-human ownership (D1 all UI/core,
D2 Textbee/Safepay/Telegram adapters), no invented account mapping, separate gross/refund/net
currency totals. These are applied without reopening the approved architecture. Hosted
schedule health and actual provider delivery remain implementation evidence requirements.
