# Developer 1 — GPT core and all UI

Read [AGENTS](../../AGENTS.md), [ownership](../ownership.md), [architecture](../architecture.md),
[API](../contracts/api.md), [database](../contracts/database.md), [UI](../contracts/ui.md),
[events](../contracts/events.md), [security](../security.md) and the relevant task/tests.
Primary human approved the architecture on 2026-10-18; implement within it without
repeated design approval. New major deviations still need the primary decision.

## Initial work packages

Coordination issue #4 tracks this local-first wave; architecture issue #2 / PR #3 is the
approved architecture dependency. Use task codes from [catalog](../coordination/backlog.json),
not invented GitHub IDs. Provider issues #5, #6 and #7 and contract PR #9 are published;
other task issue references are recorded only when they actually exist:

1. `scaffold`: Next.js/dependencies/strict configs, executable shared schemas, fixtures and CI.
2. `auth-workspaces`: Supabase schema/RLS/bootstrap and actual Auth/session/workspace vertical slice.
3. `ui-foundation`: all design tokens, responsive shell/components, accessibility and previews.
4. `core-acceptance`: real Auth/tenant/persistence/restart proof; full F1 remains separate.

Spawn suitable GPT workers in separate branches/worktrees with disjoint ownership.
Scaffold owns root config/contracts; database owns supabase and database tests; UI waits
for the shared contract commit and owns components/styles/preview tests. Core HTTP/Auth
consumes both stable interfaces. Do not concurrently edit the same working tree.

## Setup and branch execution

Current observed runtime: Node24.19.0, npm11.17.0, local Docker28.5.2 available. Exact
installed versions/scripts belong to package.json/lockfile and setup docs after scaffold.
Once present, use `npm ci`, then the documented lint/typecheck/test/build scripts. Start
local Supabase using its pinned CLI and approved config; capture generated credentials
privately into ignored local configuration, never tool output/PRs. No cloud project or
paid provider setup is needed for first local Auth/database evidence.

Use `feat/core-scaffold`, `feat/auth-database`, `feat/ui-foundation` for the unpublished
local task packages, then issue-number names when real task issues exist. Parent PRs are
stacked: #1 governance → #3 architecture → coordination/shared foundation → independent
feature slices. Preserve history and human review before default-branch integration.
Current user instruction is local work with consolidated remote updates, not repeated pushes.

## Acceptance and restrictions

D1 owns all UI, architecture, database/Auth/permissions, CRM/leads/jobs, Google Calendar,
provider-independent orchestration, tests/security and deployment. D2 owns independent
Textbee/Safepay/Telegram adapters only; do not duplicate their SDK code without coordination.
Use stable public module/contracts; no service-role ordinary CRUD, fake success or live
metrics, raw secret publication, bypassed RLS or browser-owned deadlines.

Prove real signup creates workspace+Owner; login/refresh/logout; workspace settings
persistence and version conflict; unauthorized/cross-tenant direct API/RPC/Data API denial;
append-only initial audit; fresh migrations and restart persistence. UI independently
proves typed rendering, responsive/keyboard behavior and restricted fields never serialized.
Run meaningful unit/live integration/browser checks, not only mocked Auth. Report exact
scope/evidence and keep unimplemented criteria Not started. See [acceptance](../testing/acceptance.md).

Commit owned work locally, send SHA/interfaces/tests/limitations to supervisor, obtain
independent code review and fix substantive findings. Preserve branch for review and
provide a concrete next-owner handoff. Never self-approve/automatically merge.
