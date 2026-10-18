# Local database foundation

The initial database foundation implements identity/workspace prerequisites,
current-session checks, permission resolution, configuration and audit writes. The
CRM records migration adds tenant-scoped company/contact storage and commands; it does
not claim full CRM, lead automation or provider integration acceptance.

## Start and verify

Use the pinned Supabase CLI from the shared application package (`2.121.0` in this
wave), Docker and Python 3. Work from a checkout containing this migration:

```bash
npx supabase start --exclude studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
npx supabase db reset --local
npx supabase migration list --local
bash scripts/test-database.sh
python3 tests/database/auth-live.py
npx supabase db advisors --local --type security --level warn
```

`db reset --local` destroys only this local project's existing data; never use
`--linked` or a cloud database URL for these tests. Local project identifier is
`ubmp_core_foundation`, API `http://127.0.0.1:54321`, database port `54322`, SMTP
preview `54324` and shadow database `54328`. Tests accept only the expected local
API URL. Database SQL tests roll back fixtures. Auth API tests create synthetic
`example.test` users and retain their workspaces for restart verification.

CLI status/start output contains development keys: capture it privately when using
automation; never paste it into chat, logs, PRs or committed files. The live test
runner reads status through a captured subprocess and prints only test labels.
There are no credentials/customer records in the seed. Local email confirmation
is disabled by the CLI's local default; production confirmation/rate-limit settings
require separate deployment review. Local password policy is 12 characters with
lowercase, uppercase and digits. Auth signup metadata accepts only display inputs:
`display_name`, `workspace_name`, `timezone`, `default_currency`. Identity, grants
and Owner membership are determined by the database, never metadata role keys.

## Applied RPC interface

All public RPC execution is granted explicitly to `authenticated`, never `anon`.
PostgREST represents set-returning rows below as JSON arrays.

| Function / exact named parameters | Result |
| --- | --- |
| `has_active_session()` | boolean |
| `get_my_workspaces()` | rows `{id uuid,name text,timezone text,default_currency text,version bigint,membership_id uuid,base_level text}` |
| `get_workspace(p_workspace_id uuid)` | rows `{id,name,timezone,default_currency,version}` |
| `get_my_permissions(p_workspace_id uuid)` | rows `{key text}` |
| `update_workspace(p_workspace_id uuid,p_expected_version bigint,p_name text,p_timezone text,p_default_currency text)` | same workspace row |

Workspace IDs are requested scope, never authorization. A missing/inaccessible
workspace returns `PT403 / FORBIDDEN` without disclosing its existence. Missing,
expired, deleted or actor-mismatched sessions return `PT401 / UNAUTHENTICATED`.
A stale expected version returns `PT409 / STALE_VERSION`; invalid names/timezones/
currency formatting return `PT400 / VALIDATION_FAILED`. PostgREST maps these to
HTTP 403/401/409/400. The HTTP adapter must translate stable codes into its public
error shape and must not serialize arbitrary database detail.

## Reviewed managed-Auth privilege exception

All public domain RPCs are owned by `ubmp_command`, a `NOLOGIN NOBYPASSRLS` role.
It receives explicit SELECT plus workspace UPDATE and audit INSERT privileges,
with dedicated RLS policies. Direct user DML is revoked. Current membership/grants
are resolved through `ubmp_reader`, also `NOLOGIN NOBYPASSRLS`. Bootstrap has its
own insertion-only `ubmp_bootstrap` role; it never grants identity from metadata.
None is inherited by `anon` or `authenticated`. Temporary schema CREATE grants
needed to assign function ownership are revoked in the migration.

Supabase's managed `auth.users` and `auth.sessions` have RLS and no policies for
custom roles. Its `auth` schema also does not give migration `postgres` USAGE grant
option. Creating broad Auth policies, altering managed ownership, granting a custom
role global BYPASSRLS, or granting a client privileged membership is avoided.

The approved narrow exception is **`private.active_session()`**, a postgres-owned
`SECURITY DEFINER` function with empty fixed search path and no parameters. It
returns only whether the gateway's current `auth.uid()`, `session_id` and JWT expiry
match an existing unexpired session and active, nonanonymous, nondeleted, unbanned
Auth user. It never returns rows, accepts an arbitrary actor, or executes dynamic
SQL. Its EXECUTE privilege is revoked from PUBLIC, `anon` and `authenticated`;
only the command/reader roles invoke it. Clients can call the restricted public
boolean wrapper. RLS uses that wrapper or narrowly scoped own-membership/permission
helpers. Definer helpers fully qualify all object names.

Owner integrity uses a deferred owner foreign key and deferred constraint triggers
plus a partial unique index for one active Owner. Bootstrap, default roles/grants,
Offline availability, disabled rule, pool tier and initial audit all share the
Auth insert transaction. A bootstrap error rejects Auth signup. No raw business
table is added to Realtime. Audit UPDATE/DELETE/TRUNCATE triggers reject mutation;
this is application tamper resistance, not protection from database administrators.

## Evidence and follow-on work

SQL tests exercise Owner integrity, rollback, tenant FK constraints, direct Data API
privileges, RLS, current permission resolution, optimistic conflict and audit denial.
Live API tests exercise real Auth signup/password login/refresh/logout and real
PostgREST RPC/table operations. These tests are not mocks or third-party acceptance.
Invitation acceptance, permission administration, owner transfer, password reset,
profile editing and operational lead workflows remain later implementation tasks.

Observed locally: PostgreSQL 17.11; fresh reset and migration history alignment passed.
55 SQL assertions and 18 real local Auth/Data API checks passed. The local security
advisor reported no issues. Application-process restart acceptance is coordinated
by the core HTTP implementation; these results do not claim that later check.

## CRM records verification

`tests/database/crm_records.sql` covers tenant foreign keys, row-level security,
direct-DML revocation, active-session and permission enforcement, user-owned record
scope, canonical phone uniqueness, expected-version conflicts, audit facts and safe
archives. Run both database suites against the selected disposable local project with
`SUPABASE_DB_CONTAINER=supabase_db_<project_id> bash scripts/test-crm-database.sh`.
The runner defaults to the core foundation container for the normal project. Do not
point it at a shared or cloud database. The CRM UI uses these same services through its
workspace page and versioned API; its browser persistence check reloads the page and
reads the real database-backed records.
