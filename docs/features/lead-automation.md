# Lead automation specification

Status: approved domain design (2026-10-18); Owner-custody fallback explicitly accepted by the
primary human on 2026-10-18. Other interpretations are listed in
[ambiguities](../requirements/ambiguities.md). Covers F3.1–F3.9 and Q4–Q6/Q11/Q12.

## State and ownership

`state=open|closed` is business lifecycle. `ownership_mode=operational|custody` describes
accountability. An open or closed lead always has one nonnull accountable membership;
closed history retains its last owner. Operational ownership has assignment version,
assigned time and persisted deadline. Acknowledgement does not close the lead.

Fresh intake without an eligible employee uses the active workspace Owner as custodian,
sets `awaiting_eligible_employee` recovery reason, leaves first/current operational
assignment/deadline null, and alerts the Owner in-app. Display **Owner custody — awaiting
eligible employee**, never **assigned successfully**. Custody is responsibility rather
than an operational assignment; it does not override F3.3 eligibility or consume open
operational capacity. Eligible allocation later records first assignment and starts the
first-response clock. Owner transfer atomically transfers fresh-intake custody to the
new Owner; Owner deactivation is prohibited until that transfer completes.

If an operational lead times out but nobody else is eligible, retain its current
accountable owner, original deadline and assignment version; add recovery reason and
retry candidate search on the next eligibility change and bounded periodic sweep.
Do not fabricate an escalation or reassign it to an unavailable employee. The expired
assignment remains visible as overdue; it is not silently marked acknowledged. No owner
is cleared while retrying. Only actual ownership transitions increment assignment_version.

## Intake, eligibility and round robin

- Public web form, verified Twilio inbound and authorized manual entry call one
  `createLead` application service. Each has source plus a durable workspace/intake key.
  A duplicate key with different normalized content returns conflict; same content replays.
- A default disabled pool rule exists after signup; no-rule intake therefore has a durable
  rule snapshot and uses custody. Public form configuration maps a unique enabled endpoint
  to its workspace independently of provider integration connections.
- Unknown phone: contact creation, conversation/message insertion and lead intake are one
  transaction after inbox verification. Canonical E.164 contact matching is workspace-local.
  Known phone attaches existing contact/conversation; additional new-lead policy must not
  accidentally create a new lead for every message. Proposed default: one open lead per
  contact/channel intake episode; open existing lead receives activity instead of duplication.
- Eligible means active workspace membership, status Available, configured rule/tier
  membership, and operational open-lead count below that member's positive configured cap.
  Count all unresolved operational leads, acknowledged or not. Exclude closed/custody rows.
- Rule pool has explicit stable positions; cursor identifies last selected position. Under
  workspace lock, scan after cursor with wrap, skip ineligible and candidates already tried
  in the current escalation cycle; choose first eligible. Advance cursor only on allocation.
- Configurable tiers are an ordered pool → backup → manager chain with positive second
  windows and configurable count. Backup/manager are configured memberships, not role-name
  magic; every tier obeys eligibility. Fail rule activation if references are invalid.
- A rule version is snapshotted on each transition. Updating a rule cannot silently alter
  an existing deadline or make first-response metrics restart.

## Acknowledgement and expiry

Explicit acknowledgement or a qualifying recorded owner action (note, successfully
recorded outgoing message, call log, stage change, confirmed appointment) records an
immutable acknowledgement for the current assignment version. Queuing an external send
is not successful delivery/action. Outbound commands persist originating actor, lead ID and assignment version before
enqueue; validate all-or-none context and its related-record scope. Compare the exact
version at provider confirmation, including when the same actor reacquires the lead.
A late provider confirmation can be activity without
acknowledging a newer owner. Automatic provider inbound messages are not employee actions.

Under workspace/lead lock, verify operational current owner and expected assignment
version, then use the database clock. At `now >= ack_deadline_at`, reject explicit ack
with DEADLINE_EXPIRED and run/queue the authoritative due transition. Before that boundary,
write current ack, `first_acknowledged_at` if null, activity, audit and event together.
First response time is **first operational assignment to first acknowledgement**, never
reset by reassignment. Current acknowledgement can reset on a new assignment, while first
ack/time remains immutable. A countdown is a display of server deadline, not a timer engine.

Qualifying domain commands invoke the same acknowledgement helper in their transaction.
A command after expiry cannot silently claim the previous assignment. Return actionable
assignment/deadline conflict; an independently legitimate activity may be saved only if
its permissions still hold, with no false acknowledgement. The UI refetches current owner.

## Atomic transition algorithm

All owner/capacity/availability/rule mutations acquire workspace lock first, followed by
stable membership then lead order. The database command receives actor context from
verified identity or trusted system execution, not an arbitrary request actor ID.

1. Lock workspace; resolve current permissions and active rule. For intake deduplicate key;
   for transition lock lead and recheck open state, current owner/version/deadline/ack.
2. Compute eligible candidates from current availability and transactional open counts.
3. Choose next eligible tier/candidate. For automatic deadline movement require a different
   owner; never count timeout to the same employee as escalation.
4. Update one leads row, assignment history unique by version, current deadline/tier,
   actual escalation count, audit/activity, domain event and outbox intent in one commit.
5. If no candidate: retain owner/version, persist recovery state and a bounded next sweep
   marker; a duplicate worker produces no duplicate event/delivery. Never contact providers
   while holding this transaction's locks.

Cron selects candidate workspace rows with SKIP LOCKED **before** due lead rows, so two
workers cannot violate lock order or allocate the same capacity. Due selection is indexed;
use bounded batches and fair rotation. Transaction failure rolls back every state/history
write. On restart, deadlines remain due in PostgreSQL and are picked up by the next run.
Stale jobs carrying old assignment versions are successful no-ops, not a new escalation.

## Availability and manual actions

Available/Busy/On Leave/Offline are persisted employee choices, not WebSocket presence.
Busy excludes future allocations while current leads retain deadlines. Setting On Leave
or Offline synchronously transitions all current unacknowledged open leads under one
workspace lock (targeted employee volume is capped/configured). If a candidate is missing,
retain accountability and mark overdue/candidate-waiting recovery; do not clear owner.
Already acknowledged leads remain with their owner, show absence, and can be manually
transferred by an authorized person. This policy is shown beside availability controls.

Manual reassignment to the same owner is rejected; it cannot silently renew an expired
deadline or conflict with unique acknowledgement/history epochs. Fresh intake starts an
assignment_cycle_id; manual transfer to a different eligible owner starts a new cycle.
Automatic/absence transitions remain in that cycle, and a candidate is tried once per
cycle. Exhausting every configured tier retains current accountability and marks
escalation_chain_exhausted, with no endless loop back to pool tier zero. Explicit
authorized manual transfer starts a new cycle; rule edits alone do not rewrite history.

For a sole remaining employee, recovery must still be actionable: accept_current on
the recovery endpoint permits the current Available operational owner to explicitly
accept an overdue/no-candidate or exhausted-chain lead. It records a late acknowledgement
and true first-response duration, clears the active acknowledgement deadline/reasons
that no longer apply, preserves missed-deadline history/escalation count, and emits
lead.recovered. It does not claim timely response, reset the clock, or assign an unavailable
worker. Custody must first obtain eligible operational allocation. This is a proposed
recovery policy included in human architecture review.

Manual reassignment requires leads.reassign and eligible target, expected assignment
version, reason and audit. It resets current assignment acknowledgement/deadline under
policy but never increments escalation_count. Closing releases operational capacity,
clears current deadline, preserves histories and triggers custody-recovery allocation.
After availability/cap changes/closure, process pending custody and no-candidate recovery
with the same round-robin command, not a separate owner updater.

## Recovery projection and external notification

Recovery reasons are independent and may coexist (including escalation_chain_exhausted): expired unacknowledged deadline,
escalation_count >=2, last qualifying action before idle threshold, awaiting eligible
employee. Use live DB predicates so crossing a time threshold appears without a write.
Record explanation timestamps/thresholds and let authorized users drill down. An idle
lead remains listed until a qualifying action, close or explicit legitimate resolution;
removing it from a UI list does not change ownership or erase history.

`lead.escalated` creates one notification delivery per new owner/channel with unique
event/recipient key. Outbox dispatcher attempts Telegram promptly; target processing
budget is <=5s due scan + <=5s dispatch + network time, monitored against I4.1's <60s
receipt criterion. This budget is an engineering target requiring real measurement;
provider outage cannot guarantee receipt. Failed/missing destination is retained and
visible to authorized admins; bounded retry and alert do not roll back assignment.

## Required failure/concurrency evidence

Two workers expire the same lead; ack versus expiry before/at boundary; leave versus
assignment/ack; two intakes compete for the final capacity slot; repeated source event;
stale job after manual reassignment; all employees ineligible on intake/expiry; Owner
transfer with custody; crash before and after transaction commit; retry after notification
send timeout; rule change with active deadline; acknowledged lead absence; several
escalations preserve first-response timestamps. Assert one current owner, one transition
per version, correct open counts, audit/outbox consistency and real restart recovery.
