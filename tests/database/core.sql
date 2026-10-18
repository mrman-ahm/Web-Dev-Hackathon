\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select has_table('public','workspaces','Core migration defines workspaces');
-- Synthetic local users and sessions; sessions are real persisted Auth schema rows.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000001','owner-one@example.test','{"display_name":"One","workspace_name":"One Co","timezone":"Asia/Karachi","default_currency":"PKR","base_level":"admin"}'),
('10000000-0000-0000-0000-000000000002','owner-two@example.test','{"display_name":"Two","workspace_name":"Two Co"}');
set constraints all immediate;
set constraints all deferred;
select id as w1,owner_membership_id as m1 from workspaces where name='One Co' \gset
select id as w2,owner_membership_id as m2 from workspaces where name='Two Co' \gset
select id as r2 from roles where workspace_id=:'w2' and name='User' \gset
insert into auth.sessions(id,user_id,not_after) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now()+interval '1 day'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',now()+interval '1 day');
select is((select count(*)::int from workspaces where id in (:'w1',:'w2')),2,'Signup creates one workspace per user');
select is((select count(*)::int from memberships where workspace_id in (:'w1',:'w2') and base_level='owner' and status='active'),2,'Each workspace has exactly one active Owner');
select is((select count(*)::int from roles where workspace_id in (:'w1',:'w2')),6,'Three default roles per workspace');
select is((select count(*)::int from employee_availability where workspace_id in (:'w1',:'w2') and status='offline'),2,'Owner availability begins Offline');
select is((select count(*)::int from assignment_rules where workspace_id in (:'w1',:'w2') and not enabled and is_default),2,'Default pool remains disabled');
select is((select count(*)::int from assignment_tiers where workspace_id in (:'w1',:'w2') and kind='pool' and level=0 and ack_window_seconds=60),2,'Bootstrap persists pool deadline configuration');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-0000-0000-000000000003','invalid@example.test','{"timezone":"Not/A_Timezone"}')$$,'22023','Invalid signup profile','Invalid profile aborts Auth insert');
select is((select count(*)::int from auth.users where email='invalid@example.test'),0,'Failed bootstrap leaves no registered orphan');
create function pg_temp.fail_late_bootstrap() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Intentional late bootstrap failure'; end $$;
create trigger test_fail_late_bootstrap before insert on public.audit_entries for each row when (new.after_json->>'name'='Fail Late') execute function pg_temp.fail_late_bootstrap();
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values('10000000-0000-0000-0000-000000000004','late-failure@example.test','{"workspace_name":"Fail Late"}')$$,'P0001','Intentional late bootstrap failure','Late audit failure rejects entire Auth signup');
select is((select count(*)::int from auth.users where email='late-failure@example.test'),0,'Late failure leaves no Auth orphan');
select is((select count(*)::int from public.user_profiles where id='10000000-0000-0000-0000-000000000004'),0,'Late failure rolls back profile');
select is((select count(*)::int from public.workspaces where name='Fail Late'),0,'Late failure rolls back workspace, roles and membership');
drop trigger test_fail_late_bootstrap on public.audit_entries;
select throws_ok(format('insert into public.memberships(workspace_id,user_id,base_level,role_id) values(%L,%L,''user'',%L)',:'w1','10000000-0000-0000-0000-000000000002',:'r2'),'23503',null,'Composite role FK rejects cross-workspace relationship');
select throws_ok(format('insert into public.memberships(workspace_id,user_id,base_level,role_id) select %L,%L,''owner'',id from roles where workspace_id=%L and name=''Owner''',:'w1','10000000-0000-0000-0000-000000000002',:'w1'),'23505',null,'Second active Owner rejected');
select throws_ok('update public.audit_entries set event_type=''forged''','42501','Audit entries are append-only','Audit UPDATE blocked even for ordinary table owner path');
select throws_ok('delete from public.audit_entries','42501','Audit entries are append-only','Audit DELETE blocked');
select ok(not exists(select 1 from pg_roles where rolname in ('ubmp_reader','ubmp_command','ubmp_bootstrap') and (rolcanlogin or rolbypassrls or rolsuper)),'Narrow roles cannot login or bypass RLS');
select ok(not pg_has_role('authenticated','ubmp_command','MEMBER'),'Authenticated cannot assume command role');
select ok(not pg_has_role('anon','ubmp_reader','MEMBER'),'Anonymous has no reverse inheritance into private reader');
select ok(not pg_has_role('authenticated','ubmp_reader','MEMBER'),'Authenticated has no inheritance into private reader');
select ok(not has_function_privilege('anon','private.active_session()','EXECUTE'),'Anonymous cannot execute private session helper');
select ok(not has_function_privilege('authenticated','private.active_session()','EXECUTE'),'Authenticated cannot directly call managed-Auth definer helper');
select ok(not has_function_privilege('authenticated','private.bootstrap_user()','EXECUTE'),'Authenticated cannot execute signup bootstrap directly');
select ok(not has_function_privilege('authenticated','private.enforce_owner()','EXECUTE'),'Authenticated cannot call privileged owner trigger');
select throws_ok(format('update public.memberships set base_level=''user'' where id=%L; set constraints all immediate',:'m1'),'23514','Workspace must retain its active Owner','Deferred invariant rejects Owner demotion');
select ok(not has_table_privilege('authenticated','public.workspaces','UPDATE'),'User direct workspace DML revoked');
select ok(not has_table_privilege('authenticated','public.audit_entries','INSERT'),'User direct audit INSERT revoked');
select ok(not has_function_privilege('anon','public.update_workspace(uuid,bigint,text,text,text)','EXECUTE'),'Anonymous command execution denied');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'),'No business tables published raw to Realtime');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id','20000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select ok(public.has_active_session(),'Persisted current session accepted');
select is((select count(*)::int from public.get_my_workspaces()),1,'Workspace RPC returns only own membership');
select is((select count(*)::int from public.workspaces),1,'Direct SELECT RLS isolates tenant');
select is((select count(*)::int from public.memberships),1,'Membership RLS cannot expose other tenant');
select is((select count(*)::int from public.get_workspace(:'w1')),1,'Own workspace lookup works');
select throws_ok(format('select * from public.get_workspace(%L)',:'w2'),'PT403','FORBIDDEN','Cross-tenant RPC denied');
select is((select count(*)::int from public.get_my_permissions(:'w1')),(select count(*)::int from public.permission_catalog),'Owner resolves trusted catalog permissions');
select is((select version::int from public.update_workspace(:'w1',1,'Updated One','UTC','USD')),2,'Optimistic workspace update advances version');
select throws_ok(format('select * from public.update_workspace(%L,1,''Overwrite'',''UTC'',''USD'')',:'w1'),'PT409','STALE_VERSION','Stale edit rejected');
select throws_ok(format('select * from public.update_workspace(%L,2,''Bad'',''Unknown/Zone'',''USD'')',:'w1'),'PT400','VALIDATION_FAILED','Untrusted timezone rejected');
select is((select count(*)::int from public.audit_entries where event_type='workspace.updated'),1,'Mutation and audit commit together');
select throws_ok('update public.workspaces set name=''bypass''','42501',null,'Direct authenticated update denied');
select throws_ok('delete from public.audit_entries','42501',null,'Authenticated audit deletion denied');
reset role;
-- Remove permissions using trusted administrative fixture, then observe current database state.
insert into memberships(workspace_id,user_id,base_level,role_id) values(:'w2','10000000-0000-0000-0000-000000000001','user',:'r2');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id','20000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select throws_ok(format('select * from public.update_workspace(%L,1,''Forbidden'',''UTC'',''USD'')',:'w2'),'PT403','FORBIDDEN','Active ordinary member cannot manage workspace');
reset role;
insert into role_permissions(workspace_id,role_id,permission_key) values(:'w2',:'r2','workspace.manage');
insert into membership_permission_overrides(workspace_id,membership_id,permission_key,effect) select workspace_id,id,'workspace.manage','deny' from memberships where workspace_id=:'w2' and user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from public.get_my_permissions(:'w2') where key='workspace.manage'),0,'Member deny overrides role allow immediately');
select throws_ok(format('select * from public.update_workspace(%L,1,''Denied'',''UTC'',''USD'')',:'w2'),'PT403','FORBIDDEN','Role allow cannot bypass member deny');
reset role;
delete from membership_permission_overrides where workspace_id=:'w2';
set local role authenticated;
select is((select version::int from public.update_workspace(:'w2',1,'Permitted by grant','UTC','USD')),2,'Explicit permission permits command independently of base-level name');
reset role;
update memberships set status='inactive' where workspace_id=:'w2' and user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(format('select * from public.get_workspace(%L)',:'w2'),'PT403','FORBIDDEN','Membership revocation acts without JWT refresh');
reset role;
delete from auth.sessions where id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok(not public.has_active_session(),'Deleted session rejects still-unexpired JWT');
select is((select count(*)::int from public.workspaces),0,'Revoked session loses direct RLS reads');
select throws_ok('select * from public.get_my_workspaces()','PT401','UNAUTHENTICATED','Revoked session cannot invoke workspace RPC');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id','20000000-0000-0000-0000-000000000002','exp',extract(epoch from now()+interval '1 hour'))::text,true) is not null;
set local role authenticated;
select ok(not public.has_active_session(),'Another user session ID cannot authorize actor');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id','20000000-0000-0000-0000-000000000002','exp',extract(epoch from now()-interval '1 hour'))::text,true) is not null;
set local role authenticated;
select ok(not public.has_active_session(),'Expired JWT rejected even when session persists');
reset role;
select set_config('request.jwt.claims','{}',true) is not null;
set local role authenticated;
select ok(not public.has_active_session(),'Missing session is false');
select throws_ok('select * from public.get_my_workspaces()','PT401','UNAUTHENTICATED','No session command rejected');
reset role;
select * from finish();
rollback;
