\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select has_table('private','domain_events','Immutable domain events are persisted in the private schema');
select has_table('private','outbox_jobs','Durable jobs are persisted in the private schema');
select has_table('private','outbox_job_attempts','Job attempts are retained for recovery and failure visibility');
select has_table('private','worker_dispatch_receipts','Worker dispatch nonces are persisted for replay protection');
select has_function('private','append_domain_event',array['uuid','uuid','text','smallint','text','uuid','bigint','text','uuid','uuid','uuid','jsonb','jsonb'],'Domain facts and outbox intent share one append command');
select has_function('public','dispatch_jobs',array['text','timestamp with time zone','integer'],'Worker dispatch verifies a one-use nonce and claims a bounded batch');
select has_function('public','mark_job_effect_started',array['uuid','uuid'],'Workers can durably mark the external-effect boundary');
select has_function('public','finish_job',array['uuid','uuid','jsonb'],'Job completion is lease-token checked');
select has_function('public','extend_job_lease',array['uuid','uuid','integer'],'Long-running jobs can extend a live lease within a bound');
select ok(not has_table_privilege('authenticated','private.outbox_jobs','SELECT'),'Authenticated clients cannot read private queue rows');
select ok(not has_table_privilege('service_role','private.outbox_jobs','UPDATE'),'Service role cannot bypass the job command API');
select ok(not has_function_privilege('authenticated','public.dispatch_jobs(text,timestamp with time zone,integer)','EXECUTE'),'Authenticated users cannot invoke worker dispatch');
select ok(has_function_privilege('service_role','public.dispatch_jobs(text,timestamp with time zone,integer)','EXECUTE'),'Only the server service role can invoke the signed worker RPC');
select ok(not exists(select 1 from pg_roles where rolname='ubmp_worker' and (rolcanlogin or rolbypassrls)),'Worker executor cannot login or bypass RLS');
select is((select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p where p.oid='public.dispatch_jobs(text,timestamp with time zone,integer)'::regprocedure),'ubmp_worker','Dispatch wrapper uses the narrow worker owner');
select ok(private.contains_sensitive_key('{"nested":[{"privateKey":"do-not-store"}]}'::jsonb),'Secret key detection recurses through arrays and normalizes camelCase');

insert into auth.users(id,email,raw_user_meta_data) values
('51000000-0000-4000-8000-000000000001','jobs-core@example.test','{"display_name":"Jobs Core","workspace_name":"Jobs Core Co"}');
set constraints all immediate;
set constraints all deferred;
select id as jobs_workspace_id,owner_membership_id as jobs_membership_id
from public.workspaces where name='Jobs Core Co' \gset
insert into auth.sessions(id,user_id,not_after) values
('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',now()+interval '1 day');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','51000000-0000-4000-8000-000000000001',
  'session_id','52000000-0000-4000-8000-000000000001',
  'exp',extract(epoch from now()+interval '1 hour')
)::text,true) is not null;

select private.append_domain_event(
  '53000000-0000-4000-8000-000000000001'::uuid, :'jobs_workspace_id'::uuid, 'contact.created', 1::smallint,
  'contact', '54000000-0000-4000-8000-000000000001'::uuid, 1::bigint, 'user', :'jobs_membership_id'::uuid,
  '55000000-0000-4000-8000-000000000001'::uuid, null::uuid, '{"contactId":"54000000-0000-4000-8000-000000000001"}'::jsonb,
  '[{"kind":"integration.inbox.process","dedupeKey":"jobs-core:lease-recovery","payload":{"contactId":"54000000-0000-4000-8000-000000000001"}}]'::jsonb
);
select is((select count(*)::int from private.domain_events where id='53000000-0000-4000-8000-000000000001'),1,'Domain event is appended');
select is((select count(*)::int from private.outbox_jobs where dedupe_key='jobs-core:lease-recovery'),1,'Outbox intent commits with the event');
select throws_ok('update private.domain_events set event_name=''contact.updated'' where id=''53000000-0000-4000-8000-000000000001''','42501','Domain events are append-only','Persisted domain facts cannot be rewritten');
select throws_ok(format(
  'select private.append_domain_event(gen_random_uuid(),%L::uuid,''contact.created'',1::smallint,''contact'',gen_random_uuid(),2,''user'',%L::uuid,gen_random_uuid(),null,%L::jsonb,%L::jsonb)',
  :'jobs_workspace_id', :'jobs_membership_id', '{"api-token":"must-not-persist"}', '[]'
),'22023','Invalid domain event','Secret-bearing event payloads are rejected before persistence');
select throws_ok(format(
  'select private.append_domain_event(gen_random_uuid(),%L::uuid,''contact.updated'',1::smallint,''contact'',gen_random_uuid(),2,''user'',%L::uuid,gen_random_uuid(),null,%L::jsonb,%L::jsonb)',
  :'jobs_workspace_id', :'jobs_membership_id', '{"contactId":"54000000-0000-4000-8000-000000000001"}',
  '[{"kind":"integration.inbox.process","dedupeKey":"jobs-core:lease-recovery","payload":{"contactId":"different"}}]'
),'23505','Outbox idempotency key conflicts with a different payload','A repeated dedupe key cannot silently change its work');
select is((select count(*)::int from private.domain_events where workspace_id=:'jobs_workspace_id'),1,'Outbox conflict rolls back the new domain event');

select public.dispatch_jobs('jobsNonce_lease_recovery_0001',clock_timestamp(),1) as jobs_claim_one \gset
select (:'jobs_claim_one'::jsonb->>'accepted') as jobs_claim_accepted \gset
select (:'jobs_claim_one'::jsonb->'jobs'->0->>'jobId') as jobs_claim_id \gset
select (:'jobs_claim_one'::jsonb->'jobs'->0->>'leaseToken') as jobs_claim_token \gset
select ok(:'jobs_claim_accepted'::boolean,'A fresh signed dispatch nonce is accepted');
select is((select state from private.outbox_jobs where id=:'jobs_claim_id'), 'running','A due job is leased');
select is((select attempts::int from private.outbox_jobs where id=:'jobs_claim_id'),1,'A claim increments the attempt counter');
select ok((select lease_until > clock_timestamp() from private.outbox_jobs where id=:'jobs_claim_id'),'Claimed work has a bounded live lease');
select is((public.dispatch_jobs('jobsNonce_lease_recovery_0001',clock_timestamp(),1)->>'accepted'),'false','A replayed dispatch nonce is rejected');

update private.outbox_jobs set lease_until=clock_timestamp()-interval '1 second' where id=:'jobs_claim_id';
select is(public.finish_job(:'jobs_claim_id',:'jobs_claim_token','{"status":"confirmed"}'::jsonb),false,'Expired worker cannot complete after lease expiry');
select public.dispatch_jobs('jobsNonce_lease_recovery_0002',clock_timestamp(),1) as jobs_claim_two \gset
select (:'jobs_claim_two'::jsonb->'jobs'->0->>'leaseToken') as jobs_claim_token_two \gset
select is((select attempts::int from private.outbox_jobs where id=:'jobs_claim_id'),2,'A pre-effect worker crash is recovered with a new attempt');
select is((select outcome from private.outbox_job_attempts where outbox_job_id=:'jobs_claim_id' and attempt_number=1),'lease_expired','The abandoned attempt is retained');
select isnt(:'jobs_claim_token_two'::text,:'jobs_claim_token'::text,'Recovery rotates the lease token');
select is(public.finish_job(:'jobs_claim_id',:'jobs_claim_token','{"status":"confirmed"}'::jsonb),false,'A stale worker token cannot overwrite the recovered attempt');
select ok(public.extend_job_lease(:'jobs_claim_id',:'jobs_claim_token_two',300),'Current worker can extend its live lease within the cap');
select throws_ok(format('select public.extend_job_lease(%L::uuid,%L::uuid,301)',:'jobs_claim_id',:'jobs_claim_token_two'),'22023','Invalid lease extension','Lease extension above five minutes is rejected');
select ok(public.finish_job(:'jobs_claim_id',:'jobs_claim_token_two','{"status":"confirmed"}'::jsonb),'Current worker can complete its claim');
select is((select state from private.outbox_jobs where id=:'jobs_claim_id'),'succeeded','Confirmed result is terminal success');

select private.append_domain_event(
  '53000000-0000-4000-8000-000000000002'::uuid, :'jobs_workspace_id'::uuid, 'contact.created', 1::smallint,
  'contact', '54000000-0000-4000-8000-000000000002'::uuid, 1::bigint, 'user', :'jobs_membership_id'::uuid,
  '55000000-0000-4000-8000-000000000002'::uuid, null::uuid, '{"contactId":"54000000-0000-4000-8000-000000000002"}'::jsonb,
  '[{"kind":"messaging.send","dedupeKey":"jobs-core:unknown-result","payload":{"messageId":"54000000-0000-4000-8000-000000000003"}}]'::jsonb
);
select public.dispatch_jobs('jobsNonce_unknown_result_0001',clock_timestamp(),1) as jobs_unknown_claim \gset
select (:'jobs_unknown_claim'::jsonb->'jobs'->0->>'jobId') as jobs_unknown_id \gset
select (:'jobs_unknown_claim'::jsonb->'jobs'->0->>'leaseToken') as jobs_unknown_token \gset
select ok(public.finish_job(:'jobs_unknown_id',:'jobs_unknown_token','{"status":"unknown","code":"NETWORK_OUTCOME_UNKNOWN"}'::jsonb),'Unknown provider outcome is recorded');
select is((select state from private.outbox_jobs where id=:'jobs_unknown_id'),'unknown','Unknown result is not queued for blind retry');
select is((public.dispatch_jobs('jobsNonce_unknown_result_0002',clock_timestamp(),1)->'jobs')::text,'[]','Unknown result is not claimed again automatically');

select private.append_domain_event(
  '53000000-0000-4000-8000-000000000003'::uuid, :'jobs_workspace_id'::uuid, 'contact.created', 1::smallint,
  'contact', '54000000-0000-4000-8000-000000000004'::uuid, 1::bigint, 'user', :'jobs_membership_id'::uuid,
  '55000000-0000-4000-8000-000000000003'::uuid, null::uuid, '{"contactId":"54000000-0000-4000-8000-000000000004"}'::jsonb,
  '[{"kind":"payments.checkout.create","dedupeKey":"jobs-core:retry-limit","maxAttempts":2,"payload":{"paymentRequestId":"54000000-0000-4000-8000-000000000005"}}]'::jsonb
);
select public.dispatch_jobs('jobsNonce_retry_limit_00001',clock_timestamp(),1) as jobs_retry_claim_one \gset
select (:'jobs_retry_claim_one'::jsonb->'jobs'->0->>'jobId') as jobs_retry_id \gset
select (:'jobs_retry_claim_one'::jsonb->'jobs'->0->>'leaseToken') as jobs_retry_token_one \gset
select ok(public.finish_job(:'jobs_retry_id',:'jobs_retry_token_one','{"status":"temporary_failure","code":"PROVIDER_BUSY","retryAfterSeconds":20}'::jsonb),'Temporary failure can be scheduled');
select ok((select state='pending' and available_at between clock_timestamp()+interval '19 seconds' and clock_timestamp()+interval '21 seconds' from private.outbox_jobs where id=:'jobs_retry_id'),'Retry respects provider Retry-After');
update private.outbox_jobs set available_at=clock_timestamp()-interval '1 second' where id=:'jobs_retry_id';
select public.dispatch_jobs('jobsNonce_retry_limit_00002',clock_timestamp(),1) as jobs_retry_claim_two \gset
select (:'jobs_retry_claim_two'::jsonb->'jobs'->0->>'leaseToken') as jobs_retry_token_two \gset
select ok(public.finish_job(:'jobs_retry_id',:'jobs_retry_token_two','{"status":"temporary_failure","code":"PROVIDER_BUSY"}'::jsonb),'Final bounded attempt records temporary failure');
select is((select state from private.outbox_jobs where id=:'jobs_retry_id'),'failed','Exhausted retry becomes visible dead-letter state');
select is((select attempts::int from private.outbox_jobs where id=:'jobs_retry_id'),2,'Retry count is bounded by maxAttempts');

select private.append_domain_event(
  '53000000-0000-4000-8000-000000000004'::uuid, :'jobs_workspace_id'::uuid, 'contact.created', 1::smallint,
  'contact', '54000000-0000-4000-8000-000000000006'::uuid, 1::bigint, 'user', :'jobs_membership_id'::uuid,
  '55000000-0000-4000-8000-000000000004'::uuid, null::uuid, '{"contactId":"54000000-0000-4000-8000-000000000006"}'::jsonb,
  '[{"kind":"notifications.telegram.send","dedupeKey":"jobs-core:crash-after-effect","payload":{"deliveryId":"54000000-0000-4000-8000-000000000007"}}]'::jsonb
);
select public.dispatch_jobs('jobsNonce_effect_start_0001',clock_timestamp(),1) as jobs_effect_claim \gset
select (:'jobs_effect_claim'::jsonb->'jobs'->0->>'jobId') as jobs_effect_id \gset
select (:'jobs_effect_claim'::jsonb->'jobs'->0->>'leaseToken') as jobs_effect_token \gset
select ok(public.mark_job_effect_started(:'jobs_effect_id',:'jobs_effect_token'),'Worker marks the external side-effect boundary before calling provider');
update private.outbox_jobs set lease_until=clock_timestamp()-interval '1 second' where id=:'jobs_effect_id';
select is((public.dispatch_jobs('jobsNonce_effect_start_0002',clock_timestamp(),1)->'jobs')::text,'[]','Expired post-effect attempt is withheld from automatic replay');
select is((select state from private.outbox_jobs where id=:'jobs_effect_id'),'unknown','Crash after effect start is surfaced for reconciliation');
select is(public.finish_job(:'jobs_effect_id',:'jobs_effect_token','{"status":"confirmed"}'::jsonb),false,'Expired post-effect worker cannot overwrite reconciliation state');

select * from finish();
rollback;
