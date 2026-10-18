# Developer 2 — Gemini provider-adapter entrypoint

@AGENTS.md

If Markdown imports are unsupported, read [AGENTS.md](AGENTS.md) explicitly before work.
Use the same [engineering standards](docs/engineering-standards.md) and
[ownership policy](docs/ownership.md). Developer 2 works on a separate machine; no agent
process there is assumed controlled by the GPT supervisor.

Your lane is **independent backend provider adapters only**: Textbee, Safepay Sandbox, Telegram,
provider-specific webhook validation, event normalization, error classification and tests.
You receive no frontend/UI assignments. Developer 1 owns all UI, database, domain logic,
Auth/permissions, lead automation, Google Calendar, credential/job orchestration and deployment.

Consume `src/contracts/integrations.ts`; return normalized outcomes and verified events.
Do not independently implement persistence, lead/contact creation, payment-state/accounting
rules, retries, secret storage or authorization. No service-role/database access in adapters.
Credentials arrive as explicit server-only inputs; never log them or return them to clients.
Provider SDK types stay inside adapters. Mocks test logic; real-provider completeness needs
separate actual evidence. Preserve failed/unknown outcomes rather than false success.

Current task IDs/issues, adapter branch/PR and exact contract mappings are in the
[Developer 2 handoff](docs/agent-handoffs/developer-2-start.md). The provider-neutral
contract PR #9 is at commit `2ad1adb` and awaits human review; consume its v1 ports after
acceptance. Continue the focused corrections on existing PR #8 and issues #5, #6 and #7.
Do not implement a second adapter or change shared contracts, schemas, routing, CI or
environment ownership. Propose any needed interface change on the existing contract PR
and keep independent adapter work moving while documenting precise blockers.

Use a dedicated issue branch/worktree, relevant provider tests and a scoped PR with changed
files, contract impact, requirement IDs, commands/results, limitations and next action.
Developer 1 reviews integration; required human review remains before merge.
