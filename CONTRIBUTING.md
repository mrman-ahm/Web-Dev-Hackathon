# Contributing

## Task to pull request

1. Select an assigned issue/task with owner, dependencies, scope and acceptance criteria.
   Foundation A may use the explicit human assignment without inventing an issue number.
2. Inspect status and remote. Fetch at task start or a meaningful dependency/merge
   checkpoint. Discover the remote default (`git remote show origin`); it is currently
   `master`. Use `main` once an administrator migrates it. Never blindly pull over edits.
3. Branch from the current remote default, or an explicitly recorded dependency branch.
   Use `feat/<issue>-<name>`, `fix/<issue>-<name>`, `chore/<issue>-<name>`, or
   `docs/<issue>-<name>`. `chore/foundation-a-governance` is the initial exception.
   No invented numbers or permanent developer branches.
4. Prefer a dedicated worktree for parallel tasks; otherwise use a dedicated branch
   with one editing agent. Keep worktrees outside the repo or in ignored `.worktrees/`.
   Preserve uncommitted work; do not stash or transfer someone else's edits silently.
5. Read the relevant ownership, docs, contracts, tests and history. Coordinate shared
   changes before editing. Implement within scope, with meaningful behavior tests.
6. Run the relevant checks in [testing](docs/testing.md), review the full diff and
   staged files for secrets/unrelated edits, and update affected documentation.
7. Commit with Conventional Commits, e.g. `feat(leads): implement atomic assignment`.
   Use an honest author identity; do not impersonate another developer.
8. Push the feature branch, open a PR using the template, link the issue and request
   the appropriate human reviewer. Include actual commands/results and blocked checks.
9. Address findings, rerun affected checks, and request renewed review after substantive
   changes. Resolve conversations before merging.
10. An authorized human merges, preferably by squash, after approvals and green required
    checks. Update affected dependent issues/PRs and remove the branch when safe.

## Review and synchronization

Synchronize at task start, dependency availability, contract change, feature completion,
merge, integration milestone, or critical incompatibility. Do not constantly poll or
rebase independent work. Notify affected consumers through the relevant GitHub issue/PR.
One independent human approval is the target. Sensitive/cross-domain changes require
the other developer or another qualified human, including Developer 1-authored work.
Both developers operate on separate machines with the corrected core/UI versus provider-
adapter responsibilities in [ownership](docs/ownership.md). Agent review does not replace
required human review. Approved dependency branches can unblock implementation while
parent PR merge/retarget remains subject to that policy.
Supervisor analysis supports human review and cannot approve on a human's behalf.
If a reviewer lacks expertise or access, record the blocker and obtain a qualified
human; do not bypass policy. See [settings](docs/repository-settings.md) for enforcement gaps.

## Contracts and shared files

Open a contract-change issue before changing shared APIs, events, database interfaces,
metric definitions, or permission semantics. Identify consumers, exact proposed change,
compatibility, migration/rollback, acceptance evidence and reviewers. Developer 1
approves the technical change; affected consumers acknowledge it before implementation.
Prefer additive changes and a compatibility window; coordinate removal after consumers
migrate. Update the canonical contract and implementation/tests together. Do not publish
new interface assumptions solely in chat. Root configs and dependencies also require
explicit coordination in the task/PR, not a permission request for every small edit.

## Conflicts, bugs and recovery

Resolve conflicts on the feature branch after inspecting both changes. Preserve both
contributors' intent; consult owners when semantics conflict and rerun affected checks.
Do not force-push shared/protected branches. Prefer merge updates for published branches;
rewrite a private feature branch only with agreement from anyone using it.
If branches are incompatible, stop their integration, record the conflicting contract,
and agree on a migration/dependency order. Never choose one side mechanically.

Use the bug template with reproduction and redacted evidence. Report exploitable
security flaws privately to a confirmed repository administrator; keep credentials
and customer data out of issues. If a secret leaks, revoke/rotate it immediately,
notify the administrator privately, then coordinate history cleanup. Deleting a file
does not revoke a secret. Failed CI must be fixed or diagnosed, never bypassed.
Rollback through a reviewed revert PR with impact and verification. Database rollback
requires Developer 1's data-preservation plan; prefer corrective forward migrations.
Do not reset shared history or run destructive commands to repair a branch.
