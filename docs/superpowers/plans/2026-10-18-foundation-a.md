# Foundation A Implementation Plan

> For agentic workers: execute this governance plan inline using available planning,
> worktree and verification practices. No parallel editing agents are needed.

**Goal:** Deliver coherent repository governance, validated and committed for human review.

**Architecture:** Repository-native policies, GitHub forms, and documentation-only CI.
Shared rules live in AGENTS; specialized documents link to the canonical policy.

**Tech stack:** Markdown, YAML, Python 3.11+, pinned PyYAML; no application dependencies.

**Spec:** [Foundation A design](../specs/2026-10-18-foundation-a-design.md).

## Global constraints

Preserve untracked source and original checkout; no product implementation or invented
identities; Lore disabled; human review controls merge; no absent product commands in CI.
The execution directive authorizes work through a reviewable PR; no self-approval/merge.

## Review focus

Check master/main consistency; no sole-author CODEOWNERS gates; unavailable DOCX on the
second laptop; Gemini import fallback; YAML syntax and bounded checker limitations.

## Task 1: Shared operating contract

Files: README, AGENTS, GEMINI, CONTRIBUTING; docs/engineering-standards.md,
ownership.md, documentation.md, setup.md, testing.md, repository-settings.md;
requirements/README.md under docs. Consumes inspected baseline and original source;
produces canonical policy links and lane definitions, no product interfaces.

- [x] Record source fingerprint, ambiguity and missing shared distribution.
- [x] Write shared instructions, lane restrictions, lifecycle, quality and recovery rules.
- [x] Review for duplicate policies, unjustified approvals and claims of existing features.

## Task 2: GitHub and hygiene

Files: .github/CODEOWNERS, ISSUE_TEMPLATE/{feature,bug,contract-change}.yml,
PULL_REQUEST_TEMPLATE.md, workflows/ci.yml; .editorconfig, .gitattributes, .gitignore,
.env.example; scripts/check_governance.py and requirements-governance.txt.
Consumes canonical policies; produces forms and a locally runnable CI baseline.

- [x] Build focused forms and comment-only CODEOWNERS with activation prerequisites.
- [x] Add safe ignores, LF convention and comments-only environment example.
- [x] Add pinned checker dependency and least-privilege CI referencing existing scripts.

## Task 3: Validate and deliver

- [ ] Run checker and Git whitespace checks; fix all findings and inspect the entire diff.
- [ ] Exercise checker failure paths using temporary copies with broken links/YAML/secrets.
- [ ] Verify original human DOCX hash/status remains unchanged; no product paths added.
- [ ] Commit on chore/foundation-a-governance; push and open PR against actual default.
- [ ] Observe hosted CI if available; record results and admin/identity/source-sharing gaps.

Verification evidence belongs in the PR, not a duplicate ongoing progress tracker.
