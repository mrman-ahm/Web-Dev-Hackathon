# Judge-facing live demo checklist

This is the future live acceptance checklist, organized by the official
[Participant Rubric](../requirements/rubric-traceability.md). Every box starts
unchecked. Check an item only after it works on the running build with persisted data;
prepared records, mock providers and hard-coded success do not count. Use real provider
sandbox/test accounts where available and keep credentials out of screenshots/logs.

Before each judged run, record the deployed/local build commit, environment, tester,
date, actual result and a durable evidence link in the
[rubric evidence record](../requirements/rubric-traceability.md). Re-run after a fresh
refresh/restart when the criterion requires persistence. A failed claimed item reduces
the R10 score.

## R01 — Roles, permissions and security (10 points)

- [ ] Sign in as the workspace Owner and change a role's grants in the actual settings interface.
- [ ] Sign in as a second member and show the UI reflects those grants.
- [ ] Call the protected API directly as that member; confirm denied fields/data are not serialized and mutations return a safe denial.
- [ ] Attempt the same API with a record and workspace ID belonging to a second workspace; confirm no data is returned or changed.
- [ ] Revoke a grant, repeat the direct API call without signing out, and confirm the revoked permission takes effect.

## R02 — Customizable CRM (12 points)

- [ ] Create a custom field from the interface and use it on a real saved contact/opportunity.
- [ ] Open two pipelines and show that each has its own configured field set while sharing contact details.
- [ ] Configure a required field for a stage; try moving an opportunity with the field blank and show the move is blocked with a clear error.
- [ ] Fill the field and move the opportunity successfully; add, rename, reorder and safely delete an unused stage.
- [ ] Build and save a list using at least three criteria, edit records so they enter and leave the result, and show the saved list updates.

## R03 — Lead assignment and escalation (14 points)

- [ ] Set one employee Available and another Busy or Offline; submit a new lead through a real enabled intake path and show only the eligible employee receives it.
- [ ] Show the owner and visible acknowledgement countdown on the running page.
- [ ] Leave the lead unacknowledged through its configured deadline and show exactly one atomic reassignment to the next eligible employee.
- [ ] Set an assignee On Leave/Offline and show their unacknowledged lead is transferred immediately; show the accepted handling for already acknowledged leads.
- [ ] Open the recovery queue and show the actual reason for each overdue, multiply escalated or idle lead.
- [ ] Refresh/restart during a pending deadline and verify the persisted timer and single-owner invariant remain correct.

## R04 — Audit log and dashboard (8 points)

- [ ] Perform assignment, acknowledgement, escalation, permission and CRM changes; show their actor, time, target and relevant before/after values in the audit view.
- [ ] Attempt to edit or delete an audit entry through the UI and API; confirm both are denied.
- [ ] Open dashboard totals and drill into their underlying records; reconcile the shown values with those records.
- [ ] Sign in as a User and as Owner/Admin; demonstrate live role-appropriate figures rather than hidden values rendered as zero.

## R05 — Messaging integration (12 points)

- [ ] Connect the actual Textbee sandbox/test account and send a real incoming phone message to the configured number.
- [ ] Show the message creates or matches the correct CRM contact/conversation/lead, keeps Textbee's `receivedAt`, and stores the inbound event once.
- [ ] Send a real reply from the application and show it is delivered to the phone; show `smsBatchId` and per-recipient `smsId` status callbacks reconcile to that message.
- [ ] Show an `UNKNOWN_STATE` callback keeps the original provider state visible for diagnosis and does not mark the message failed; show out-of-order callbacks do not regress a final state.
- [ ] Submit a forged/invalid-signature webhook and show rejection without creating or changing a message/lead.
- [ ] Replay the same valid provider event and show deduplication leaves one business event.
- [ ] Cause or select a real provider failure, show its safe reason/state in the app, retry it, and show the final provider outcome.

## R06 — Payments integration (12 points)

- [ ] Create a hosted Safepay test checkout for a real opportunity and complete it with a provider test payment method.
- [ ] Show the verified provider webhook updates the persisted payment record automatically, without trusting the browser redirect.
- [ ] Reject an invalid Safepay signature without creating a financial fact; replay a valid webhook and show it is not double-counted.
- [ ] Show event-token deduplication and tracker correlation remain distinct, including an out-of-order payment/refund event sequence.
- [ ] Refund the test payment and show only provider-confirmed `payment.refunded` plus `refund_amount` updates the collection ledger and gross/refund/net totals.
- [ ] Run a declined/failed checkout and show application-policy expiry separately from provider-confirmed expiry; neither is marked collected.

## R07 — Calendar integration (10 points)

- [ ] Complete Google OAuth sign-in for an employee and show the real calendar connection state in the app.
- [ ] Create an appointment in the app and verify it appears in that employee's actual Google Calendar with the correct contact/details.
- [ ] Attempt an overlapping appointment and show the conflict is rejected or safely rescheduled without duplicating reservations.
- [ ] Verify appointment start/end in the workspace timezone, including one daylight-saving/timezone boundary case.
- [ ] Reschedule or cancel an appointment and show the corresponding real calendar change and activity history.

## R08 — Notification integration (4 points)

- [ ] Trigger a real overdue-lead escalation and show Telegram sends an alert to the configured destination.
- [ ] Open the alert's link while signed in and verify it reaches the correct lead; verify unauthorized users still cannot open protected data.
- [ ] Cause a Telegram destination/rate-limit failure and show it is visible and recoverable without changing the durable lead assignment.

## R09 — Quality (10 points)

- [ ] Complete the core demo at a phone-sized viewport and show usable navigation, forms, dialogs and readable status/errors.
- [ ] Submit invalid, unauthorized and conflicting inputs; show actionable errors and no leaked secrets or protected fields.
- [ ] Inspect the committed source/build configuration for credentials; verify secrets are supplied only through runtime environment/configuration.
- [ ] Restart the application process and refresh; show the same persisted customer, lead, appointment and payment state remains.
- [ ] Make one provider unavailable or force a failure; show unrelated CRM, auth and other provider workflows continue to work.

## R10 — Demo and understanding (8 points)

- [ ] Run every claimed criterion above on the build being judged; remove or mark incomplete any step that fails.
- [ ] Show this checklist and its evidence links; state which items are partial or unverified.
- [ ] Have each team member explain the code they own, the relevant tests, security boundaries, provider outcomes and how failures/restarts are handled.
- [ ] Answer questions by demonstrating the running behavior or pointing to checked-in evidence; do not claim unimplemented features.

## Evidence capture fields

| Run date | Commit/build | Environment | Criteria demonstrated | Failures/gaps | Evidence links | Presenter(s) |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |
