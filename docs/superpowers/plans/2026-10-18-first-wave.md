# Foundation D first-wave implementation plan

> For agentic workers: use the approved architecture and task-specific TDD/verification.
> The primary human explicitly selected GPT subagents, isolated worktrees and local-first
> implementation. No repeated architecture/plan approval is required for this scope.

**Goal:** Create a real Next.js/Supabase core vertical foundation and independently
reviewable UI primitives, with a separate Gemini provider-adapter handoff.

**Architecture:** Approved modular monolith and contracts in docs/architecture.md and
contracts/. Domain logic is separate from routes/UI; user operations retain JWT/RLS;
provider adapters never own domain persistence/credentials/retries. Parent PRs remain
human merge-gated; implement on approved dependency branches and integrate locally.

**Tech stack:** Node 24.19.0 / npm 11.17.0 locally observed; Next 16.4.2 and Supabase CLI
2.121.0 observed in registry. Pin compatible installed package versions and lockfile.

**Spec:** [architecture](../../architecture.md), [database](../../contracts/database.md),
[API](../../contracts/api.md), [UI](../../contracts/ui.md), [security](../../security.md),
[acceptance](../../testing/acceptance.md).

## Global constraints

D1/GPT owns all UI and core, plus Google Calendar. D2/Gemini owns Textbee/Safepay/Telegram
adapters, provider validation/normalization/errors/tests only. Do not infer GitHub human
mappings. No production changes, paid resources, self-merge, fake provider success or
secrets in output/Git. Keep commits local; batch GitHub publication per latest instruction.
Each agent owns its branch/worktree and must not revert another's changes.

## Task 1 — Executable shared contracts and scaffold (GPT scaffold agent)

Own root package/lockfile/config, src/contracts, src/lib/errors, minimal app layout/home,
contract fixtures/tests and product CI. Do not edit supabase, feature routes, UI components,
provider adapters or existing architecture policies except setup/testing script instructions.

- [ ] Define meaningful contract rejection tests: invalid/unknown input, restricted metrics
  cannot contain values, signed net vs nonnegative transfer money, strict provider outcomes.
- [ ] Implement Zod schemas and inferred public types, including all UI DTOs and pure provider
  ports needed for Gemini; no unfinished internal module imports or SDK types crossing ports.
- [ ] Create strict TS/ESLint/Next/Tailwind, Vitest/jsdom/testing-library/Playwright foundations,
  pinned Supabase JS/SSR/CLI and provider SDK dependencies. No external provisioning.
- [ ] Establish real lint/typecheck/test/build scripts and least-privilege CI; run them once
  after implementation, fix meaningful failures, and report actual results.
- [ ] Commit only owned files on feat/core-scaffold; report SHA and exact exported interfaces.

## Task 2 — Database/Auth prerequisites (GPT database agent; parallel with Task 1)

Own supabase/config.toml, migrations/seed, tests/database and a bounded local DB test runner.
No root package changes, frontend, HTTP routes, shared contract edits or provider modules.
Use installed CLI help and local Docker only; capture/redact CLI-generated credentials.

- [ ] Build local Supabase migration workflow with Auth users/profiles, workspaces,
  memberships, role catalog/grants/overrides, invitations baseline, availability/default
  disabled pool rule/tier, initial audit and private security helpers from approved schema.
- [ ] Add meaningful SQL/live tests for bootstrap integrity, one Owner, composite tenant FKs,
  direct cross-tenant denial, anonymous/forbidden commands, optimistic conflict and audit DML denial.
- [ ] Implement the exact shared RPC surface below; check real DB and role/grant behavior.
- [ ] Verify fresh reset and migration list/tests; ensure real local Auth signup can bootstrap.
- [ ] Commit owned files on feat/auth-database; report local service URLs (not keys), RPCs,
  test evidence and blockers. Supabase ports 54321–54329 are reserved for this lane.

### RPC contract for Tasks 2 and 4

All callable functions are public with explicit authenticated EXECUTE grants only;
private helpers have fixed search_path and least privilege. User DML is not exposed.

- has_active_session() → boolean; consult current auth.uid/session_id and server session
  state; false after relevant revocation. No browser-supplied actor identity.
- get_my_workspaces() → rows {id,name,timezone,default_currency,version,membership_id,
  base_level}; only active own memberships.
- get_workspace(p_workspace_id uuid) → row {id,name,timezone,default_currency,version};
  current membership required, wrong tenant denied.
- get_my_permissions(p_workspace_id uuid) → rows {key text}; current trusted grants only.
- update_workspace(p_workspace_id uuid,p_expected_version bigint,p_name text,
  p_timezone text,p_default_currency text) → same workspace row; workspace.manage, CAS,
  audit and validation in one transaction.

Use stable safe domain error messages/codes for unauthenticated/forbidden/not-found/
stale-version/validation; document exact mapping for HTTP adapter. Signup display metadata
keys are display_name, workspace_name, timezone, default_currency; never auth facts.

## Task 3 — UI foundation (dedicated GPT UI agent; after Task 1 contracts)

Own src/components, src/styles/tokens.css, src/app/preview, tests/unit/components and
specific UI browser specs. Do not edit root packages/contracts, Auth/domain/provider code,
SQL or global app wiring. D1 owns this work; Gemini receives no UI tasks.

- [ ] Test typed props/refs, accessible form labels/errors, dialog focus/Escape/return,
  table pagination/keys, async empty/loading/error/retry and restricted dashboard values.
- [ ] Implement design tokens, responsive shell/navigation and primitives through approved
  contracts. Preview data is visibly synthetic; no fake live success or backend duplication.
- [ ] Verify component tests and phone/tablet/desktop keyboard/responsive browser evidence.
- [ ] Commit on feat/ui-foundation; report owned files, contract compatibility and evidence.

## Task 4 — Live Auth/workspace vertical slice (GPT core agent/root after shared base)

Own src/modules/identity, src/modules/permissions, src/lib/supabase, src/proxy.ts,
auth/session/workspace API routes, central Auth/settings UI and live integration/E2E tests.
Consume Tasks 1–2 interfaces; coordinate any genuine contract change first.

- [ ] Write live tests for signup → workspace Owner → login/session refresh → persisted
  workspace settings, denied unauthenticated/forbidden/cross-tenant requests and logout.
- [ ] Implement server Supabase clients, verified/revocation-aware actor resolver, schemas,
  safe errors/CSRF and user-JWT workspace RPC adapters. No service-role ordinary CRUD.
- [ ] Connect working Auth/settings pages; no hardcoded success or full-F1 completeness claim.
- [ ] Run unit/live DB/Auth/browser acceptance and application restart persistence tests;
  inspect relevant security regressions and integrate independent UI by typed contracts.
- [ ] Obtain independent code review, fix substantive findings and leave local branches/
  commits reviewable. Parent PR merge/retarget and publication remain explicit human gates.

## Review focus

Bootstrap rollback/orphans; refresh and revoked-session bypass; own vs cross-tenant direct
API/RPC/Data API; protected values in DTO/preview; signed net/refund currencies; independent
adapter ports; no shell/key leakage in local setup. Product completeness is not implied.


## Participant rubric acceptance standard

Foundation D and follow-on plans use the official [rubric traceability](../../requirements/rubric-traceability.md) and [judge demo checklist](../../testing/judge-demo-checklist.md). Optimize for full end-to-end behavior in the running application: real persisted data, bad-input and authorization behavior, duplicates/retries, refresh/restart durability and visible provider outcomes. Do not count mocks, prepared records, UI-only controls or a green unit suite as full marks.

The first integrated workflow priority is R02 CRM (12) + R03 lead assignment/escalation (14) + R05 messaging (12) + R06 payments (12) + R07 Calendar (10) + R08 notifications (4) = **64 points**. Keep R01 security (10), R04 audit/dashboard (8), R09 quality (10), R10 demo/understanding (8), and every original problem-statement requirement in scope.

Implementation order follows the dependency graph: finish Auth/workspace and configurable permission/audit prerequisites; build stored CRM and pipeline configuration; implement durable lead intake, ownership, acknowledgement, escalation and recovery; connect real provider adapters through D1-owned persistence/orchestration and complete Textbee, Safepay, Google Calendar and Telegram sandbox paths; then reconcile dashboards, quality, full acceptance and demo evidence. A criterion remains unverified until its complete live checklist passes.
