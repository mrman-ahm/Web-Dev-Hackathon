# Ambiguities and human decisions

| ID / exact source reference | Competing interpretations | Resolution / impact | Human decision |
| --- | --- | --- | --- |
| A1: Section 3 says “one customizable pipeline”; F2.3 requires “Two pipelines” | One pipeline per workspace vs multiple independent field sets | Support multiple workspace pipelines; shared contacts, pipeline-scoped opportunity fields. CRM/schema/API affected. | Explicit master-prompt direction; organizer clarification optional, not a blocker |
| A2: Section 1 exactly one accountable owner; F3.3 unavailable employees never receive leads | Reject/unassign intake vs distinguish accountability custody from eligible operational assignment | **Accepted 2026-10-18 by primary human:** workspace Owner holds custody when nobody is eligible; display awaiting eligible employee in recovery. No operational assignment or first-response clock until eligible allocation. Existing accountable owner is retained if a later escalation has no candidate. | Explicit in-session answer “Use Owner custody with visible recovery status”; implement precisely and expose distinction |
| A3: F3.6 treatment of already acknowledged leads | Automatically move all leads vs retain acknowledged ownership | Propose retain acknowledged leads on absence; show owner absence and enable authorized manual transfer; unacknowledged On leave/Offline leads transition immediately. Busy stops new allocation but does not immediately revoke current leads. | Proposed domain policy; include in architecture review |
| A4: Section 7 “open leads” is not a defined terminal lifecycle | Count only pending acknowledgement vs all unresolved leads | Count all operationally owned leads not closed, including acknowledged; custody rows do not consume operational capacity. | Proposed; leads and metrics affected |
| A5: I2.5 abandoned vs expired payment | Browser leaving means abandoned vs only durable provider/local evidence | No success/failure inference from navigation. Record abandonment only on explicit client cancel signal or configured inactivity; expiry comes from provider. Paid/refunded facts dominate both. | Proposed; payments UI/events affected |
| A6: I3.4 conflicts; Google free/busy is not an atomic reservation | Promise globally conflict-free calendar vs local locking plus fresh provider check/warning | Prevent local overlapping active reservations; recheck Google immediately before create/update; external races can still occur and are surfaced as conflict warnings. | Source explicitly permits warnings; no global guarantee claimed |
| A7: F5.1/Q12 date boundaries and multiple currencies | Platform UTC vs workspace-local periods; currency sum vs separate totals | Workspace IANA timezone defines today/month; rolling 24 hours uses UTC duration. Group money by currency, never add unlike currencies. | Proposed; dashboard and payment contracts affected |
| A8: prompt says 71 identified requirements | Trust stated count vs enumerate IDs | 31 + 36 + 14 = **81**; all source IDs traced. | Source-verified arithmetic correction |

| A9: recovery after final tier/sole eligible owner | Endless cycling, permanent dead-end, or explicit late acceptance | Propose preserve accountable owner and exhausted status; manual different-owner transfer starts a new cycle; current Available operational owner can explicitly recover/acknowledge late with true response duration. | Proposed; requires architecture approval |
| A10: F5.1 payments this month vs Section 7 refunds | Attribute refund to original capture month vs actual refund month | Propose signed net movement: captures confirmed in month minus refunds confirmed in month; negative totals allowed; lifetime total includes all facts. | Proposed; dashboard/payment contracts affected |

## Current human staffing

On 2026-10-18 the primary human directed that one person currently handles both
Developer 1 and Developer 2 work. Preserve module/agent lanes, not an assumed second
laptop or active Gemini worker. The human confirmed `mrman-ahm` handles both lanes; assign approved work to that account.
The connected automation account remains `ahmad-obj`; do not infer a second active developer.
No agent review substitutes for human approval. Agent-produced PRs remain proposals
for the primary human; do not self-approve or merge them. Future second-human handoff
can use the same independent UI contracts.
