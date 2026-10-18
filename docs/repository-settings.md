# Repository administration and enforcement

## Observed on 2026-10-18

- Origin: `https://github.com/mrman-ahm/Web-Dev-Hackathon`; private repository.
- Initial default branch: `master`, initial commit `ccb0e56` with empty README only.
- Connected account `ahmad-obj`: write permission; repository owner `mrman-ahm`: admin.
  The connector reports the connected account has no admin/maintain permission.
- Squash merging is available. No protection or ruleset enforcement was verified;
  unauthenticated protection inspection was denied. Do not interpret denied access as
  evidence that protection is absent. Local `gh` is unavailable.

## Administrator checklist (pending, not applied by this PR)

1. Two human developers use GPT/core+all UI and Gemini/provider adapters respectively.
   Confirm GitHub-to-human mappings and reviewer eligibility; do not infer them from
   account permissions. Keep manual routing until CODEOWNERS has a feasible mapping. Use eligible independent reviewers for sensitive/shared paths; avoid sole-author gates.
2. Migrate the default to `main` deliberately: preserve history, retarget open PRs and
   update local tracking/docs. Until then contribute against `master`; CI supports both.
3. Protect the actual default branch with PRs, one independent human approval, dismissed
   stale approvals, resolved conversations, and required `Governance / governance`
   after its first successful run. Verify the exact displayed check name. Block force
   pushes/deletion and direct pushes; include administrators where practical. Document
   any emergency bypass with human authorization, reason and corrective review.
4. Require code-owner review only after valid mappings are active. Sensitive/cross-domain
   changes require the other developer under policy even before GitHub can enforce it.
5. Prefer squash merges and disable automatic deletion only if dependent branches need
   preservation; coordinate cleanup. Never enable automatic self-approval/merge by agents.
6. Enable available secret-scanning/push-protection/dependency alerts appropriate to the
   repository plan. Add product checks when real scripts/fixtures exist (see testing).
7. Verify issue forms and default PR template after governance lands on the default branch.

Policies in Markdown, comments in CODEOWNERS, and a workflow committed on a feature
branch do not prove server settings. Record actual settings/run evidence on the PR.
Do not require impossible approvals with two developers; obtain another authorized
human when both existing humans coauthor sensitive work and independence is unavailable.
