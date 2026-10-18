-- Permission administration stays inside the authenticated workspace transaction.
-- The API roles cannot assume ubmp_command; these RPCs recheck the current grant.
grant select on public.roles to ubmp_command;
grant insert (workspace_id, name) on public.roles to ubmp_command;
grant update (name, version, updated_at) on public.roles to ubmp_command;
grant select, delete on public.role_permissions to ubmp_command;
grant insert (workspace_id, role_id, permission_key) on public.role_permissions to ubmp_command;
grant select, delete on public.membership_permission_overrides to ubmp_command;
grant insert (workspace_id, membership_id, permission_key, effect) on public.membership_permission_overrides to ubmp_command;
grant select on public.permission_catalog to ubmp_command;
grant select on public.memberships to ubmp_command;
grant update (version, updated_at) on public.memberships to ubmp_command;

create policy command_permission_roles_read on public.roles for select to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_roles_insert on public.roles for insert to ubmp_command
  with check (private.member_id(workspace_id) is not null);
create policy command_permission_roles_update on public.roles for update to ubmp_command
  using (private.member_id(workspace_id) is not null)
  with check (private.member_id(workspace_id) is not null);
create policy command_permission_grants_read on public.role_permissions for select to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_grants_insert on public.role_permissions for insert to ubmp_command
  with check (private.member_id(workspace_id) is not null);
create policy command_permission_grants_delete on public.role_permissions for delete to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_overrides_read on public.membership_permission_overrides for select to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_overrides_insert on public.membership_permission_overrides for insert to ubmp_command
  with check (private.member_id(workspace_id) is not null);
create policy command_permission_overrides_delete on public.membership_permission_overrides for delete to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_members_read on public.memberships for select to ubmp_command
  using (private.member_id(workspace_id) is not null);
create policy command_permission_members_update on public.memberships for update to ubmp_command
  using (private.member_id(workspace_id) is not null)
  with check (private.member_id(workspace_id) is not null);
create policy command_permission_catalog_read on public.permission_catalog for select to ubmp_command using (true);

create function private.require_permission_admin(p_workspace_id uuid, p_lock boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if not private.active_session() then
    raise exception using errcode='PT401', message='UNAUTHENTICATED';
  end if;
  actor := private.member_id(p_workspace_id);
  if actor is null or not private.has_permission(p_workspace_id, 'permissions.manage') then
    raise exception using errcode='PT403', message='FORBIDDEN';
  end if;
  if p_lock then
    perform 1 from public.workspaces w where w.id=p_workspace_id and w.state='active' for update;
    if not found or not private.has_permission(p_workspace_id, 'permissions.manage') then
      raise exception using errcode='PT403', message='FORBIDDEN';
    end if;
  end if;
  return actor;
end $$;
grant create on schema private to ubmp_command;
alter function private.require_permission_admin(uuid,boolean) owner to ubmp_command;
revoke create on schema private from ubmp_command;
revoke all on function private.require_permission_admin(uuid,boolean) from public, anon, authenticated;

create function public.get_permission_configuration(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.require_permission_admin(p_workspace_id);
  select jsonb_build_object(
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'systemDefault', r.system_default,
        'permissionKeys', coalesce((select jsonb_agg(rp.permission_key order by rp.permission_key)
          from public.role_permissions rp where rp.workspace_id=r.workspace_id and rp.role_id=r.id), '[]'::jsonb),
        'version', r.version
      ) order by r.system_default desc, r.name)
      from public.roles r where r.workspace_id=p_workspace_id
    ), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'description', c.description) order by c.key)
      from public.permission_catalog c), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.create_permission_role(p_workspace_id uuid, p_name text, p_permission_keys text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; new_role public.roles%rowtype; normalized_name text;
begin
  actor := private.require_permission_admin(p_workspace_id, true);
  normalized_name := btrim(coalesce(p_name, ''));
  if length(normalized_name) not between 1 and 80 or p_permission_keys is null
    or cardinality(p_permission_keys)>200
    or cardinality(p_permission_keys)<>(select count(distinct k) from unnest(p_permission_keys) k)
    or exists(select 1 from unnest(p_permission_keys) k left join public.permission_catalog c on c.key=k where c.key is null) then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  insert into public.roles(workspace_id,name) values(p_workspace_id,normalized_name) returning * into new_role;
  insert into public.role_permissions(workspace_id,role_id,permission_key)
    select p_workspace_id,new_role.id,k from unnest(p_permission_keys) k;
  insert into public.audit_entries(workspace_id,actor_kind,actor_membership_id,event_type,target_type,target_id,after_json)
    values(p_workspace_id,'user',actor,'permissions.role.created','role',new_role.id,
      jsonb_build_object('name',new_role.name,'permissionKeys',to_jsonb(p_permission_keys)));
  return jsonb_build_object('id',new_role.id,'name',new_role.name,'systemDefault',new_role.system_default,
    'permissionKeys',to_jsonb(p_permission_keys),'version',new_role.version);
exception when unique_violation then
  raise exception using errcode='PT409', message='CONFLICT';
end $$;

create function public.update_permission_role(
  p_workspace_id uuid, p_role_id uuid, p_expected_version bigint, p_name text, p_permission_keys text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; old_role public.roles%rowtype; new_role public.roles%rowtype; old_keys jsonb; normalized_name text;
begin
  actor := private.require_permission_admin(p_workspace_id, true);
  select * into old_role from public.roles r where r.workspace_id=p_workspace_id and r.id=p_role_id for update;
  if not found then raise exception using errcode='PT404', message='NOT_FOUND'; end if;
  if p_expected_version is null or old_role.version<>p_expected_version then
    raise exception using errcode='PT409', message='STALE_VERSION';
  end if;
  normalized_name := btrim(coalesce(p_name, ''));
  if length(normalized_name) not between 1 and 80 or p_permission_keys is null
    or cardinality(p_permission_keys)>200
    or cardinality(p_permission_keys)<>(select count(distinct k) from unnest(p_permission_keys) k)
    or exists(select 1 from unnest(p_permission_keys) k left join public.permission_catalog c on c.key=k where c.key is null) then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  select coalesce(jsonb_agg(rp.permission_key order by rp.permission_key),'[]'::jsonb) into old_keys
    from public.role_permissions rp where rp.workspace_id=p_workspace_id and rp.role_id=p_role_id;
  update public.roles r set name=normalized_name, version=r.version+1, updated_at=now()
    where r.workspace_id=p_workspace_id and r.id=p_role_id returning * into new_role;
  delete from public.role_permissions rp where rp.workspace_id=p_workspace_id and rp.role_id=p_role_id;
  insert into public.role_permissions(workspace_id,role_id,permission_key)
    select p_workspace_id,p_role_id,k from unnest(p_permission_keys) k;
  insert into public.audit_entries(workspace_id,actor_kind,actor_membership_id,event_type,target_type,target_id,before_json,after_json)
    values(p_workspace_id,'user',actor,'permissions.role.updated','role',new_role.id,
      jsonb_build_object('name',old_role.name,'permissionKeys',old_keys),
      jsonb_build_object('name',new_role.name,'permissionKeys',to_jsonb(p_permission_keys)));
  return jsonb_build_object('id',new_role.id,'name',new_role.name,'systemDefault',new_role.system_default,
    'permissionKeys',to_jsonb(p_permission_keys),'version',new_role.version);
exception when unique_violation then
  raise exception using errcode='PT409', message='CONFLICT';
end $$;

create function public.replace_member_permission_overrides(
  p_workspace_id uuid, p_membership_id uuid, p_expected_version bigint, p_overrides jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.memberships%rowtype; old_overrides jsonb; new_overrides jsonb;
begin
  actor := private.require_permission_admin(p_workspace_id, true);
  select * into target from public.memberships m
    where m.workspace_id=p_workspace_id and m.id=p_membership_id for update;
  if not found then raise exception using errcode='PT404', message='NOT_FOUND'; end if;
  if target.base_level='owner' then raise exception using errcode='PT403', message='FORBIDDEN'; end if;
  if p_expected_version is null or target.version<>p_expected_version then
    raise exception using errcode='PT409', message='STALE_VERSION';
  end if;
  if p_overrides is null or jsonb_typeof(p_overrides)<>'array' then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  if jsonb_array_length(p_overrides)>200 then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  if exists(select 1 from jsonb_array_elements(p_overrides) e(value) where jsonb_typeof(e.value)<>'object') then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  if exists(select 1 from jsonb_array_elements(p_overrides) e(value)
      where (select count(*) from jsonb_object_keys(e.value))<>2 or not (e.value ? 'key') or not (e.value ? 'effect')) then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_overrides) as o(key text,effect text)
      where o.key is null or o.effect is null or o.effect not in ('allow','deny')
        or not exists(select 1 from public.permission_catalog c where c.key=o.key)) then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  if (select count(*) from jsonb_to_recordset(p_overrides) as o(key text,effect text)) <>
       (select count(distinct o.key) from jsonb_to_recordset(p_overrides) as o(key text,effect text)) then
    raise exception using errcode='PT400', message='VALIDATION_FAILED';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',o.permission_key,'effect',o.effect) order by o.permission_key),'[]'::jsonb)
    into old_overrides from public.membership_permission_overrides o
    where o.workspace_id=p_workspace_id and o.membership_id=p_membership_id;
  new_overrides := coalesce((select jsonb_agg(jsonb_build_object('key',o.key,'effect',o.effect) order by o.key)
    from jsonb_to_recordset(p_overrides) as o(key text,effect text)),'[]'::jsonb);
  delete from public.membership_permission_overrides o where o.workspace_id=p_workspace_id and o.membership_id=p_membership_id;
  insert into public.membership_permission_overrides(workspace_id,membership_id,permission_key,effect)
    select p_workspace_id,p_membership_id,o.key,o.effect from jsonb_to_recordset(p_overrides) as o(key text,effect text);
  update public.memberships m set version=m.version+1,updated_at=now()
    where m.workspace_id=p_workspace_id and m.id=p_membership_id returning * into target;
  insert into public.audit_entries(workspace_id,actor_kind,actor_membership_id,event_type,target_type,target_id,before_json,after_json)
    values(p_workspace_id,'user',actor,'permissions.member_overrides.updated','membership',p_membership_id,old_overrides,new_overrides);
  return jsonb_build_object('membershipVersion',target.version,'overrides',new_overrides);
end $$;

grant create on schema public, private to ubmp_command;
alter function public.get_permission_configuration(uuid) owner to ubmp_command;
alter function public.create_permission_role(uuid,text,text[]) owner to ubmp_command;
alter function public.update_permission_role(uuid,uuid,bigint,text,text[]) owner to ubmp_command;
alter function public.replace_member_permission_overrides(uuid,uuid,bigint,jsonb) owner to ubmp_command;
revoke create on schema public, private from ubmp_command;
revoke all on function public.get_permission_configuration(uuid),
  public.create_permission_role(uuid,text,text[]),
  public.update_permission_role(uuid,uuid,bigint,text,text[]),
  public.replace_member_permission_overrides(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.get_permission_configuration(uuid),
  public.create_permission_role(uuid,text,text[]),
  public.update_permission_role(uuid,uuid,bigint,text,text[]),
  public.replace_member_permission_overrides(uuid,uuid,bigint,jsonb) to authenticated;
