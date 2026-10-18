# Ownership and review

Ownership routes coordination and review; an explicitly approved task may cross a boundary.
The directory map is prospective until Foundation B/D establishes the actual structure.

| Area / intended path | Primary responsibility | Review / coordination |
| --- | --- | --- |
| `supabase/`, database migrations and RLS | Developer 1 | Other human review; schema/data-loss approval by Developer 1 |
| `src/modules/identity/`, `permissions/`, `crm/`, `leads/`, `audit/` domain | Developer 1 | Other human review for sensitive/cross-domain changes |
| Jobs, core messaging/payments/calendar/integration backends | Developer 1 | Other human review plus supervisor analysis for security/concurrency |
| `src/contracts/`, `docs/contracts/` | Developer 1 technical authority | Affected consumers acknowledge approved changes |
| `src/components/`, design tokens, shell | Developer 2 | Developer 1 review; coordinate global routes |
| Dashboard/audit presentation, read-only views | Developer 2 when assigned | Consume approved read models; no new metric/permission semantics |
| Telegram adapter | Developer 2 when assigned | Agreed interface first; orchestration/secrets/jobs remain Developer 1 |
| `src/app/`, `src/lib/`, root config, dependencies, CI, env, deployment | Shared | Explicit task scope and affected-owner coordination |
| Tests | Implementing domain owner | Cross-cutting suites shared; do not weaken another lane's checks |
| Governance/docs | Shared; Developer 1 arbitrates | Material policy changes require explicit human approval |

Developer 1 is the primary human lead (75–80% responsibility). Developer 2 (20–25%)
works independently on bounded peripheral tasks under that direction. This is not a
frontend/backend split: Developer 1 may deliver central UI alongside domain services.

Developer 2 may not independently redesign schemas, auth, permission semantics,
shared APIs, lead rules, or core integration backends. Request a contract change or
scope exception in an issue/PR, naming files, consumers, rationale and reviewer.
Developer 1 approves the exception before editing; affected owners coordinate timing.
Routine work inside approved scope needs no repeated permission request.

Every PR targets independent human review. For sensitive and cross-domain work the
other developer must review, including when Developer 1 is the author. Agents cannot
satisfy human approval. The supervisor inspects read-only by default, checks contracts,
requirements, evidence and integration risks, and returns findings without overwriting
assigned work. Human review must be competent for the risk; seek additional expertise
when necessary, never self-approve to unblock a merge.

## Identities and CODEOWNERS

Inspection on 2026-10-18 confirmed repository owner `mrman-ahm` has admin permission,
and connected account `ahmad-obj` has write permission. These observations do not
establish which person is Developer 1 or Developer 2, or enumerate all collaborators.
The authenticated connector offers individual permission lookup, not collaborator listing;
unauthenticated collaborator lookup failed. Confirm both lane assignments and write
access before activating CODEOWNERS. The file is deliberately comments only.

When configured, put both confirmed humans on sensitive/shared patterns so an author
is never the sole eligible owner. A Developer 2-only pattern would block Developer 2's
own PR under required owner review; use both reviewers or ordinary review routing.
CODEOWNERS is routing, not proof that review or branch protection is enforced.
