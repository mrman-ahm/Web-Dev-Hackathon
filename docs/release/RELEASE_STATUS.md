# Release status — integration candidate

Snapshot: the release PR head on integration/emergency-unified, based on 83d7fb8ad7df9092c8c6fb8b3a8a1ac94568a9a4. Default branch remains master at the previously verified dde034a80a387d376d904f301e8f61a13af4a366. The release PR is for review; no default-branch merge is claimed.

## Recovered work

- Core Next.js/TypeScript scaffold, UI primitives and workspace shell.
- Supabase email/password Auth, session handling, workspace bootstrap and permission APIs.
- PostgreSQL migrations for identity/workspaces, durable job records/dispatch, audit, permission administration, and companies/contacts CRM.
- Server-side company/contact CRUD with workspace and ownership enforcement, optimistic versions, audit entries, and CRM browser workflow.
- Provider-neutral Textbee/Safepay/Telegram/Google contract types and provider-security contract tests.
- Official problem statement and Participant Rubric, requirement mapping, and coordination/quality governance.

Provider adapters were not merged because they require contract/security review and the integrated candidate has no provider routes. The candidate builds on the cumulative auth/workspace base; CRM records and audit/jobs/permissions were selectively integrated. Provider adapter branches and unmerged provider PRs remain isolated. Active local worktrees were left untouched.

## Verification evidence

- TypeScript, ESLint and production build passed on the code baseline before this documentation-only release update.
- Vitest: 20 files / 100 tests passed.
- Isolated local Supabase acceptance: 4 database suite files / 174 assertions passed; 18 real local Auth/PostgREST checks passed. Only a disposable /tmp Supabase project was reset.
- Playwright: 4 desktop browser tests passed against local Supabase, covering signup/session, workspace persistence, CRM create/edit/reload/archive and stale/invalid flows.
- Governance, requirement-map and patch-whitespace checks passed at the integration checkpoint. Hosted migration/deployment and real provider acceptance have not been run.

No known failing automated checks remain. GitHub Actions Product and Governance workflows both passed on the PR head before the final documentation-status update. Hosted Supabase migrations, hosted Auth and live provider workflows are not covered by CI.

## Rubric matrix

Browser means an automated local browser test; judge demo means observed on a deployed judge-ready app. No criterion has a verified live judge demo.

| Criterion (marks) | Source / functional status | Automated / browser evidence | External / judge status |
| --- | --- | --- | --- |
| Lead assignment and escalation (14) | Not implemented; job storage/claiming alone does not execute leads | No lead workflow test | No provider or judge demo |
| Customizable CRM (12) | Partial: companies and contacts CRUD; no opportunities, editable pipelines, required stage fields or custom fields | CRM service tests; real local Auth/DB browser CRUD test | No deployed judge demo |
| Messaging (12) | Contracts only; no integrated adapter or application route | Contract tests only | Not live-tested; no callback URL |
| Payments (12) | Contracts only; no checkout/webhook/accounting route | Contract tests only | Not live-tested; no callback URL |
| Roles, permissions and security (10) | Auth/workspace and permission enforcement integrated | Unit, DB/Auth and browser tests; tenant-isolation checks passed locally | Hosted deployment not checked; no judge demo |
| Google Calendar (10) | Not implemented; no Google OAuth/event route | No functional Calendar test | No redirect URI; not live-tested |
| Quality (10) | Core candidate has lint/type/build and test evidence | Above local checks passed | Not a deployed release; no judge demo |
| Audit log and dashboard (8) | Audit persistence/API exists; no complete judge-facing dashboard/audit workflow | Database/unit tests cover audit behavior | No judge demo |
| Demo and understanding (8) | Only Auth/workspace/companies/contacts can be demonstrated | Local automated flows available | Use DEMO_RUNBOOK.md; not judge-verified |
| Notifications (4) | Not implemented in integrated application | Provider contract tests only | No Telegram delivery |

## Release blockers and remaining work, priority order

1. This candidate is a draft release PR and is not merged to master; human review and required checks remain.
2. Hosted Supabase migration/auth and Vercel deployment have not been exercised. Configure only after inspecting the PR diff.
3. Lead engine/assignment/escalation, configurable opportunity pipelines/custom fields, provider routes/adapters, Calendar OAuth, notification dispatch, and complete dashboard/audit UI are incomplete or absent.
4. Durable job rows and a signed claim endpoint exist, but no production scheduler or job executor completes those jobs. Automatic escalation/outbox delivery must not be claimed.
5. Gemini provider work remains outside this branch pending corrected adapters and compatibility/security review. No real-provider acceptance was observed.

## Required next actions

- Reviewer: inspect and approve the release PR; merge only after required checks pass.
- Deployer: follow DEPLOYMENT_RUNBOOK.md, deploy the candidate to a test Vercel environment, then validate Auth/CRM before a judge demo.
- Developers: base compatible follow-up work on the final approved integration commit; deliver lead engine, provider routes/adapters, Calendar and remaining rubric flows as separate reviewed changes.
