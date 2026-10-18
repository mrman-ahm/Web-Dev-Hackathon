# Foundation A governance design

Status: implemented proposal for human review under the explicit Foundation A execution
assignment. Neither this document nor the PR claims human approval already occurred.

## Intent and inspected baseline

Create durable operating instructions for two humans and their coding agents, preserving
existing work and limiting changes to governance. Inspection found private repository
`mrman-ahm/Web-Dev-Hackathon`, remote default `master`, initial commit `ccb0e56`, an
empty tracked README, and an untracked matching official source DOCX. No product code,
CI, dependency manager, or setup commands existed. The source register preserves provenance.

## Approaches and choice

1. **Repository-native governance (selected):** shared agent entrypoint, focused linked
   policies, GitHub forms/PRs and a small documentation CI checker. Minimal tooling,
   consistent context on both laptops, and no duplicate task database.
2. One large instruction manual: fewer files, but repeated context and poor ownership
   navigation; rejected because agents need task-relevant context.
3. External agent memory/project tooling: richer automation but duplicate state,
   credentials and administration; rejected by the project collaboration policy.

This is governance architecture only. The supplied request already specifies the
operating model and authorizes reversible implementation, validation, commit and PR.
Use brainstorming/planning practices without additional approval loops for that work.
No destructive restructuring, product architecture, branch rename or server setting
change is authorized by this design. Human review remains the final delivery gate.

## Artifacts and boundaries

AGENTS owns shared agent rules including the user-supplied Lore prohibition. GEMINI
imports it and adds only Developer 2 boundaries, with an explicit fallback for unsupported
imports. CONTRIBUTING owns the development lifecycle; engineering standards own concrete
quality rules; ownership owns lanes; documentation owns recovery/handoffs. README/setup
report actual capabilities. Source register records specification access and ambiguity.
GitHub templates request useful task/change/evidence fields without bulk issue creation.
CODEOWNERS stays inactive until human-to-account mappings are confirmed. Both confirmed
accounts will be eligible for sensitive areas, avoiding sole-author approval gates.

## Safety and enforcement

Use a dedicated managed worktree and short-lived governance branch. Preserve original
DOCX and checkout. Keep secrets out of Git, logs and browser outputs; environment example
has no unconsumed runtime variables. Human policy is distinguished from GitHub enforcement.
Retain `master` as PR base now; document admin migration to protected `main` separately.
One independent human review is the target, with mandatory other-developer review for
sensitive/cross-domain changes. Supervisor review cannot substitute for human approval.

## Baseline verification and failure handling

A Python/PyYAML checker validates required artifacts, local Markdown targets/fragments,
issue/workflow YAML structure, basic credential patterns and text hygiene. CI uses
read-only permission, pinned actions and no provider secrets. No absent application
commands are referenced. Broken links/templates must fail visibly; checker limitations
are documented. Git whitespace/diff inspection and hosted-run evidence complement it.
Product CI activates only in scaffolding PRs with real commands and observed results.
If remote/CI access fails, retain the local commit and give exact recovery commands.

## Exclusions and readiness

No product code, schemas, API/event definitions, full traceability, issue decomposition,
Project board or deployment is created. Foundation B starts with shared official-source
access, complete requirement traceability and reviewed architectural decisions. Remaining
admin settings and identity confirmation are recorded rather than guessed.
