# Official participant-rubric traceability

The source of these criteria is the supplied, versioned
[Participant Rubric](participant-rubric.docx), read in full on 2026-10-18. SHA-256:
`5c1d538a6056ce79b9f8c5be52f6524723e6536b5a6450669b8c5a60813dac12`.
Criterion IDs `R01`–`R10` are stable project identifiers added for traceability; the
quoted full-mark conditions and point weights below are exact source text.

The original [problem statement](problem-statement.docx) remains the complete product
scope. This rubric controls how judges measure the running application. Plans, closed
issues, UI screenshots, mocks and provider fixtures do not prove live acceptance.
Real provider sandbox/test modes are valid. A fake or hard-coded provider earns at
most Partial on R05–R08. A failed item claimed on the self-checklist lowers R10.

## Official criteria and evidence map

| ID | Criterion | Weight | Exact full-mark condition | Problem-statement requirements | Foundation C task codes |
| --- | --- | ---: | --- | --- | --- |
| R01 | Roles, permissions and security | 10 | Roles and permissions can be changed in the interface; hidden data stays hidden through the API; one workspace cannot see another | F1.1–F1.6; Q1–Q3 | `auth-workspaces`, `invitations`, `permission-admin`, `security-regressions`, `core-acceptance` |
| R02 | Customizable CRM | 12 | Custom fields, per-pipeline fields, required fields by stage, editable pipeline and saved lists all work | F2.1–F2.8; Q4, Q6–Q10 | `crm-records`, `custom-fields`, `filters-export`, `customer-history`, `pipeline-core`, `opportunity-ui` |
| R03 | Lead assignment and escalation | 14 | Leads go only to available staff; the countdown is visible; an expired lead escalates once; absence reassigns at once; the recovery queue shows why | F3.1–F3.9; Q4–Q6, Q11 | `lead-intake`, `lead-engine`, `ack-escalation`, `recovery-ui`, `escalation-delivery`, `lead-milestone` |
| R04 | Audit log and dashboard | 8 | Key actions are logged and cannot be edited; dashboard figures are live, match the records and differ by role | F4.1–F4.3; F5.1–F5.5; Q2, Q11, Q12 | `audit-core`, `audit-view`, `dashboard-core`, `dashboard-view`, `realtime-core`, `lead-milestone` |
| R05 | Messaging integration | 12 | A real phone message arrives, a reply is delivered, forged or repeated webhooks are handled, failures are visible and retryable | I1.1–I1.9; F3.1; Q3, Q5, Q6 | `twilio-adapter`, `messaging-core`, `integration-core`, `lead-intake`, `full-acceptance` |
| R06 | Payments integration | 12 | A real test payment updates the record automatically; webhooks are verified and not double-counted; refunds and failures show | I2.1–I2.8; F5.1–F5.2; Q4–Q6 | `stripe-adapter`, `payments-core`, `integration-core`, `full-acceptance` |
| R07 | Calendar integration | 10 | Google sign-in works, appointments appear in the real calendar, clashes are detected, time zones are correct | I3.1–I3.7; F2.7–F2.8, F5.1; Q7, Q8, Q10 | `calendar-core`, `integration-core`, `full-acceptance` |
| R08 | Notification integration | 4 | An escalated lead sends a real alert with a working link | F3.9; I4.1–I4.4; Q5 | `telegram-adapter`, `escalation-delivery`, `lead-milestone`, `full-acceptance` |
| R09 | Quality | 10 | Works on a phone, shows clear errors, no secrets in code, data survives a restart, one failing provider does not break the rest | Q1–Q14; cross-cutting persistence, recovery and provider isolation | `scaffold`, `auth-workspaces`, `security-regressions`, `crm-records`, `ui-foundation`, `jobs-core`, `integration-core`, `deploy-operations`, `full-acceptance` |
| R10 | Demo and understanding | 8 | The live demo runs, the checklist is honest, and every member can explain their code | All 81 IDs; demonstration and evidence discipline | `lead-milestone`, `full-acceptance` |

Weights total 100. The highest integrated priority is CRM + lead protection + external
provider workflows: R02 + R03 + R05 + R06 + R07 + R08 = **64 points**. This ordering
focuses the first complete business flows; it does not cut or replace the remaining
36-point criteria or any requirement in the problem statement.

## Scoring and status rules

| Judge level | Share | Meaning from the rubric |
| --- | ---: | --- |
| Full | 100% | Works end to end, handles bad input, data is still there after a refresh |
| Mostly | 60% | Normal path works; one clear gap |
| Partial | 30% | Visible but incomplete, or only works with prepared data |
| None | 0% | Missing, or claimed but not working |

A criterion earns Full only when its entire exact condition is demonstrated against the
running application, including required bad-input, authorization, duplicate, failure,
refresh/restart and real-provider behavior. Unit tests support evidence but do not
replace a live judge-path run. Do not add up task weights: the weight is repeated on
each related task as a reference to the criterion's official total, not a task-level
point allocation.

**Checkpoint, 2026-10-18:** no criterion has verified Full evidence yet. The local
`feat/auth-workspace-slice` branch supplies partial implementation/evidence toward R01
and R09; configurable role/grant management is being implemented separately. All other
criteria remain unverified until their complete acceptance flows run. Update this status
only with a build/commit, exact user actions, observed result and retained evidence.

## Evidence record template

Use this record for each later live run; leave it empty until observed:

| Criterion | Build/commit and environment | User actions and result | Negative/failure case | Retained evidence | Level / gap |
| --- | --- | --- | --- | --- | --- |
| R01–R10 | — | — | — | — | Not yet evidenced |

See the [judge-facing demo checklist](../testing/judge-demo-checklist.md) for the
specific live actions expected for every criterion.
