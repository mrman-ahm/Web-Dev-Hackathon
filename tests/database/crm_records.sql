\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

select has_table('public','customer_companies','CRM companies are stored in the tenant schema');
select has_table('public','contacts','CRM contacts are stored in the tenant schema');
select has_function('public','list_crm_contacts',array['uuid','timestamp with time zone','uuid','integer'],'Contacts have a cursor-bounded list command');
select has_function('public','create_crm_contact',array['uuid','text','uuid','text','text'],'Contact creation is a checked RPC');
select has_function('public','update_crm_contact',array['uuid','uuid','bigint','boolean','text','boolean','uuid','boolean','text','boolean','text'],'Contact edits require an expected version');
select ok((select relrowsecurity from pg_class where oid='public.contacts'::regclass),'Contacts have row-level security enabled');
select ok((select relrowsecurity from pg_class where oid='public.customer_companies'::regclass),'Companies have row-level security enabled');
select ok(not has_table_privilege('authenticated','public.contacts','SELECT'),'Authenticated users cannot read contact rows directly');
select ok(not has_table_privilege('authenticated','public.contacts','INSERT'),'Authenticated users cannot insert contact rows directly');
select ok(not has_table_privilege('authenticated','public.contacts','UPDATE'),'Authenticated users cannot update contact rows directly');
select ok(not has_table_privilege('authenticated','public.customer_companies','SELECT'),'Authenticated users cannot read company rows directly');
select ok(not has_table_privilege('service_role','public.contacts','SELECT'),'The service role has no broad contact read grant');
select ok(not has_function_privilege('anon','public.create_crm_contact(uuid,text,uuid,text,text)','EXECUTE'),'Anonymous users cannot invoke CRM writes');

insert into auth.users(id,email,raw_user_meta_data) values
('41000000-0000-4000-8000-000000000001','crm-owner-one@example.test','{"display_name":"CRM Owner One","workspace_name":"CRM One"}'),
('41000000-0000-4000-8000-000000000002','crm-owner-two@example.test','{"display_name":"CRM Owner Two","workspace_name":"CRM Two"}'),
('41000000-0000-4000-8000-000000000003','crm-user@example.test','{"display_name":"CRM User","workspace_name":"CRM User Home"}');
set constraints all immediate;
set constraints all deferred;
select id as crm_w1,owner_membership_id as crm_m1 from public.workspaces where name='CRM One' \gset
select id as crm_w2,owner_membership_id as crm_m2 from public.workspaces where name='CRM Two' \gset
select id as crm_user_role from public.roles where workspace_id=:'crm_w1' and name='User' \gset
insert into public.memberships(workspace_id,user_id,base_level,role_id)
values(:'crm_w1','41000000-0000-4000-8000-000000000003','user',:'crm_user_role');
select id as crm_m3 from public.memberships where workspace_id=:'crm_w1' and user_id='41000000-0000-4000-8000-000000000003' \gset
insert into auth.sessions(id,user_id,not_after) values
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',now()+interval '1 day'),
('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002',now()+interval '1 day'),
('42000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000003',now()+interval '1 day');

select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000001','session_id','42000000-0000-4000-8000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select id as crm_c1,version as crm_c1v from public.create_crm_company(:'crm_w1','Example Co','https://example.test') \gset
select throws_ok(format('select * from public.create_crm_company(%L,%L,%L)',:'crm_w1','Bad website','https://'),'PT400','VALIDATION_FAILED','A direct RPC caller cannot persist a malformed website URL');
select id as crm_contact1,version as crm_contact1v from public.create_crm_contact(:'crm_w1','Leila Ahmed',:'crm_c1','+12025550147','leila@example.test') \gset
select is((select phone_e164 from public.get_crm_contact(:'crm_w1',:'crm_contact1')),'+12025550147','The contact command returns the canonical phone');
select throws_ok(format('select * from public.create_crm_contact(%L,%L,%L,%L,%L)',:'crm_w1','Duplicate',:'crm_c1','+12025550147','other@example.test'),'23505',null,'A live phone number is unique within a workspace');
select throws_ok(format('select * from public.create_crm_contact(%L,%L,%L,%L,%L)',:'crm_w1','Invalid phone',:'crm_c1','202-555-0147',null),'PT400','VALIDATION_FAILED','The database rejects a noncanonical phone from a direct RPC caller');
select throws_ok(format('select * from public.create_crm_contact(%L,%L,%L,%L,%L)',:'crm_w1','Cross workspace', :'crm_w2','+12025550148',null),'PT404','NOT_FOUND','A contact cannot link to a company in another workspace');
select throws_ok(format('select * from public.update_crm_contact(%L,%L,%L,true,%L,false,null,false,null,false,null)',:'crm_w1',:'crm_contact1',99,'Lost edit'),'PT409','STALE_VERSION','A stale contact edit is rejected');
select id as crm_contact1_after,version as crm_contact1v_after from public.update_crm_contact(:'crm_w1',:'crm_contact1',1,true,'Leila A.',false,null,false,null,false,null) \gset
select is(:'crm_contact1v_after'::bigint,2::bigint,'A successful contact edit increments its version');
select is((select count(*)::int from public.audit_entries where workspace_id=:'crm_w1' and target_type='contact' and target_id=:'crm_contact1'),2,'Create and edit audit facts commit with contact changes');
select id as crm_contact1_archived,version as crm_contact1v_archived from public.archive_crm_contact(:'crm_w1',:'crm_contact1',2) \gset
select is(:'crm_contact1v_archived'::bigint,3::bigint,'Archiving increments the expected version');
select is((select count(*)::int from public.get_crm_contact(:'crm_w1',:'crm_contact1')),0,'Archived contacts are excluded from live reads');
select id as crm_contact2 from public.create_crm_contact(:'crm_w1','Leila Ahmed Again',:'crm_c1','+12025550147','new@example.test') \gset
select is((select phone_e164 from public.get_crm_contact(:'crm_w1',:'crm_contact2')),'+12025550147','An archived phone number can be assigned to a new live contact');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000002','session_id','42000000-0000-4000-8000-000000000002','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select id as crm_c2 from public.create_crm_company(:'crm_w2','Other Co',null) \gset
select id as crm_contact_w2 from public.create_crm_contact(:'crm_w2','Other Leila',:'crm_c2','+12025550147',null) \gset
select is((select count(*)::int from public.get_crm_contact(:'crm_w2',:'crm_contact1')),0,'Guessed contact IDs from another tenant are not found');
select throws_ok(format('select * from public.create_crm_contact(%L,%L,%L,%L,%L)',:'crm_w2','Wrong tenant company',:'crm_c1','+12025550149',null),'PT404','NOT_FOUND','A tenant cannot attach a contact to another tenant company');
select is((select phone_e164 from public.get_crm_contact(:'crm_w2',:'crm_contact_w2')),'+12025550147','The same canonical phone can be used in a different workspace');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000003','session_id','42000000-0000-4000-8000-000000000003','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select id as crm_contact_user from public.create_crm_contact(:'crm_w1','User Contact',null,null,'user@example.test') \gset
reset role;
-- Simulate an authorized assignment/import command outside this CRM slice.
update public.contacts set company_id=:'crm_c1' where id=:'crm_contact_user' and workspace_id=:'crm_w1';
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000003','session_id','42000000-0000-4000-8000-000000000003','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select is((select count(*)::int from public.list_crm_contacts(:'crm_w1',null,null,26)),1,'A User sees only contacts assigned to their active membership');
select is((select count(*)::int from public.get_crm_contact(:'crm_w1',:'crm_contact2')),0,'An own-record user cannot read another member’s contact by ID');
select is((select count(*)::int from public.list_crm_companies(:'crm_w1',null,null,26)),1,'A company is visible through the permitted related contact projection');
select throws_ok(format('select * from public.create_crm_company(%L,%L,%L)',:'crm_w1','Forbidden Co',null),'PT403','FORBIDDEN','The default User role cannot create companies');
select throws_ok(format('select * from public.list_crm_contacts(%L,null,null,26)',:'crm_w2'),'PT403','FORBIDDEN','The requested workspace must belong to the active member');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000001','session_id','42000000-0000-4000-8000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select throws_ok(format('select * from public.archive_crm_company(%L,%L,1)',:'crm_w1',:'crm_c1'),'23503',null,'A company with live contacts cannot be archived');
select id as crm_contact2_archived from public.archive_crm_contact(:'crm_w1',:'crm_contact2',1) \gset
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000001','session_id','42000000-0000-4000-8000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select id as crm_contact_user_archived from public.archive_crm_contact(:'crm_w1',:'crm_contact_user',1) \gset
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','41000000-0000-4000-8000-000000000001','session_id','42000000-0000-4000-8000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select id as crm_c1_archived,version as crm_c1_archived_version from public.archive_crm_company(:'crm_w1',:'crm_c1',1) \gset
select is(:'crm_c1_archived_version'::bigint,2::bigint,'Safe company archive increments its version after contacts are archived');
select is((select count(*)::int from public.get_crm_company(:'crm_w1',:'crm_c1')),0,'Archived companies are excluded from live reads');
select throws_ok(format('select * from public.create_crm_contact(%L,%L,%L,%L,%L)',:'crm_w1','Archived company link',:'crm_c1','+12025550150',null),'PT404','NOT_FOUND','New contacts cannot link to an archived company');
reset role;

select * from finish();
rollback;
