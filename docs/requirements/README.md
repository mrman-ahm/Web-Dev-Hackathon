# Official source register

The original `problem statement.docx` was present and read in full from the original
working checkout on 2026-10-18. Its title is *Unified Business Management Platform:
Problem Statement*. Its file size is 31,474 bytes; SHA-256:

```text
cd3ded4437822f60a3bdb851256558d2b70a8f50a0d80cb48307e499c2f30745
```

It is an existing untracked human file and is deliberately not added, moved or changed
by Foundation A. Its XML text was read using Python's standard-library ZIP/XML tools;
Word pagination/layout was not rendered. The supplied brief describes 12 pages.
This register is source provenance, not a full traceability matrix. Authorized sharing
of the original with other developers and CI remains a documentation dependency.
Foundation B must establish a durable shared source location and verify all acceptance
criteria directly against it; do not rely exclusively on the master prompt or this note.

## Known ambiguities for Foundation B

- Scope says one customizable pipeline; F2.3 requires two pipelines with different fields.
  Preserve both statements. The human instruction is to design for multiple pipelines
  unless clarified; record the interpretation in architecture/traceability.
- F3.3 excludes unavailable employees from assignment; the central guarantee always
  requires an accountable person. Resolve the no-eligible-employee and backup/manager
  eligibility case explicitly without silently weakening either rule.
- F3.6 requires a defined, visible treatment of already acknowledged leads on absence;
  the specification does not prescribe the policy. Obtain an explicit domain decision.

The source explicitly accepts Telegram for I4 and requires notification within the
same minute (I4.1). Its glossary defines qualifying acknowledgement actions, first
response time, recovery, and collected revenue; carry those exact semantics into
Foundation B. F1–F5, I1–I5 and Q1–Q14 all remain in scope. No product requirement is
claimed implemented by governance checks.
