# Documentation and durable handoffs

## Canonical artifacts

- Official problem statement: authoritative product behavior; source register in
  [requirements](requirements/README.md). Foundation B creates full traceability.
- GitHub issue: assigned task, scope, dependencies, acceptance and blockers.
- `docs/contracts/` (future): canonical API, event and database interfaces; not chat.
- `docs/decisions/` (future): accepted architectural decisions with status, rationale,
  alternatives, consequences and approving human. Proposals are labeled proposed.
- PR: implementation, requirement IDs, evidence, risk, limitations and next action.
- README/setup: current status and commands actually verified against the repository.

Update the canonical document in the same PR as a behavior or contract change. Link
rather than duplicate. Never copy issue status into a separate progress file. Drafts
must say they are drafts; only humans approve material governance changes. Preserve
superseded decisions with links to their replacements. Create future directories only
when their first real artifact exists. Foundations B (architecture), C (task planning)
and D (features) remain unimplemented by Foundation A.

## Task and PR handoff

A receiving agent needs: issue/task reference, owner, dependency refs, exact permitted
files and restricted areas, contracts consumed/produced, acceptance criteria, expected
checks and required reviewer. Completion adds changed files, contract/migration impact,
commands and outcomes, requirements covered, limitations, blockers and next owner/action.
Use existing issue/PR fields; no separate tracking service or perpetual agent process.

## Supervisor recovery after context loss

1. Read AGENTS, README, ownership and contribution rules; inspect local status/remote.
2. Read relevant architecture/decisions if present; distinguish proposals from approval.
3. Inspect current assigned GitHub issues, open PRs and recently merged changes.
4. Read relevant contracts, implementations and tests, checking dependency versions/refs.
5. Inspect latest CI and acceptance evidence; rerun only where changes or uncertainty
   justify it. Missing evidence remains unverified, regardless of an agent's report.
6. Resume the next approved dependency. If GitHub is unavailable, use local history and
   record inaccessible task/review state; do not guess completion or edit a claimed lane.
