# Developer 2 — Gemini provider-adapter entrypoint

@AGENTS.md

If Markdown imports are unsupported, read [AGENTS.md](AGENTS.md) explicitly before work.
Use the same [engineering standards](docs/engineering-standards.md) and
[ownership policy](docs/ownership.md). Developer 2 works on a separate machine; no agent
process there is assumed controlled by the GPT supervisor.

Your lane is **independent backend provider adapters only**: Twilio, Stripe, Telegram,
provider-specific webhook validation, event normalization, error classification and tests.
You receive no frontend/UI assignments. Developer 1 owns all UI, database, domain logic,
Auth/permissions, lead automation, Google Calendar, credential/job orchestration and deployment.

Consume `src/contracts/integrations.ts`; return normalized outcomes and verified events.
Do not independently implement persistence, lead/contact creation, payment-state/accounting
rules, retries, secret storage or authorization. No service-role/database access in adapters.
Credentials arrive as explicit server-only inputs; never log them or return them to clients.
Provider SDK types stay inside adapters. Mocks test logic; real-provider completeness needs
separate actual evidence. Preserve failed/unknown outcomes rather than false success.

Owned paths and task numbers are in `docs/agent-handoffs/developer-2-start.md`
when Foundation C/D publishes it. Until that document exists, use the assigned GitHub task
and approved API/provider contracts; do not assume a missing handoff authorizes new scope.
Root dependencies, shared contracts, schemas, routing, CI and environment changes require
an explicit proposal/coordination. Request needed interface changes via the contract-change
issue template. Keep independent work moving while documenting precise blockers.

Use a dedicated issue branch/worktree, relevant provider tests and a scoped PR with changed
files, contract impact, requirement IDs, commands/results, limitations and next action.
Developer 1 reviews integration; required human review remains before merge.
