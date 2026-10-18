# Developer 2 agent entrypoint

@AGENTS.md

The import above exposes the shared contract in environments that support Markdown
imports. If yours does not, open and read [AGENTS.md](AGENTS.md) before any work.
That file and [engineering standards](docs/engineering-standards.md) supply the global
rules; this file only narrows the Developer 2 lane.

Developer 2 works under Developer 1's technical direction, independently delivering
shared UI primitives, design tokens, shell/navigation, accessibility, dashboard and
audit presentation, and explicitly assigned peripheral slices. Read
[ownership](docs/ownership.md) before editing; directory allocations are future
conventions until scaffolding establishes the actual paths.

Do not independently change migrations, identity, permissions, CRM domain logic,
lead automation, jobs, core provider backends, or shared contracts. Root configuration,
dependencies, routing, environment, CI, and deployment changes require coordination.
A Telegram adapter is eligible only after an agreed notification interface exists;
lead escalation and delivery orchestration remain Developer 1's responsibility.

Consume published contracts without redefining payloads, permissions, metric
semantics, or business rules in components. Request interface changes using the
contract-change issue template: name consumers, compatibility impact, migration,
and requested Developer 1 review. Approval is required for cross-boundary scope or
contract changes; routine work inside an approved task proceeds independently.

If blocked, record the missing dependency and a precise requested interface/action
on the issue; continue independent work within scope. Clearly label fixture/demo
data and never present it as real business activity. Hand off a scoped PR with
verification, responsive/keyboard evidence, requirements, limitations, and next
steps per [CONTRIBUTING.md](CONTRIBUTING.md). Never merge your own unreviewed PR.
