-- CRM record storage and tenant-scoped command RPCs.
create table public.customer_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (name = btrim(name) and length(name) between 1 and 500),
  website text check (website is null or (
    length(website) <= 2048 and website = btrim(website)
    and website ~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  )),
  created_by uuid not null,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, created_by) references public.memberships(workspace_id, id) on delete restrict
);
create index customer_companies_workspace_page on public.customer_companies(workspace_id, created_at desc, id desc) where archived_at is null;
create index customer_companies_workspace_name on public.customer_companies(workspace_id, lower(name)) where archived_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  company_id uuid,
  owner_membership_id uuid,
  name text not null check (name = btrim(name) and length(name) between 1 and 500),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  email_normalized text check (email_normalized is null or (
    email_normalized = lower(btrim(email_normalized))
    and length(email_normalized) <= 254
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )),
  opted_out_at timestamptz,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.customer_companies(workspace_id, id) on delete restrict,
  foreign key (workspace_id, owner_membership_id) references public.memberships(workspace_id, id) on delete restrict
);
create unique index contacts_live_workspace_phone on public.contacts(workspace_id, phone_e164)
  where archived_at is null and phone_e164 is not null;
create index contacts_workspace_page on public.contacts(workspace_id, created_at desc, id desc) where archived_at is null;
create index contacts_workspace_owner_page on public.contacts(workspace_id, owner_membership_id, created_at desc, id desc) where archived_at is null;
create index contacts_workspace_company on public.contacts(workspace_id, company_id) where archived_at is null and company_id is not null;

alter table public.customer_companies enable row level security;
alter table public.contacts enable row level security;
revoke all on public.customer_companies, public.contacts from public, anon, authenticated, service_role;
grant select on public.customer_companies, public.contacts to ubmp_reader;
grant select, insert, update on public.customer_companies, public.contacts to ubmp_command;

create policy crm_company_reader on public.customer_companies for select to ubmp_reader, ubmp_command
using (
  private.member_id(workspace_id) is not null
  and private.has_permission(workspace_id, 'crm.companies.view')
  and (
    private.has_permission(workspace_id, 'crm.records.view_all')
    or created_by = private.member_id(workspace_id)
    or exists (
      select 1 from public.contacts c
      where c.workspace_id = customer_companies.workspace_id
        and c.company_id = customer_companies.id
        and c.archived_at is null
        and (private.has_permission(workspace_id, 'crm.records.view_all') or c.owner_membership_id = private.member_id(workspace_id))
    )
  )
);
create policy crm_company_writer_insert on public.customer_companies for insert to ubmp_command
with check (
  private.member_id(workspace_id) is not null
  and private.has_permission(workspace_id, 'crm.companies.create')
  and created_by = private.member_id(workspace_id)
);
create policy crm_company_writer_update on public.customer_companies for update to ubmp_command
using (
  private.member_id(workspace_id) is not null
  and (private.has_permission(workspace_id, 'crm.companies.edit') or private.has_permission(workspace_id, 'crm.companies.delete'))
  and (private.has_permission(workspace_id, 'crm.records.view_all') or created_by = private.member_id(workspace_id)
    or exists (select 1 from public.contacts c where c.workspace_id = customer_companies.workspace_id and c.company_id = customer_companies.id and c.archived_at is null and c.owner_membership_id = private.member_id(workspace_id)))
)
with check (
  private.member_id(workspace_id) is not null
  and (private.has_permission(workspace_id, 'crm.companies.edit') or private.has_permission(workspace_id, 'crm.companies.delete'))
  and (private.has_permission(workspace_id, 'crm.records.view_all') or created_by = private.member_id(workspace_id)
    or exists (select 1 from public.contacts c where c.workspace_id = customer_companies.workspace_id and c.company_id = customer_companies.id and c.archived_at is null and c.owner_membership_id = private.member_id(workspace_id)))
);
create policy crm_contact_reader on public.contacts for select to ubmp_reader, ubmp_command
using (
  private.member_id(workspace_id) is not null
  and private.has_permission(workspace_id, 'crm.contacts.view')
  and (private.has_permission(workspace_id, 'crm.records.view_all') or owner_membership_id = private.member_id(workspace_id))
);
create policy crm_contact_writer_insert on public.contacts for insert to ubmp_command
with check (
  private.member_id(workspace_id) is not null
  and private.has_permission(workspace_id, 'crm.contacts.create')
  and owner_membership_id = private.member_id(workspace_id)
  and (company_id is null or exists (select 1 from public.customer_companies c where c.workspace_id = contacts.workspace_id and c.id = contacts.company_id and c.archived_at is null))
);
create policy crm_contact_writer_update on public.contacts for update to ubmp_command
using (
  private.member_id(workspace_id) is not null
  and (private.has_permission(workspace_id, 'crm.contacts.edit') or private.has_permission(workspace_id, 'crm.contacts.delete'))
  and (private.has_permission(workspace_id, 'crm.records.view_all') or owner_membership_id = private.member_id(workspace_id))
)
with check (
  private.member_id(workspace_id) is not null
  and (private.has_permission(workspace_id, 'crm.contacts.edit') or private.has_permission(workspace_id, 'crm.contacts.delete'))
  and (private.has_permission(workspace_id, 'crm.records.view_all') or owner_membership_id = private.member_id(workspace_id))
  and (company_id is null or exists (select 1 from public.customer_companies c where c.workspace_id = contacts.workspace_id and c.id = contacts.company_id and c.archived_at is null))
);

-- append_audit_entry returns its inserted id. Let the command role see only the
-- current actor's row so INSERT ... RETURNING works without granting audit.view.
create policy crm_command_own_audit_return on public.audit_entries for select to ubmp_command
using (private.member_id(workspace_id) is not null and actor_membership_id = private.member_id(workspace_id));

-- Stable cursor list functions. Data is returned only through the user's scoped session.
create function public.list_crm_companies(p_workspace_id uuid, p_before_at timestamptz, p_before_id uuid, p_limit integer)
returns table(id uuid, name text, website text, version bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.active_session() then raise exception using errcode='PT401', message='UNAUTHENTICATED'; end if;
  if private.member_id(p_workspace_id) is null or not private.has_permission(p_workspace_id,'crm.companies.view') then raise exception using errcode='PT403', message='FORBIDDEN'; end if;
  if p_limit not between 1 and 101 or ((p_before_at is null) <> (p_before_id is null)) then raise exception using errcode='PT400', message='VALIDATION_FAILED'; end if;
  return query select c.id,c.name,c.website,c.version,c.created_at
    from public.customer_companies c where c.workspace_id=p_workspace_id and c.archived_at is null
      and (p_before_at is null or (c.created_at,c.id)<(p_before_at,p_before_id))
    order by c.created_at desc,c.id desc limit p_limit;
end $$;

create function public.get_crm_company(p_workspace_id uuid,p_company_id uuid)
returns table(id uuid,name text,website text,version bigint,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  if private.member_id(p_workspace_id) is null or not private.has_permission(p_workspace_id,'crm.companies.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  return query select c.id,c.name,c.website,c.version,c.created_at from public.customer_companies c
    where c.workspace_id=p_workspace_id and c.id=p_company_id and c.archived_at is null;
end $$;

create function public.create_crm_company(p_workspace_id uuid,p_name text,p_website text)
returns table(id uuid,name text,website text,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.companies.create') or not private.has_permission(p_workspace_id,'crm.companies.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_name is null or p_name<>btrim(p_name) or length(p_name) not between 1 and 500 or (p_website is not null and (p_website<>btrim(p_website) or length(p_website)>2048 or p_website !~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')) then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
  insert into public.customer_companies(workspace_id,name,website,created_by) values(p_workspace_id,p_name,p_website,v_actor) returning customer_companies.id into v_id;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.company.created','company',v_id,null,jsonb_build_object('version',1));
  return query select c.id,c.name,c.website,c.version,c.created_at from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=v_id;
end $$;

create function public.update_crm_company(p_workspace_id uuid,p_company_id uuid,p_expected_version bigint,p_name_set boolean,p_name text,p_website_set boolean,p_website text)
returns table(id uuid,name text,website text,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_old public.customer_companies%rowtype; v_new_version bigint;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.companies.edit') or not private.has_permission(p_workspace_id,'crm.companies.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_expected_version is null or p_expected_version<1 or (not p_name_set and not p_website_set) or (p_name_set and (p_name is null or p_name<>btrim(p_name) or length(p_name) not between 1 and 500)) or (p_website_set and p_website is not null and (p_website<>btrim(p_website) or length(p_website)>2048 or p_website !~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')) then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
  select c.* into v_old from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id and c.archived_at is null for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if v_old.version<>p_expected_version then raise exception using errcode='PT409',message='STALE_VERSION'; end if;
  update public.customer_companies c set name=case when p_name_set then p_name else c.name end, website=case when p_website_set then p_website else c.website end, version=c.version+1, updated_at=now()
    where c.workspace_id=p_workspace_id and c.id=p_company_id returning c.version into v_new_version;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.company.updated','company',p_company_id,jsonb_build_object('version',v_old.version),jsonb_build_object('version',v_new_version,'changed_fields',array_remove(array[case when p_name_set then 'name' end,case when p_website_set then 'website' end],null)));
  return query select c.id,c.name,c.website,c.version,c.created_at from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id;
end $$;

create function public.archive_crm_company(p_workspace_id uuid,p_company_id uuid,p_expected_version bigint)
returns table(id uuid,name text,website text,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_old public.customer_companies%rowtype; v_new_version bigint;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.companies.delete') or not private.has_permission(p_workspace_id,'crm.companies.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  select c.* into v_old from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id and c.archived_at is null for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if p_expected_version is null or v_old.version<>p_expected_version then raise exception using errcode='PT409',message='STALE_VERSION'; end if;
  if exists(select 1 from public.contacts c where c.workspace_id=p_workspace_id and c.company_id=p_company_id and c.archived_at is null) then raise exception using errcode='23503',message='Active contacts must be archived first'; end if;
  update public.customer_companies c set archived_at=now(),version=c.version+1,updated_at=now() where c.workspace_id=p_workspace_id and c.id=p_company_id returning c.version into v_new_version;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.company.archived','company',p_company_id,jsonb_build_object('version',v_old.version),jsonb_build_object('version',v_new_version,'archived',true));
  return query select c.id,c.name,c.website,c.version,c.created_at from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id;
end $$;

create function public.list_crm_contacts(p_workspace_id uuid,p_before_at timestamptz,p_before_id uuid,p_limit integer)
returns table(id uuid,name text,company_id uuid,owner_membership_id uuid,phone_e164 text,email_normalized text,opted_out_at timestamptz,version bigint,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  if private.member_id(p_workspace_id) is null or not private.has_permission(p_workspace_id,'crm.contacts.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_limit not between 1 and 101 or ((p_before_at is null) <> (p_before_id is null)) then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
  return query select c.id,c.name,c.company_id,c.owner_membership_id,c.phone_e164,c.email_normalized,c.opted_out_at,c.version,c.created_at
    from public.contacts c where c.workspace_id=p_workspace_id and c.archived_at is null
      and (private.has_permission(p_workspace_id,'crm.records.view_all') or c.owner_membership_id=private.member_id(p_workspace_id))
      and (p_before_at is null or (c.created_at,c.id)<(p_before_at,p_before_id)) order by c.created_at desc,c.id desc limit p_limit;
end $$;

create function public.get_crm_contact(p_workspace_id uuid,p_contact_id uuid)
returns table(id uuid,name text,company_id uuid,owner_membership_id uuid,phone_e164 text,email_normalized text,opted_out_at timestamptz,version bigint,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  if private.member_id(p_workspace_id) is null or not private.has_permission(p_workspace_id,'crm.contacts.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  return query select c.id,c.name,c.company_id,c.owner_membership_id,c.phone_e164,c.email_normalized,c.opted_out_at,c.version,c.created_at from public.contacts c
    where c.workspace_id=p_workspace_id and c.id=p_contact_id and c.archived_at is null and (private.has_permission(p_workspace_id,'crm.records.view_all') or c.owner_membership_id=private.member_id(p_workspace_id));
end $$;

create function public.create_crm_contact(p_workspace_id uuid,p_name text,p_company_id uuid,p_phone_e164 text,p_email_normalized text)
returns table(id uuid,name text,company_id uuid,owner_membership_id uuid,phone_e164 text,email_normalized text,opted_out_at timestamptz,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.contacts.create') or not private.has_permission(p_workspace_id,'crm.contacts.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_name is null or p_name<>btrim(p_name) or length(p_name) not between 1 and 500 or (p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{1,14}$') or (p_email_normalized is not null and (p_email_normalized<>lower(btrim(p_email_normalized)) or length(p_email_normalized)>254 or p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
  if p_company_id is not null and not exists(select 1 from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id and c.archived_at is null) then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  insert into public.contacts(workspace_id,company_id,owner_membership_id,name,phone_e164,email_normalized) values(p_workspace_id,p_company_id,v_actor,p_name,p_phone_e164,p_email_normalized) returning contacts.id into v_id;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.contact.created','contact',v_id,null,jsonb_build_object('version',1));
  return query select c.id,c.name,c.company_id,c.owner_membership_id,c.phone_e164,c.email_normalized,c.opted_out_at,c.version,c.created_at from public.contacts c where c.workspace_id=p_workspace_id and c.id=v_id;
end $$;

create function public.update_crm_contact(p_workspace_id uuid,p_contact_id uuid,p_expected_version bigint,p_name_set boolean,p_name text,p_company_set boolean,p_company_id uuid,p_phone_set boolean,p_phone_e164 text,p_email_set boolean,p_email_normalized text)
returns table(id uuid,name text,company_id uuid,owner_membership_id uuid,phone_e164 text,email_normalized text,opted_out_at timestamptz,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_old public.contacts%rowtype; v_new_version bigint;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.contacts.edit') or not private.has_permission(p_workspace_id,'crm.contacts.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_expected_version is null or p_expected_version<1 or (not p_name_set and not p_company_set and not p_phone_set and not p_email_set) or (p_name_set and (p_name is null or p_name<>btrim(p_name) or length(p_name) not between 1 and 500)) or (p_phone_set and p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{1,14}$') or (p_email_set and p_email_normalized is not null and (p_email_normalized<>lower(btrim(p_email_normalized)) or length(p_email_normalized)>254 or p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception using errcode='PT400',message='VALIDATION_FAILED'; end if;
  if p_company_set and p_company_id is not null and not exists(select 1 from public.customer_companies c where c.workspace_id=p_workspace_id and c.id=p_company_id and c.archived_at is null) then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  select c.* into v_old from public.contacts c where c.workspace_id=p_workspace_id and c.id=p_contact_id and c.archived_at is null and (private.has_permission(p_workspace_id,'crm.records.view_all') or c.owner_membership_id=v_actor) for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if v_old.version<>p_expected_version then raise exception using errcode='PT409',message='STALE_VERSION'; end if;
  update public.contacts c set name=case when p_name_set then p_name else c.name end, company_id=case when p_company_set then p_company_id else c.company_id end, phone_e164=case when p_phone_set then p_phone_e164 else c.phone_e164 end, email_normalized=case when p_email_set then p_email_normalized else c.email_normalized end, version=c.version+1, updated_at=now()
    where c.workspace_id=p_workspace_id and c.id=p_contact_id returning c.version into v_new_version;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.contact.updated','contact',p_contact_id,jsonb_build_object('version',v_old.version),jsonb_build_object('version',v_new_version,'changed_fields',array_remove(array[case when p_name_set then 'name' end,case when p_company_set then 'company_id' end,case when p_phone_set then 'phone_e164' end,case when p_email_set then 'email' end],null)));
  return query select c.id,c.name,c.company_id,c.owner_membership_id,c.phone_e164,c.email_normalized,c.opted_out_at,c.version,c.created_at from public.contacts c where c.workspace_id=p_workspace_id and c.id=p_contact_id;
end $$;

create function public.archive_crm_contact(p_workspace_id uuid,p_contact_id uuid,p_expected_version bigint)
returns table(id uuid,name text,company_id uuid,owner_membership_id uuid,phone_e164 text,email_normalized text,opted_out_at timestamptz,version bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_old public.contacts%rowtype; v_new_version bigint;
begin
  if not private.active_session() then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  v_actor:=private.member_id(p_workspace_id);
  if v_actor is null or not private.has_permission(p_workspace_id,'crm.contacts.delete') or not private.has_permission(p_workspace_id,'crm.contacts.view') then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  select c.* into v_old from public.contacts c where c.workspace_id=p_workspace_id and c.id=p_contact_id and c.archived_at is null and (private.has_permission(p_workspace_id,'crm.records.view_all') or c.owner_membership_id=v_actor) for update;
  if not found then raise exception using errcode='PT404',message='NOT_FOUND'; end if;
  if p_expected_version is null or v_old.version<>p_expected_version then raise exception using errcode='PT409',message='STALE_VERSION'; end if;
  update public.contacts c set archived_at=now(),version=c.version+1,updated_at=now() where c.workspace_id=p_workspace_id and c.id=p_contact_id returning c.version into v_new_version;
  perform private.append_audit_entry(p_workspace_id,'user',v_actor,'crm.contact.archived','contact',p_contact_id,jsonb_build_object('version',v_old.version),jsonb_build_object('version',v_new_version,'archived',true));
  return query select c.id,c.name,c.company_id,c.owner_membership_id,c.phone_e164,c.email_normalized,c.opted_out_at,c.version,c.created_at from public.contacts c where c.workspace_id=p_workspace_id and c.id=p_contact_id;
end $$;

grant create on schema public to ubmp_reader,ubmp_command;
alter function public.list_crm_companies(uuid,timestamptz,uuid,integer) owner to ubmp_reader;
alter function public.get_crm_company(uuid,uuid) owner to ubmp_reader;
alter function public.list_crm_contacts(uuid,timestamptz,uuid,integer) owner to ubmp_reader;
alter function public.get_crm_contact(uuid,uuid) owner to ubmp_reader;
alter function public.create_crm_company(uuid,text,text) owner to ubmp_command;
alter function public.update_crm_company(uuid,uuid,bigint,boolean,text,boolean,text) owner to ubmp_command;
alter function public.archive_crm_company(uuid,uuid,bigint) owner to ubmp_command;
alter function public.create_crm_contact(uuid,text,uuid,text,text) owner to ubmp_command;
alter function public.update_crm_contact(uuid,uuid,bigint,boolean,text,boolean,uuid,boolean,text,boolean,text) owner to ubmp_command;
alter function public.archive_crm_contact(uuid,uuid,bigint) owner to ubmp_command;
revoke create on schema public from ubmp_reader,ubmp_command;
revoke all on function public.list_crm_companies(uuid,timestamptz,uuid,integer),public.get_crm_company(uuid,uuid),public.list_crm_contacts(uuid,timestamptz,uuid,integer),public.get_crm_contact(uuid,uuid),public.create_crm_company(uuid,text,text),public.update_crm_company(uuid,uuid,bigint,boolean,text,boolean,text),public.archive_crm_company(uuid,uuid,bigint),public.create_crm_contact(uuid,text,uuid,text,text),public.update_crm_contact(uuid,uuid,bigint,boolean,text,boolean,uuid,boolean,text,boolean,text),public.archive_crm_contact(uuid,uuid,bigint) from public,anon;
grant execute on function public.list_crm_companies(uuid,timestamptz,uuid,integer),public.get_crm_company(uuid,uuid),public.list_crm_contacts(uuid,timestamptz,uuid,integer),public.get_crm_contact(uuid,uuid),public.create_crm_company(uuid,text,text),public.update_crm_company(uuid,uuid,bigint,boolean,text,boolean,text),public.archive_crm_company(uuid,uuid,bigint),public.create_crm_contact(uuid,text,uuid,text,text),public.update_crm_contact(uuid,uuid,bigint,boolean,text,boolean,uuid,boolean,text,boolean,text),public.archive_crm_contact(uuid,uuid,bigint) to authenticated;
