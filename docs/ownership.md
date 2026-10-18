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

## Current staffing and approval

On 2026-10-18 the primary human confirmed `mrman-ahm` currently handles both lanes.
The lane map remains useful for isolated agent tasks; it does not imply two active humans
or an accessible second laptop. Agent-produced changes require that primary human's
review. If a sensitive PR is authored by that human, obtain another qualified human
reviewer before claiming independent human review; an agent cannot self-approve or
satisfy that requirement. Current PR authoring through the connector uses `ahmad-obj`;
that account is not evidence of a second active human developer. Route review manually
until CODEOWNERS can be configured without creating impossible sole-author gates.

Developer 1 is the primary human lead (75–80% responsibility). Developer 2 (20–25%)
works independently on bounded peripheral tasks under that direction. This is not a
frontend/backend split: Developer 1 may deliver central UI alongside domain services.

Developer 2 may not independently redesign schemas, auth, permission semantics,
shared APIs, lead rules, or core integration backends. Request a contract change or
scope exception in an issue/PR, naming files, consumers, rationale and reviewer.
Developer 1 approves the exception before editing; affected owners coordinate timing.
Routine work inside approved scope needs no repeated permission request.

Every PR targets independent human review. When two humans are active, sensitive and
cross-domain work needs the other developer, including when Developer 1 is the author.
The current single-human exception above governs agent-produced PR review. Agents cannot
satisfy human approval. The supervisor inspects read-only by default, checks contracts,
requirements, evidence and integration risks, and returns findings without overwriting
assigned work. Human review must be competent for the risk; seek additional expertise
when necessary, never self-approve to unblock a merge.

## Identities and CODEOWNERS

Inspection on 2026-10-18 confirmed repository owner `mrman-ahm` has admin permission,
and connected account `ahmad-obj` has write permission. These observations do not enumerate all collaborators. The primary human subsequently
confirmed `mrman-ahm` covers both responsibility lanes.
The authenticated connector offers individual permission lookup, not collaborator listing;
unauthenticated collaborator lookup failed. Keep manual review routing until there is a valid independent-review mapping
that also works when the human is the PR author; do not activate impossible CODEOWNERS gates. The file is deliberately comments only.

When configured, put both confirmed humans on sensitive/shared patterns so an author
is never the sole eligible owner. A Developer 2-only pattern would block Developer 2's
own PR under required owner review; use both reviewers or ordinary review routing.
CODEOWNERS is routing, not proof that review or branch protection is enforced.
