# Unified Business Management Platform

A planned platform for service businesses with 5–30 employees whose leads,
customer records, conversations, payments, and appointments are scattered.
The central guarantee is **exactly one accountable owner for every lead,
with automatic escalation or recovery when ignored**.

## Status and source

Foundation A establishes repository governance. There is no application,
database schema, installed product dependency, deployment, or working integration yet.
The authoritative source is the locally supplied `problem statement.docx`, titled
*Unified Business Management Platform: Problem Statement*. See the
[source register](docs/requirements/README.md) for its fingerprint, availability,
and ambiguities. Policies are distinguished from enforced repository settings in
[repository administration](docs/repository-settings.md).

## Intended product

Accounts and configurable permissions; customizable CRM; lead capture, assignment,
acknowledgement, escalation and recovery; immutable audit history; live operational
dashboards; real Twilio messaging, Stripe test payments, Google Calendar, and
Telegram escalation notifications. These are requirements, not implemented features.

The intended workflow is intake → atomic assignment to an eligible employee →
acknowledgement within a configurable deadline → automatic reassignment on expiry →
backup/manager escalation and recovery with audit history and external notification.
Foundation B must resolve ownership when nobody is eligible without leaving a lead
unaccountable. Browser timers cannot implement durable escalation.

## Technical direction

The agreed high-level direction is a modular monolith: one Next.js/TypeScript
application and PostgreSQL database, with separate domain, presentation, data,
and provider boundaries. Supabase Auth/PostgreSQL/RLS/Realtime, React, Tailwind,
shadcn/ui, Zod, React Hook Form, Vercel, Vitest, and Playwright are intended starting
choices. Exact versions, scheduler mechanism, contracts, and schema remain subject
to Foundation B and scaffolding review. No product dependencies are selected here.

## People and navigation

Developer 1 is the primary technical lead (approximately 75–80% responsibility),
owning core domains, security, database, automation, integrations, and final integration.
Developer 2 owns independent UI foundations and explicitly assigned peripheral work
(approximately 20–25%). Human decisions govern; the supervisor coordinates and reviews.
GitHub account-to-lane mapping is pending: see [ownership](docs/ownership.md).

- [AGENTS.md](AGENTS.md): shared coding-agent entrypoint.
- [GEMINI.md](GEMINI.md): Developer 2 entrypoint, importing shared instructions.
- [CONTRIBUTING.md](CONTRIBUTING.md): task-to-PR workflow and Git safety.
- [Engineering standards](docs/engineering-standards.md): implementation and security rules.
- [Setup](docs/setup.md) and [verification](docs/testing.md): reproducible governance checks.
- [Documentation and handoffs](docs/documentation.md): durable context and future contracts.
- [Design](docs/superpowers/specs/2026-10-18-foundation-a-design.md) and
  [plan](docs/superpowers/plans/2026-10-18-foundation-a.md): Foundation A rationale and delivery.

## Getting started

For governance work, install Git and Python 3.11 or newer, clone this repository,
and follow [setup](docs/setup.md). No application installation or startup command
exists yet. Foundation B defines architecture; Foundation D supplies application
scaffolding and verified startup instructions. Do not run invented `npm` commands.
Start contributions with an assigned task and [CONTRIBUTING.md](CONTRIBUTING.md).
