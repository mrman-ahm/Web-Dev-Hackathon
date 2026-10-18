# Ownership and review

Two humans work on separate machines. Developer 1 uses GPT and owns approximately
75–80% of implementation; Developer 2 uses Gemini and owns independent provider adapters
(approximately 20–25%). GitHub account-to-human mappings are **unconfirmed**. Repository
ownership, connector identity and earlier staffing assumptions do not establish them.

## Responsibility boundaries

| Area / paths | Owner | Required coordination |
| --- | --- | --- |
| All frontend/UI/UX, design tokens, shell, navigation, components, dashboards/audit presentation and domain screens | Developer 1 / GPT | Shared typed interfaces; accessibility and responsive verification |
| Architecture, contracts, database/migrations/RLS, Auth/workspaces, permissions, CRM, leads/escalation/recovery, jobs, audit, metrics/realtime | Developer 1 / GPT | Sensitive/cross-domain human review; one database steward |
| Google OAuth/Calendar, security, application integration, testing and deployment | Developer 1 / GPT | Provider documentation and real acceptance evidence |
| `src/modules/messaging/adapters/twilio.ts` and bounded provider helper files | Developer 2 / Gemini | Consume core-owned adapter schemas; no persistence/assignment changes |
| `src/modules/payments/adapters/stripe.ts` and bounded provider helper files | Developer 2 / Gemini | Provider signatures, normalization and SDK calls only; no money-domain decisions |
| `src/modules/notifications/adapters/telegram.ts` and bounded provider helper files | Developer 2 / Gemini | Provider send/error classification only; no retry/delivery orchestration |
| Provider-specific unit/contract tests under `tests/unit/providers/` | Developer 2 / Gemini | Real external acceptance is coordinated by Developer 1 |
| Credentials orchestration, HTTP webhook routes, inbox/outbox persistence, domain effects, retries and API/UI integration | Developer 1 / GPT | Adapters receive validated commands/credentials through explicit ports |
| Root config, dependencies, global routing, CI/environment/deployment | Developer 1 steward; shared coordination | Developer 2 proposes required package/config changes before editing |

Developer 2 receives no frontend work. It may not independently modify database schemas,
Auth/RLS/permissions, business rules, shared contracts, credentials persistence, lead
ownership, payment accounting, job orchestration or Google Calendar. Provider-specific
webhook validation, event normalization, provider errors and tests belong in its adapters.
Expose a normalized confirmed/temporary/permanent/unknown result; never fake a successful
integration. Request interface changes through a contract issue before incompatible edits.

Developer 1 dispatches dedicated GPT subagents for suitable independent tasks with explicit
file ownership and separate worktrees. Do not edit another agent's tree. Developer 2 is
on another machine; repository handoffs and GitHub PRs carry coordination. No remote
Gemini process is assumed started or directly spawnable by the supervisor.

## Review and exceptions

One independent human approval is the target; sensitive/cross-domain changes require the
other developer or another qualified human when the author is one of the developers.
Supervisor/agent review supports but never replaces required human review. Primary human
retains technical authority. Approved architecture can be implemented on explicitly
recorded dependency branches while merge/integration waits for reviewed parent PRs.
No agent self-approval, direct protected-branch push or automatic merge.

A cross-boundary exception names files, rationale, consumers and reviewer in the task/PR;
Developer 1 approves technical scope before editing. Ordinary approved work proceeds
without repeated permission requests. Material policy changes require explicit human approval.

## CODEOWNERS and identities

Confirmed repository permissions: mrman-ahm admin, connector account ahmad-obj write.
These are account facts, not human-lane mappings. CODEOWNERS remains comments only until
both mappings and eligible reviewers are confirmed. Sensitive/shared paths need eligible
independent reviewers so a PR author is never its sole required approver. Use manual
review routing meanwhile; Markdown policy is not verified GitHub protection.

This corrected two-human ownership policy was explicitly directed by the primary human
in the architecture approval on 2026-10-18 and supersedes earlier single-human/UI-lane assumptions.
