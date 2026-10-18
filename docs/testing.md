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

## Application checks

The scaffold provides `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`. `Product / product` installs via `npm ci` and runs all four, using
Node from `.nvmrc`, read-only permissions, pinned Actions, and no provider credentials.
It is configured locally; hosted success is not claimed before a published run.

Vitest runs contract/core tests in Node and component tests under
`tests/unit/components/` in jsdom. Synthetic fixtures are parsed by the canonical
schemas in `src/contracts/`; never import fixtures into live application routes.
Contract tests cover unknown input rejection, field masking, precise/signed money,
provider outcome normalization, safe errors and domain-event shape. These tests do
not prove live Supabase/Auth or external-provider behavior.

`npm run test:e2e` is the Playwright entrypoint for `tests/e2e/`. Install browsers
with `npx playwright install chromium webkit` when browser specs are available.
Viewport projects cover desktop Chromium, tablet WebKit and phone WebKit. Running
browser commands requires relevant specs and a running application (the configuration
starts the development server by default). Browser acceptance is reported separately.

Database foundation adds disposable migration validation, integration/RLS and
security regressions. Live integration tests must have their own explicit command and
service prerequisites; do not make CI silently skip them while claiming acceptance.
Lead automation adds concurrent-worker and restart/retry tests. Provider adapters add
signature/normalization tests and separately recorded real sandbox evidence. Critical
journeys add Playwright coverage; UI includes keyboard and responsive checks.

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
