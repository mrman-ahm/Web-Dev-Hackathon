-- Core identity foundation. Privileged roles are NOLOGIN, NOBYPASSRLS and cannot be assumed by API roles.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create role ubmp_reader nologin nobypassrls;
create role ubmp_command nologin nobypassrls;
create role ubmp_bootstrap nologin nobypassrls;
grant ubmp_reader, ubmp_command, ubmp_bootstrap to postgres;
grant usage on schema public, private to ubmp_reader, ubmp_command, ubmp_bootstrap;
grant usage on schema private to authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check (length(btrim(display_name)) between 1 and 120),
 timezone text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 timezone text not null, default_currency text not null check(default_currency ~ '^[A-Z]{3}$'),
 owner_membership_id uuid not null, state text not null default 'active' check(state in ('active','suspended')),
 version bigint not null default 1 check(version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.roles (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete restrict,
 name text not null check(length(btrim(name)) between 1 and 80), system_default boolean not null default false,
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create unique index roles_name on public.roles(workspace_id,lower(name));
create table public.memberships (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 base_level text not null check(base_level in ('owner','admin','user')), role_id uuid not null,
 status text not null default 'active' check(status in ('active','inactive')), joined_at timestamptz not null default now(),
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,user_id), foreign key(workspace_id,role_id) references public.roles(workspace_id,id) on delete restrict
);
create unique index memberships_active_owner on public.memberships(workspace_id) where base_level='owner' and status='active';
create index memberships_user_access on public.memberships(user_id,status,workspace_id);
create index memberships_role on public.memberships(workspace_id,role_id);
alter table public.workspaces add constraint workspaces_owner_fk foreign key(id,owner_membership_id) references public.memberships(workspace_id,id) on delete restrict deferrable initially deferred;
create table public.permission_catalog (key text primary key, description text not null);
insert into public.permission_catalog(key,description)
select p,p from unnest(array[
'workspace.manage','members.view','members.manage','members.availability.manage','permissions.manage',
'crm.values.view','crm.values.edit','crm.configure','crm.records.view_all','crm.filters.share',
'assignment.manage','leads.view','leads.create','leads.edit','leads.reassign','leads.view_all','leads.recovery.view','leads.recovery.accept',
'messaging.view','messaging.send','messaging.view_all','payments.view','payments.create','payments.send',
'calendar.view','calendar.book','integrations.view','integrations.manage','integrations.history.view',
'integrations.calendar.connect_own','notifications.destination.manage_own','notifications.failures.view',
'audit.view','dashboard.view','dashboard.company.view'
]::text[]) p;
insert into public.permission_catalog(key,description)
select 'crm.'||entity||'.'||op,'CRM '||entity||' '||op from unnest(array['contacts','companies','opportunities']) entity cross join unnest(array['view','create','edit','delete','export']) op;
create table public.role_permissions (
 workspace_id uuid not null, role_id uuid not null, permission_key text not null references public.permission_catalog(key),
 created_at timestamptz not null default now(), primary key(workspace_id,role_id,permission_key),
 foreign key(workspace_id,role_id) references public.roles(workspace_id,id) on delete cascade
);
create table public.membership_permission_overrides (
 workspace_id uuid not null, membership_id uuid not null, permission_key text not null references public.permission_catalog(key),
 effect text not null check(effect in ('allow','deny')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(workspace_id,membership_id,permission_key),
 foreign key(workspace_id,membership_id) references public.memberships(workspace_id,id) on delete restrict
);
create table public.workspace_invitations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), email_normalized text not null check(email_normalized=lower(btrim(email_normalized))),
 token_hash bytea not null unique check(octet_length(token_hash)=32), base_level text not null check(base_level in ('admin','user')), role_id uuid not null, invited_by uuid not null,
 expires_at timestamptz not null default (now()+interval '7 days'), accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id),
 foreign key(workspace_id,role_id) references public.roles(workspace_id,id), foreign key(workspace_id,invited_by) references public.memberships(workspace_id,id),
 check (not(accepted_at is not null and revoked_at is not null)), check(expires_at>created_at)
);
create unique index invitations_live_email on public.workspace_invitations(workspace_id,email_normalized) where accepted_at is null and revoked_at is null;
create index invitations_role on public.workspace_invitations(workspace_id,role_id);
create index invitations_inviter on public.workspace_invitations(workspace_id,invited_by);
create table public.employee_availability (
 workspace_id uuid not null, membership_id uuid not null, status text not null default 'offline' check(status in ('available','busy','on_leave','offline')),
 open_lead_limit integer not null default 10 check(open_lead_limit>=1), changed_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(workspace_id,membership_id),
 foreign key(workspace_id,membership_id) references public.memberships(workspace_id,id), foreign key(workspace_id,changed_by) references public.memberships(workspace_id,id)
);
create index availability_actor on public.employee_availability(workspace_id,changed_by);
create table public.assignment_rules (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), name text not null,
 is_default boolean not null default false, enabled boolean not null default false, cursor bigint not null default 0 check(cursor>=0),
 idle_threshold_seconds integer not null default 3600 check(idle_threshold_seconds>0), version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create unique index assignment_default on public.assignment_rules(workspace_id) where is_default;
create table public.assignment_rule_members (
 workspace_id uuid not null, rule_id uuid not null, membership_id uuid not null, position integer not null check(position>=0),
 primary key(workspace_id,rule_id,membership_id), unique(workspace_id,rule_id,position),
 foreign key(workspace_id,rule_id) references public.assignment_rules(workspace_id,id), foreign key(workspace_id,membership_id) references public.memberships(workspace_id,id)
);
create index assignment_members_member on public.assignment_rule_members(workspace_id,membership_id);
create table public.assignment_tiers (
 workspace_id uuid not null, rule_id uuid not null, level integer not null check(level>=0), kind text not null check(kind in ('pool','backup','manager')),
 membership_id uuid, ack_window_seconds integer not null default 60 check(ack_window_seconds>0),
 primary key(workspace_id,rule_id,level), foreign key(workspace_id,rule_id) references public.assignment_rules(workspace_id,id),
 foreign key(workspace_id,membership_id) references public.memberships(workspace_id,id),
 check((kind='pool' and membership_id is null) or (kind in ('backup','manager') and membership_id is not null))
);
create index assignment_tiers_member on public.assignment_tiers(workspace_id,membership_id);
create table public.audit_entries (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 actor_kind text not null check(actor_kind in ('user','system','provider')), actor_membership_id uuid,
 event_type text not null, target_type text not null, target_id uuid not null,
 before_json jsonb, after_json jsonb, occurred_at timestamptz not null default now(), correlation_id uuid not null default gen_random_uuid(), source_event_id uuid,
 unique(workspace_id,id), foreign key(workspace_id,actor_membership_id) references public.memberships(workspace_id,id),
 check((actor_kind='user' and actor_membership_id is not null) or actor_kind in ('system','provider'))
);
create index audit_timeline on public.audit_entries(workspace_id,occurred_at,id);
create index audit_type on public.audit_entries(workspace_id,event_type);
create index audit_actor on public.audit_entries(workspace_id,actor_membership_id);

-- Enable all RLS before any grants. Deployment roles get only explicit per-operation policies.
do $$ declare t text; begin
 foreach t in array array['user_profiles','workspaces','roles','memberships','permission_catalog','role_permissions','membership_permission_overrides','workspace_invitations','employee_availability','assignment_rules','assignment_rule_members','assignment_tiers','audit_entries'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
 if t = any(array['workspaces','memberships','permission_catalog','role_permissions','membership_permission_overrides']) then
  execute format('grant select on public.%I to ubmp_reader, ubmp_command',t);
  execute format('create policy foundation_read on public.%I for select to ubmp_reader, ubmp_command using (true)',t);
 end if;
 if t = any(array['user_profiles','workspaces','roles','memberships','role_permissions','employee_availability','assignment_rules','assignment_tiers','audit_entries']) then
  execute format('grant insert on public.%I to ubmp_bootstrap',t);
  execute format('create policy bootstrap_insert on public.%I for insert to ubmp_bootstrap with check (true)',t);
 end if;
 end loop;
end $$;
grant select on public.permission_catalog to ubmp_bootstrap;
create policy bootstrap_catalog on public.permission_catalog for select to ubmp_bootstrap using(true);
grant update on public.workspaces to ubmp_command;
create policy command_workspace_update on public.workspaces for update to ubmp_command using(true) with check(true);
grant insert on public.audit_entries to ubmp_command;
create policy command_audit_insert on public.audit_entries for insert to ubmp_command with check(true);
-- Managed Auth tables enable RLS with no custom-role policies. The only exception
-- is the no-argument boolean session helper below, owned by migration postgres.
-- No user-facing domain command uses a bypass role or exposes managed Auth rows.

create function private.active_session() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid uuid; actor uuid; claims jsonb;
begin
 claims:=auth.jwt(); actor:=auth.uid();
 if actor is null or coalesce(claims->>'session_id','')='' then return false; end if;
 begin sid:=(claims->>'session_id')::uuid; exception when invalid_text_representation then return false; end;
 if coalesce((claims->>'exp')::numeric,0) <= extract(epoch from now()) then return false; end if;
 return exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=sid and s.user_id=actor and (s.not_after is null or s.not_after>now()) and u.deleted_at is null and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now()));
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
create function private.member_id(w uuid) returns uuid language sql stable security definer set search_path='' as $$
 select m.id from public.memberships m join public.workspaces x on x.id=m.workspace_id
 where m.workspace_id=w and m.user_id=(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid and m.status='active' and x.state='active' and private.active_session()
$$;
create function private.has_permission(w uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m join public.permission_catalog c on c.key=p
 where m.id=private.member_id(w) and (
 m.base_level='owner' or (
 not exists(select 1 from public.membership_permission_overrides o where o.workspace_id=w and o.membership_id=m.id and o.permission_key=p and o.effect='deny') and (
 exists(select 1 from public.membership_permission_overrides o where o.workspace_id=w and o.membership_id=m.id and o.permission_key=p and o.effect='allow') or
 exists(select 1 from public.role_permissions r where r.workspace_id=w and r.role_id=m.role_id and r.permission_key=p)))))
$$;
-- Function creation ownership is granted temporarily and removed before commit.
grant create on schema private to ubmp_reader, ubmp_bootstrap;
-- private.active_session remains postgres-owned only for managed Auth RLS reads.
alter function private.member_id(uuid) owner to ubmp_reader;
alter function private.has_permission(uuid,text) owner to ubmp_reader;
revoke all on function private.active_session(),private.member_id(uuid),private.has_permission(uuid,text) from public,anon,authenticated;
grant execute on function private.active_session() to ubmp_reader,ubmp_command;
grant execute on function private.member_id(uuid),private.has_permission(uuid,text) to ubmp_reader,ubmp_command,authenticated;

create function private.enforce_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 if tg_table_name='workspaces' then w:=new.id; else w:=coalesce(new.workspace_id,old.workspace_id); end if;
 if exists(select 1 from public.workspaces x where x.id=w and not exists(select 1 from public.memberships m where m.workspace_id=w and m.id=x.owner_membership_id and m.base_level='owner' and m.status='active')) then
 raise exception using errcode='23514',message='Workspace must retain its active Owner'; end if;
 return null;
end $$;
alter function private.enforce_owner() owner to ubmp_reader;
revoke all on function private.enforce_owner() from public,anon,authenticated;
create constraint trigger workspace_owner_valid after insert or update on public.workspaces deferrable initially deferred for each row execute function private.enforce_owner();
create constraint trigger membership_owner_valid after insert or update or delete on public.memberships deferrable initially deferred for each row execute function private.enforce_owner();
create function private.audit_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception using errcode='42501',message='Audit entries are append-only'; end $$;
revoke all on function private.audit_immutable() from public,anon,authenticated;
create trigger audit_no_mutation before update or delete or truncate on public.audit_entries for each statement execute function private.audit_immutable();

create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); r_owner uuid:=gen_random_uuid(); r_admin uuid:=gen_random_uuid(); r_user uuid:=gen_random_uuid(); rule uuid:=gen_random_uuid();
 dn text:=coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Workspace Owner');
 wn text:=coalesce(nullif(btrim(new.raw_user_meta_data->>'workspace_name'),''),'My workspace');
 tz text:=coalesce(new.raw_user_meta_data->>'timezone','UTC'); cur text:=coalesce(new.raw_user_meta_data->>'default_currency','USD');
begin
 if length(dn)>120 or length(wn)>120 or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) or cur !~ '^[A-Z]{3}$' then raise exception using errcode='22023',message='Invalid signup profile'; end if;
 insert into public.user_profiles(id,display_name,timezone) values(new.id,dn,tz);
 insert into public.workspaces(id,name,timezone,default_currency,owner_membership_id) values(w,wn,tz,cur,m);
 insert into public.roles(id,workspace_id,name,system_default) values(r_owner,w,'Owner',true),(r_admin,w,'Admin',true),(r_user,w,'User',true);
 insert into public.role_permissions(workspace_id,role_id,permission_key) select w,r_owner,key from public.permission_catalog;
 insert into public.role_permissions(workspace_id,role_id,permission_key) select w,r_admin,key from public.permission_catalog where key<>'permissions.manage';
 insert into public.role_permissions(workspace_id,role_id,permission_key) select w,r_user,key from public.permission_catalog where key in ('crm.contacts.view','crm.contacts.create','crm.contacts.edit','crm.companies.view','crm.opportunities.view','crm.opportunities.create','crm.opportunities.edit','leads.view','leads.create','messaging.view','messaging.send','calendar.view','calendar.book','integrations.calendar.connect_own','notifications.destination.manage_own','dashboard.view');
 insert into public.memberships(id,workspace_id,user_id,base_level,role_id) values(m,w,new.id,'owner',r_owner);
 insert into public.employee_availability(workspace_id,membership_id,status,changed_by) values(w,m,'offline',m);
 insert into public.assignment_rules(id,workspace_id,name,is_default,enabled) values(rule,w,'Default',true,false);
 insert into public.assignment_tiers(workspace_id,rule_id,level,kind,ack_window_seconds) values(w,rule,0,'pool',60);
 insert into public.audit_entries(workspace_id,actor_kind,actor_membership_id,event_type,target_type,target_id,after_json) values(w,'user',m,'workspace.created','workspace',w,jsonb_build_object('name',wn));
 return new;
end $$;
alter function private.bootstrap_user() owner to ubmp_bootstrap;
revoke all on function private.bootstrap_user() from public,anon,authenticated;
create trigger auth_user_bootstrap after insert on auth.users for each row execute function private.bootstrap_user();

create function public.has_active_session() returns boolean language sql stable security definer set search_path='' as $$ select private.active_session() $$;
create function public.get_my_workspaces() returns table(id uuid,name text,timezone text,default_currency text,version bigint,membership_id uuid,base_level text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
 return query select w.id,w.name,w.timezone,w.default_currency,w.version,m.id,m.base_level from public.workspaces w join public.memberships m on m.workspace_id=w.id where m.user_id=(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid and m.status='active' and w.state='active' order by w.created_at,w.id;
end $$;
create function public.get_workspace(p_workspace_id uuid) returns table(id uuid,name text,timezone text,default_currency text,version bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
 if private.member_id(p_workspace_id) is null then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
 return query select w.id,w.name,w.timezone,w.default_currency,w.version from public.workspaces w where w.id=p_workspace_id;
end $$;
create function public.get_my_permissions(p_workspace_id uuid) returns table(key text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
 if private.member_id(p_workspace_id) is null then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
 return query select c.key from public.permission_catalog c where private.has_permission(p_workspace_id,c.key) order by c.key;
end $$;
create function public.update_workspace(p_workspace_id uuid,p_expected_version bigint,p_name text,p_timezone text,p_default_currency text) returns table(id uuid,name text,timezone text,default_currency text,version bigint) language plpgsql security definer set search_path='' as $$
declare oldrow public.workspaces%rowtype; actor uuid;
begin
 if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
 actor:=private.member_id(p_workspace_id);
 if actor is null or not private.has_permission(p_workspace_id,'workspace.manage') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
 select * into oldrow from public.workspaces w where w.id=p_workspace_id for update;
 if p_expected_version is null or oldrow.version<>p_expected_version then raise exception using errcode='PT409',message='STALE_VERSION'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names tz where tz.name=p_timezone) or p_default_currency is null or p_default_currency !~ '^[A-Z]{3}$' then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
 update public.workspaces w set name=btrim(p_name),timezone=p_timezone,default_currency=p_default_currency,version=w.version+1,updated_at=now() where w.id=p_workspace_id;
 insert into public.audit_entries(workspace_id,actor_kind,actor_membership_id,event_type,target_type,target_id,before_json,after_json) values(p_workspace_id,'user',actor,'workspace.updated','workspace',p_workspace_id,jsonb_build_object('name',oldrow.name,'timezone',oldrow.timezone,'default_currency',oldrow.default_currency),jsonb_build_object('name',btrim(p_name),'timezone',p_timezone,'default_currency',p_default_currency));
 return query select w.id,w.name,w.timezone,w.default_currency,w.version from public.workspaces w where w.id=p_workspace_id;
end $$;
grant create on schema public to ubmp_command;
alter function public.has_active_session() owner to ubmp_command;
alter function public.get_my_workspaces() owner to ubmp_command;
alter function public.get_workspace(uuid) owner to ubmp_command;
alter function public.get_my_permissions(uuid) owner to ubmp_command;
alter function public.update_workspace(uuid,bigint,text,text,text) owner to ubmp_command;
revoke create on schema public from ubmp_command;
revoke create on schema private from ubmp_reader,ubmp_bootstrap;
revoke all on function public.has_active_session(),public.get_my_workspaces(),public.get_workspace(uuid),public.get_my_permissions(uuid),public.update_workspace(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.has_active_session(),public.get_my_workspaces(),public.get_workspace(uuid),public.get_my_permissions(uuid),public.update_workspace(uuid,bigint,text,text,text) to authenticated;

-- Direct table reads use the same current session/member checks. No direct user writes.
grant select on public.user_profiles,public.workspaces,public.memberships,public.roles,public.permission_catalog,public.role_permissions,public.membership_permission_overrides,public.employee_availability,public.assignment_rules,public.assignment_rule_members,public.assignment_tiers,public.audit_entries to authenticated;
create policy profile_self on public.user_profiles for select to authenticated using(id=auth.uid() and public.has_active_session());
create policy workspace_member on public.workspaces for select to authenticated using(private.member_id(id) is not null);
create policy member_visibility on public.memberships for select to authenticated using(private.member_id(workspace_id) is not null and (user_id=auth.uid() or private.has_permission(workspace_id,'members.view')));
create policy role_visibility on public.roles for select to authenticated using(private.member_id(workspace_id) is not null);
create policy catalog_visibility on public.permission_catalog for select to authenticated using(public.has_active_session());
create policy role_grants_visibility on public.role_permissions for select to authenticated using(private.member_id(workspace_id) is not null);
create policy override_visibility on public.membership_permission_overrides for select to authenticated using(membership_id=private.member_id(workspace_id) or private.has_permission(workspace_id,'permissions.manage'));
create policy availability_visibility on public.employee_availability for select to authenticated using(private.member_id(workspace_id) is not null);
create policy rules_visibility on public.assignment_rules for select to authenticated using(private.has_permission(workspace_id,'assignment.manage'));
create policy pool_visibility on public.assignment_rule_members for select to authenticated using(private.has_permission(workspace_id,'assignment.manage'));
create policy tiers_visibility on public.assignment_tiers for select to authenticated using(private.has_permission(workspace_id,'assignment.manage'));
create policy audit_visibility on public.audit_entries for select to authenticated using(private.has_permission(workspace_id,'audit.view'));
