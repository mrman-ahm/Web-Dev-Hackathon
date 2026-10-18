\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select has_function('public','get_audit_entries',array['uuid','text','uuid','timestamp with time zone','timestamp with time zone','timestamp with time zone','uuid','integer'],'Audit API exposes a filtered cursor page');
select ok(not has_column_privilege('authenticated','public.audit_entries','before_json','SELECT'),'Authenticated users cannot read audit diffs directly');
select ok(not has_column_privilege('authenticated','public.audit_entries','after_json','SELECT'),'Authenticated users cannot read audit after-images directly');
select ok(not has_function_privilege('authenticated','private.append_audit_entry(uuid,text,uuid,text,text,uuid,jsonb,jsonb,uuid,uuid)','EXECUTE'),'Users cannot fabricate audit facts through the internal append helper');

insert into auth.users(id,email,raw_user_meta_data) values
('41000000-0000-4000-8000-000000000001','audit-one@example.test','{"display_name":"Audit One","workspace_name":"Audit One Co"}'),
('41000000-0000-4000-8000-000000000002','audit-two@example.test','{"display_name":"Audit Two","workspace_name":"Audit Two Co"}');
set constraints all immediate;
set constraints all deferred;
select id as audit_w1,owner_membership_id as audit_m1 from public.workspaces where name='Audit One Co' \gset
select id as audit_w2,owner_membership_id as audit_m2 from public.workspaces where name='Audit Two Co' \gset
select id as audit_user_role from public.roles where workspace_id=:'audit_w2' and name='User' \gset
insert into auth.sessions(id,user_id,not_after) values
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',now()+interval '1 day'),
('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002',now()+interval '1 day');
insert into public.memberships(workspace_id,user_id,base_level,role_id)
values(:'audit_w2','41000000-0000-4000-8000-000000000001','user',:'audit_user_role');
select id as audit_m1_in_w2 from public.memberships where workspace_id=:'audit_w2' and user_id='41000000-0000-4000-8000-000000000001' \gset

select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000002','session_id','42000000-0000-4000-8000-000000000002','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
select private.append_audit_entry(:'audit_w2','user',:'audit_m2','opportunity.value_changed','opportunity','43000000-0000-4000-8000-000000000001',
  '{"value":{"amount_minor":"9000","currency":"USD"},"line_items":[{"amount_minor":"6000"}],"title":"Before","api_token":"never-store-this","privateKey":"never-store-this-too"}'::jsonb,
  '{"value":{"amount_minor":"12000","currency":"USD"},"line_items":[{"amount_minor":"6000"}],"title":"After","api_token":"never-store-this","privateKey":"never-store-this-too"}'::jsonb);
select private.append_audit_entry(:'audit_w2','user',:'audit_m2','contact.updated','contact','43000000-0000-4000-8000-000000000002',
  '{"name":"Old"}'::jsonb,'{"name":"New"}'::jsonb);
select private.append_audit_entry(:'audit_w2','user',:'audit_m2','contact.updated','contact','43000000-0000-4000-8000-000000000003',
  '{"name":"Earlier"}'::jsonb,'{"name":"Latest"}'::jsonb);

select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000001','session_id','42000000-0000-4000-8000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select throws_ok(format('select * from public.get_audit_entries(%L)',:'audit_w2'),'PT403','FORBIDDEN','Audit API denies a member without audit.view');
select throws_ok(format('select before_json from public.audit_entries where workspace_id=%L',:'audit_w2'),'42501',null,'Direct API cannot read protected audit JSON');
reset role;
insert into public.role_permissions(workspace_id,role_id,permission_key)
values(:'audit_w2',:'audit_user_role','audit.view');
set local role authenticated;
select is((select count(*)::int from public.get_audit_entries(:'audit_w2',null,null,null,null,null,null,100) where event_type='opportunity.value_changed'),1,'Audit viewer sees only events from the requested workspace');
select is((select after_json->>'value' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '[restricted]','Protected financial values are masked for viewers without crm.values.view');
select is((select after_json->'line_items'->0->>'amount_minor' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '[restricted]','Nested financial values are masked for viewers without crm.values.view');
select is((select after_json->>'title' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), 'After','Nonfinancial audit diff fields remain visible');
select is((select actor_display_name from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), 'Audit Two','Audit page resolves the actor profile only within the authorized workspace');
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000002','session_id','42000000-0000-4000-8000-000000000002','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
select throws_ok(format('select * from public.get_audit_entries(%L)',:'audit_w1'),'PT403','FORBIDDEN','A member cannot read another workspace audit history');
select occurred_at as audit_cursor_time,id as audit_cursor_id from public.get_audit_entries(:'audit_w2',null,null,null,null,null,null,1) limit 1 \gset
select is((select count(*)::int from public.get_audit_entries(:'audit_w2',null,null,null,null,:'audit_cursor_time',:'audit_cursor_id',1)),1,'Audit cursor continues in strict descending timestamp/id order');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000002','session_id','42000000-0000-4000-8000-000000000002','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select is((select after_json->'value'->>'amount_minor' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '12000','Financially authorized audit viewer sees the stored amount');
select is((select after_json->>'api_token' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '[redacted]','Even financially authorized viewers never receive stored provider credentials');
select is((select after_json->'line_items'->0->>'amount_minor' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '6000','Financially authorized viewers retain nested array amounts');
select is((select after_json->>'privateKey' from public.get_audit_entries(:'audit_w2','opportunity.value_changed',null,null,null,null,null,100)), '[redacted]','CamelCase private keys are redacted even for financially authorized viewers');
reset role;
select * from finish();
rollback;
