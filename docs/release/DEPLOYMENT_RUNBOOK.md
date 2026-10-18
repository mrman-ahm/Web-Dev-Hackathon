# Deployment runbook

## Release snapshot

- Repository: https://github.com/mrman-ahm/Web-Dev-Hackathon
- Default branch: master (unchanged).
- Candidate branch: integration/emergency-unified; deploy only after reviewing the release PR.
- Candidate commit: use the exact head SHA shown on the release PR; the PR head is the reviewed snapshot.
- This is a deployable core/Auth/CRM candidate, not a complete rubric release. Review RELEASE_STATUS.md first.
- No merge to master is claimed. Required review and checks remain authoritative.

## Prerequisites

- GitHub access to the repository.
- Node 24.19.0 and npm 11.17.0 for local work (.nvmrc and package.json).
- A Supabase project and Vercel project.
- Google, Safepay Sandbox, textbee and Telegram accounts are useful only after their missing application routes/adapters are implemented. Do not enter their credentials for this candidate; no such integration configuration is consumed by the integrated application.

## 1. Supabase project and migrations

1. Create a Supabase project. In Project Settings → API, copy the project URL and publishable/anon key. Keep the service_role key private.
2. From a trusted local checkout on the candidate branch, install dependencies with npm ci, authenticate the Supabase CLI, then link the project and apply the versioned migrations:

       npx supabase login
       npx supabase link --project-ref <PROJECT_REF>
       npx supabase db push

   Review the proposed migration list before confirming. db push applies the ordered files under supabase/migrations; never run db reset against a hosted project.
3. Confirm the schema and functions in Supabase SQL Editor / Database. The migrations create identity/workspace, jobs, audit, permission-admin and CRM-record foundations. Isolated local acceptance passed four database suites (174 assertions). No hosted Supabase project was available for this release check.
4. In Authentication → URL Configuration, set Site URL to https://<YOUR_VERCEL_DOMAIN> and allow the confirmation callback https://<YOUR_VERCEL_DOMAIN>/auth/callback. For local development allow http://localhost:3000/auth/callback and use a separate local project.
5. Use email/password Auth. Signup bootstraps the Owner/workspace. Keep RLS and migration grants as shipped; do not add broad table grants or expose the service-role key.

## 2. Vercel deployment

1. Import mrman-ahm/Web-Dev-Hackathon into Vercel.
2. Select integration/emergency-unified for this candidate. The default branch is still master; the release PR is not merged.
3. Framework: Next.js (auto-detected). Root directory: repository root. Install command: npm ci; build command: npm run build; output directory: leave default.
4. Configure runtime variables in Vercel → Project → Settings → Environment Variables. Set Production and Preview separately, using values from the matching Supabase project. Never use a NEXT_PUBLIC_ prefix for secrets.
5. Deploy, then set APP_ORIGIN to the exact HTTPS origin Vercel assigned (origin only, no path or trailing slash) and redeploy. Configure the same origin in Supabase Auth URL settings.

## Environment variables used by this repository

| Variable | Required | Source / purpose | Visibility |
| --- | --- | --- | --- |
| APP_ORIGIN | Core runtime | Exact app origin; Vercel deployment domain | Server-side; HTTPS in deployment |
| SUPABASE_URL | Core runtime | Supabase Project Settings → API | Server-side |
| SUPABASE_ANON_KEY | Core runtime | Supabase Project Settings → API publishable/anon key | Server-side in this app; never substitute service role |
| SUPABASE_SERVICE_ROLE_KEY | Optional, internal job-dispatch route only | Supabase Project Settings → API service-role key | Secret; server-only |
| JOBS_DISPATCH_SECRET_CURRENT | Optional, internal job-dispatch route only | Generate a unique random secret and configure caller and Vercel consistently | Secret; server-only |
| JOBS_DISPATCH_SECRET_PREVIOUS | Optional rotation overlap | Previous dispatch signer during rotation | Secret; server-only |
| PLAYWRIGHT_BASE_URL | Tests only | Browser test target; defaults to localhost | Not a production setting |

The first three are needed for authenticated application workflows. No variables are needed merely to compile the Next.js build. NODE_ENV and CI are platform-provided. No textbee, Safepay, Google OAuth or Telegram environment variable is currently read by integrated application code.

## 3. Google Calendar

Google Calendar OAuth and event routes are not implemented on this candidate. The existing /auth/callback is the Supabase email-confirmation/PKCE callback; it is not a Google OAuth callback. There is no valid Google redirect URI, scope set or Calendar test to configure yet. Do not register the Supabase callback as a Google redirect URI.

## 4. Safepay Sandbox

No Safepay checkout or webhook route is present in this candidate. Do not configure an endpoint or accept payments from it. The API key/private API secret are not substitutes for the merchant webhook signing secret. Once an integrated route is delivered, its owner must document the exact path, event types, signature header and sandbox return URL before you configure Developer → API / Endpoints / Webhook Logs. Keep the account in Sandbox; do not enable live charges.

## 5. textbee and Telegram

No textbee send/inbound/status webhook route or Telegram notification dispatcher is present in this candidate. There is no callback URL to enter in textbee and no genuine notification test to run. Do not guess a route. After a reviewed integration is available, configure its documented public HTTPS callback and secret, then test with the Android SIM and a real Telegram chat. Missing provider credentials do not block existing Auth/CRM flows.

## 6. Scheduled jobs

The repository has durable job tables and a signed POST /api/internal/jobs/run dispatcher that claims jobs. It does not include a production schedule, worker that executes the claimed provider/domain jobs, or Vercel Cron configuration. Do not schedule this route as if it completed escalation or outbox work. Lead assignment/escalation is not part of this candidate. A future job implementation must specify authenticated scheduling, idempotent processing, retries and measured runtime limits before enabling Cron.

## 7. Smoke test for implemented workflows

1. Open the deployed HTTPS origin and create an account through Sign up.
2. Confirm email if required, follow the Supabase callback, sign in and verify a workspace is created.
3. Refresh and sign in again to confirm session/workspace persistence.
4. Open the workspace CRM and create a company and contact using fictional data (for example, Northstar Demo Supplies, Amina Example, amina@example.invalid). Edit, reload, then archive the records.
5. Confirm a stale edit is rejected and an unauthorized workspace/member request is denied; review Vercel and Supabase logs for errors.
6. Do not attempt lead escalation, SMS, checkout/refund, Google Calendar or Telegram on this build; those workflows are not integrated.

## Troubleshooting

- Auth redirect mismatch: APP_ORIGIN must exactly match the browser origin. Add <origin>/auth/callback to Supabase Auth redirect URLs and redeploy after changing environment values.
- Missing runtime configuration / generic server error: verify APP_ORIGIN, SUPABASE_URL and SUPABASE_ANON_KEY in the correct Vercel environment, then redeploy.
- Supabase login/bootstrap failure: confirm the URL/key belong to the same project, Auth email settings, allowed callback URL, and that migrations were applied.
- Migration failure: stop and inspect the CLI output and migration history. Do not reset hosted data or manually delete migration records; resolve the specific schema conflict first.
- RLS/permission denial: expected denials are enforced. Verify the signed-in user is a member of the selected workspace and has the relevant permission; do not bypass RLS with service role in browser code.
- Vercel build failure: confirm the release branch, Node 24 compatibility and lockfile-based npm ci; inspect the failing CI/build log before changing dependencies.
- Cron/provider errors: these integrations are not configured or implemented in this candidate. There is no webhook callback to debug yet.
