# Stable requirement-to-implementation mapping

Derived from the approved architecture and [task catalog](../coordination/backlog.json).
This maps scope, not live progress; GitHub issues/PRs and evidence determine completion.
The primary human requested local implementation and batched GitHub updates, so bulk
publication is deferred while the first development wave proceeds. No issue numbers
are invented. [Coordination issue #4](https://github.com/mrman-ahm/Web-Dev-Hackathon/issues/4)
is the current aggregate tracker; per-task refs will be added on publication.

| Requirement | Implementation task codes | Human responsibility |
| --- | --- | --- |
| F1.1 | `auth-workspaces`, `core-acceptance` | D1/GPT |
| F1.2 | `auth-workspaces`, `invitations` | D1/GPT |
| F1.3 | `permission-admin`, `filters-export` | D1/GPT |
| F1.4 | `permission-admin`, `filters-export`, `realtime-core` | D1/GPT |
| F1.5 | `permission-admin`, `core-acceptance` | D1/GPT |
| F1.6 | `auth-workspaces`, `invitations`, `permission-admin`, `core-acceptance` | D1/GPT |
| F2.1 | `crm-records`, `pipeline-core` | D1/GPT |
| F2.2 | `custom-fields` | D1/GPT |
| F2.3 | `custom-fields`, `pipeline-core`, `opportunity-ui` | D1/GPT |
| F2.4 | `pipeline-core`, `opportunity-ui` | D1/GPT |
| F2.5 | `pipeline-core`, `opportunity-ui` | D1/GPT |
| F2.6 | `filters-export` | D1/GPT |
| F2.7 | `customer-history` | D1/GPT |
| F2.8 | `customer-history` | D1/GPT |
| F3.1 | `lead-intake`, `messaging-core`, `lead-milestone` | D1/GPT |
| F3.2 | `lead-engine`, `lead-milestone` | D1/GPT |
| F3.3 | `lead-engine`, `lead-milestone` | D1/GPT |
| F3.4 | `ack-escalation`, `recovery-ui`, `lead-milestone` | D1/GPT |
| F3.5 | `ack-escalation`, `lead-milestone` | D1/GPT |
| F3.6 | `ack-escalation`, `lead-milestone` | D1/GPT |
| F3.7 | `recovery-ui`, `lead-milestone` | D1/GPT |
| F3.8 | `lead-engine`, `ack-escalation`, `lead-milestone` | D1/GPT |
| F3.9 | `escalation-delivery`, `lead-milestone` | D1/GPT |
| F4.1 | `audit-core`, `lead-milestone` | D1/GPT |
| F4.2 | `audit-core`, `audit-view` | D1/GPT |
| F4.3 | `audit-core` | D1/GPT |
| F5.1 | `dashboard-core`, `dashboard-view` | D1/GPT |
| F5.2 | `dashboard-core`, `lead-milestone` | D1/GPT |
| F5.3 | `dashboard-core`, `dashboard-view` | D1/GPT |
| F5.4 | `dashboard-core` | D1/GPT |
| F5.5 | `dashboard-core`, `dashboard-view` | D1/GPT |
| I1.1 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.2 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.3 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.4 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.5 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.6 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.7 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.8 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I1.9 | `messaging-core`, `twilio-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.1 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.2 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.3 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.4 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.5 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.6 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.7 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I2.8 | `payments-core`, `stripe-adapter` | D1/GPT; D2/Gemini provider adapter |
| I3.1 | `calendar-core` | D1/GPT |
| I3.2 | `calendar-core` | D1/GPT |
| I3.3 | `calendar-core` | D1/GPT |
| I3.4 | `calendar-core` | D1/GPT |
| I3.5 | `calendar-core` | D1/GPT |
| I3.6 | `calendar-core` | D1/GPT |
| I3.7 | `calendar-core` | D1/GPT |
| I4.1 | `escalation-delivery`, `lead-milestone` | D1/GPT |
| I4.2 | `telegram-adapter`, `escalation-delivery` | D1/GPT; D2/Gemini provider adapter |
| I4.3 | `telegram-adapter`, `escalation-delivery` | D1/GPT; D2/Gemini provider adapter |
| I4.4 | `telegram-adapter`, `escalation-delivery` | D1/GPT; D2/Gemini provider adapter |
| I5.1 | `integration-core` | D1/GPT |
| I5.2 | `integration-core` | D1/GPT |
| I5.3 | `integration-core` | D1/GPT |
| I5.4 | `integration-core`, `jobs-core` | D1/GPT |
| I5.5 | `integration-core`, `jobs-core` | D1/GPT |
| I5.6 | `integration-core`, `deploy-operations` | D1/GPT |
| I5.7 | `integration-core` | D1/GPT |
| I5.8 | `integration-core`, `jobs-core`, `deploy-operations` | D1/GPT |
| Q1 | `auth-workspaces`, `security-regressions`, `core-acceptance` | D1/GPT |
| Q2 | `permission-admin`, `security-regressions`, `realtime-core`, `core-acceptance` | D1/GPT |
| Q3 | `permission-admin`, `security-regressions`, `lead-intake` | D1/GPT |
| Q4 | `crm-records`, `lead-engine`, `core-acceptance` | D1/GPT |
| Q5 | `lead-engine`, `ack-escalation`, `jobs-core`, `lead-milestone`, `deploy-operations` | D1/GPT |
| Q6 | `auth-workspaces`, `crm-records`, `lead-intake`, `jobs-core`, `core-acceptance`, `deploy-operations` | D1/GPT |
| Q7 | `opportunity-ui`, `recovery-ui`, `audit-view`, `dashboard-view`, `ui-foundation` | D1/GPT |
| Q8 | `opportunity-ui`, `recovery-ui`, `audit-view`, `dashboard-view`, `ui-foundation` | D1/GPT |
| Q9 | `filters-export` | D1/GPT |
| Q10 | `opportunity-ui`, `recovery-ui`, `audit-view`, `dashboard-view`, `ui-foundation` | D1/GPT |
| Q11 | `realtime-core`, `lead-milestone` | D1/GPT |
| Q12 | `dashboard-core` | D1/GPT |
| Q13 | `scaffold`, `deploy-operations` | D1/GPT |
| Q14 | `scaffold`, `ui-foundation` | D1/GPT |
