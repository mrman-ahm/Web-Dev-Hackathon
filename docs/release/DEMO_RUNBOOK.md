# Demo runbook

This runbook covers only behavior present and locally verified in the integration candidate. It is not a full rubric demo. Use a deployed test workspace and fictional data; do not use real customer information.

## Verified candidate path: Auth, workspace and CRM

1. Owner / new account: open /signup and create a demo account with an address you control. Complete email confirmation if enabled. Expected result: the Supabase callback returns to the application and a workspace is bootstrapped. Verify the signed-in session and workspace name on the workspace screen. Reload and sign in again to demonstrate persistence.
2. Owner / company: open the workspace CRM. Create company Northstar Demo Supplies with a fictional domain such as northstar.example.invalid. Verify it appears in the company list, reload, edit its name, then archive it after archiving any active contacts.
3. Owner / contact: create contact Amina Example, amina@example.invalid, and associate it with the demo company. Verify the contact persists after reload. Edit and archive it through the UI.
4. Authorization/error evidence: submit an outdated record version using the tested stale-edit path; expect a conflict and no overwritten record. Use the normal UI for the demo; automated API/DB tests cover cross-workspace access and invalid authorization. Do not pretend an unauthorized action succeeded.
5. What is genuine: records are persisted in Supabase, API calls use the authenticated workspace, and migration-backed operations write audit facts. Browser verification was against an isolated local Supabase project; repeat this smoke test after deployment before presenting it as production evidence.

## Rubric capabilities not demonstrable on this candidate

- Lead assignment, acknowledgement countdown, escalation and recovery: not implemented.
- Opportunities, editable pipelines, custom fields and required stage fields: not implemented.
- textbee send/receive/status callbacks: no app routes/adapters integrated. Do not send a test SMS through this app.
- Safepay checkout, confirmed payment/refund accounting: no app route/adapter integrated. Do not claim a checkout or configure a webhook.
- Google Calendar OAuth/event creation: no Google callback or event service. The app's /auth/callback is Supabase Auth only.
- Telegram escalation alert: no notification dispatcher integrated.
- Judge-facing dashboard/audit viewer: audit persistence/API exists, but there is no complete browser workflow for judges.

If asked about these criteria, describe their status accurately and show relevant implementation evidence only as contracts or schema, never as a working flow. There is no fallback simulation that can be presented as a real provider result.

## Developer explanation checklist

- Developer 1: explain server-side Supabase session handling, workspace bootstrap, permission-checked database operations, optimistic conflict handling, RLS/tenant constraints and the companies/contacts CRUD slice. Distinguish these from the unfinished lead engine and CRM customization.
- Developer 2: provider implementation is not yet integrated into this candidate. Explain only reviewed provider code/contract boundaries and be explicit that no end-to-end SMS, Safepay or Telegram result has been observed on the running app.
- Before the judges arrive, verify deployed Auth/CRM in the browser, confirm persistence after refresh, and keep Vercel/Supabase logs available. If a provider is unconfigured, state that directly rather than showing fabricated data.
