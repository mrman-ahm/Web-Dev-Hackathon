# Verification and CI

## Current baseline

`python3 scripts/check_governance.py` requires Python 3.11+ and
[scripts/requirements-governance.txt](../scripts/requirements-governance.txt).
It checks required artifacts, local Markdown file/fragment links, YAML parsing and
selected issue-form/workflow structure, inactive CODEOWNERS, whitespace hygiene and
common credential patterns. It is a bounded baseline, not a complete secret scanner,
Markdown linter, GitHub schema validator, or product test suite. `git diff --check`
adds Git's whitespace check. Source DOCX availability is reported, not required on CI.

CI runs `Governance / governance` on pushes to `master` or `main` and every PR. It
installs the pinned checker dependency, runs the checker, and checks committed patch
whitespace. It has read-only contents permission, no repository/provider secrets,
no write-back, and no `pull_request_target` execution. Actions are pinned by commit.
Do not execute untrusted PR code in privileged workflows. Local results and a valid
workflow do not establish hosted CI success; inspect the actual run before claiming it.

## Activation with scaffolding

The scaffolding PR must select and document Node/package-manager versions and one
committed lockfile, then add scripts and CI jobs for frozen dependency installation,
lint, strict typecheck, unit tests and production build. Require those jobs only after
observing them pass. Database foundation adds disposable database migration validation
(fresh setup and upgrade), integration/RLS and security regressions. Lead automation
adds concurrent-worker and restart/retry tests. Provider implementations add signed
webhook/idempotency tests and separately recorded real sandbox acceptance evidence.
Critical user journeys add Playwright E2E; UI changes include keyboard/responsive checks.
No absent script is silently treated as passing. Do not add a conditional product job
that stays skipped while suggesting implementation has been verified.

Tie acceptance evidence to original IDs (for example F3.8, I1.8, Q5); mocks and fixtures
must be labeled. For each PR report exact commands, environment, outcomes, skipped
checks/reasons, and remaining limitations. Rerun affected checks after fixes. Do not
weaken required checks or merge around failure; escalate infrastructure blockers.

Template references: [GitHub issue-form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
and [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

## Official requirements source check

`python3 scripts/check_requirements.py` uses only the Python standard library to verify
the versioned DOCX fingerprint and all 81 exact summary/acceptance rows in traceability.
It detects omissions/duplicate IDs and missing mapping columns. This proves source
coverage, not product acceptance or API/database correctness. CI runs it with governance.
