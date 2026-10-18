# Setup

## Local application foundation

Prerequisites: Git, Node **24.19.0** (`.nvmrc`), npm **11.17.0**, Python 3.11+ for
governance checks, and repository access. Runtime dependencies are exact and
`package-lock.json` is the single application lockfile.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The landing page describes foundation status; it does not
claim live CRM/provider features. The scaffold requires no provider credentials.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

The initial scaffold installation, lint, strict types, contract tests, production build
and HTTP startup were checked locally. Auth/database tests require the separate
Supabase foundation; do not infer live Auth acceptance from these scaffold checks.
`npm run db:local`, `npm run db:reset` and `npm run db:test` wrap the pinned CLI;
they require Docker and the integrated `supabase/config.toml`/migrations. Their live
verification belongs to the database/Auth delivery. Use CLI `--help` before local
service commands; do not print generated secret keys into shared logs.

Governance commands:

```sh
python3 -m venv /tmp/ubmp-governance-venv
/tmp/ubmp-governance-venv/bin/python -m pip install -r scripts/requirements-governance.txt
/tmp/ubmp-governance-venv/bin/python scripts/check_governance.py
git diff --check
```

The governance tool dependency remains separately pinned. An existing environment
with that exact PyYAML version can also run the checker. Database/provider acceptance
requires the corresponding foundation and actual external services; installing SDKs
does not establish integration completeness.

The lint setup uses explicit TypeScript, React Hooks and accessibility rules. The
current compatible ESLint 9 line emits an upstream end-of-support warning; do not
force incompatible peer upgrades. The initial pinned tree has no npm audit advisories.

## Local configuration and source document

Copy `.env.example` to ignored `.env.local` and set the following values to use the
Auth/workspace HTTP routes:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | server-only | Exact browser origin used for cookie-write Origin checks and PKCE redirects; use `http://localhost:3000` locally and HTTPS in deployment. |
| `SUPABASE_URL` | server-only | Supabase project URL; local foundation uses `http://127.0.0.1:54321`. |
| `SUPABASE_ANON_KEY` | server-only | Supabase anon/publishable project key. Never use `service_role`. |

Values are read lazily when an Auth route runs, so lint, tests and production builds do
not require runtime configuration. Put local values only in ignored `.env.local`; never
put privileged values in public-prefixed variables. Use separate test/development/
production resources and a secret manager for deployed values. Avoid real customer
data. Configure publicly reachable HTTPS webhooks only when provider features exist,
and document sandbox limits then.

The original DOCX remains untracked and unchanged in the original developer checkout.
Foundation B adds a byte-identical versioned copy at `docs/requirements/problem-statement.docx`
with its SHA-256 in the source register. Both laptops can read the same authority; no
ChatGPT attachment path or external memory service is required.
