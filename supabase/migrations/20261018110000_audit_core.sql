-- Central, append-only audit command and permission-checked history projection.
grant select on public.audit_entries, public.user_profiles to ubmp_command;

-- Keep direct reads to safe audit metadata; the JSON diff columns are available only
-- through the permission-checking projection below.
revoke select on public.audit_entries from authenticated;
grant select (
  id, workspace_id, actor_kind, actor_membership_id, event_type, target_type,
  target_id, occurred_at, correlation_id, source_event_id
) on public.audit_entries to authenticated;

create policy audit_command_read on public.audit_entries
  for select to ubmp_command
  using (private.member_id(workspace_id) is not null and private.has_permission(workspace_id, 'audit.view'));

create policy audit_actor_profile_read on public.user_profiles
  for select to ubmp_command
  using (exists (
    select 1
    from public.memberships m
    where m.user_id = user_profiles.id
      and private.member_id(m.workspace_id) is not null
      and private.has_permission(m.workspace_id, 'audit.view')
  ));

create function private.mask_audit_json(p_value jsonb, p_can_view_financials boolean)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_value is null then
    return p_value;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(
        entry.key,
        case
          when replace(replace(lower(entry.key), '_', ''), '-', '') like any(array[
            '%password%', '%secret%', '%token%', '%authorization%', '%credential%',
            '%apikey%', '%privatekey%', '%signature%'
          ]::text[]) then to_jsonb('[redacted]'::text)
          when not p_can_view_financials and lower(entry.key) = any(array[
            'amount', 'amount_minor', 'amountminor', 'money', 'value',
            'opportunity_value', 'opportunityvalue', 'financials', 'gross', 'net', 'revenue'
          ]::text[]) then to_jsonb('[restricted]'::text)
          else private.mask_audit_json(entry.value, p_can_view_financials)
        end
      ), '{}'::jsonb)
      into v_result
      from jsonb_each(p_value) as entry;
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(private.mask_audit_json(entry.value, p_can_view_financials)), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value) as entry(value);
      return v_result;
    else
      return p_value;
  end case;
end;
$$;
revoke all on function private.mask_audit_json(jsonb, boolean) from public, anon, authenticated;
grant execute on function private.mask_audit_json(jsonb, boolean) to ubmp_command;

create function private.append_audit_entry(
  p_workspace_id uuid,
  p_actor_kind text,
  p_actor_membership_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_before_json jsonb default null,
  p_after_json jsonb default null,
  p_correlation_id uuid default null,
  p_source_event_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_membership_id uuid;
  v_id uuid;
begin
  if p_workspace_id is null
    or p_event_type is null or length(btrim(p_event_type)) not between 1 and 128
    or p_target_type is null or length(btrim(p_target_type)) not between 1 and 64
    or p_target_id is null
    or (p_before_json is not null and jsonb_typeof(p_before_json) <> 'object')
    or (p_after_json is not null and jsonb_typeof(p_after_json) <> 'object')
    or coalesce(pg_catalog.pg_column_size(p_before_json), 0) > 32768
    or coalesce(pg_catalog.pg_column_size(p_after_json), 0) > 32768
  then
    raise exception using errcode = 'PT400', message = 'VALIDATION_FAILED';
  end if;

  if p_actor_kind = 'user' then
    if not private.active_session() then
      raise exception using errcode = 'PT401', message = 'UNAUTHENTICATED';
    end if;
    v_actor_membership_id := private.member_id(p_workspace_id);
    if v_actor_membership_id is null or p_actor_membership_id is null
      or v_actor_membership_id <> p_actor_membership_id
    then
      raise exception using errcode = 'PT403', message = 'FORBIDDEN';
    end if;
  elsif p_actor_kind in ('system', 'provider') then
    if p_actor_membership_id is not null or private.active_session() then
      raise exception using errcode = 'PT403', message = 'FORBIDDEN';
    end if;
  else
    raise exception using errcode = 'PT400', message = 'VALIDATION_FAILED';
  end if;

  insert into public.audit_entries(
    workspace_id, actor_kind, actor_membership_id, event_type, target_type, target_id,
    before_json, after_json, correlation_id, source_event_id
  ) values (
    p_workspace_id, p_actor_kind, p_actor_membership_id, btrim(p_event_type),
    btrim(p_target_type), p_target_id,
    private.mask_audit_json(p_before_json, true),
    private.mask_audit_json(p_after_json, true),
    coalesce(p_correlation_id, gen_random_uuid()), p_source_event_id
  ) returning id into v_id;
  return v_id;
end;
$$;
grant create on schema private to ubmp_command;
alter function private.append_audit_entry(uuid, text, uuid, text, text, uuid, jsonb, jsonb, uuid, uuid) owner to ubmp_command;
revoke create on schema private from ubmp_command;
revoke all on function private.append_audit_entry(uuid, text, uuid, text, text, uuid, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function private.append_audit_entry(uuid, text, uuid, text, text, uuid, jsonb, jsonb, uuid, uuid) to ubmp_command;

create function public.get_audit_entries(
  p_workspace_id uuid,
  p_event_type text default null,
  p_actor_membership_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 26
) returns table(
  id uuid,
  event_type text,
  actor_kind text,
  actor_display_name text,
  target_type text,
  target_id uuid,
  occurred_at timestamptz,
  before_json jsonb,
  after_json jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_can_view_financials boolean;
begin
  if not private.active_session() then
    raise exception using errcode = 'PT401', message = 'UNAUTHENTICATED';
  end if;
  if p_workspace_id is null or private.member_id(p_workspace_id) is null
    or not private.has_permission(p_workspace_id, 'audit.view')
  then
    raise exception using errcode = 'PT403', message = 'FORBIDDEN';
  end if;
  if p_limit is null or p_limit not between 1 and 101
    or (p_event_type is not null and length(btrim(p_event_type)) not between 1 and 128)
    or (p_from is not null and p_to is not null and p_from > p_to)
    or ((p_before_at is null) <> (p_before_id is null))
  then
    raise exception using errcode = 'PT400', message = 'VALIDATION_FAILED';
  end if;

  v_can_view_financials := private.has_permission(p_workspace_id, 'crm.values.view');
  return query
    select e.id, e.event_type, e.actor_kind,
      case when e.actor_kind = 'user' then profile.display_name else null end,
      e.target_type, e.target_id, e.occurred_at,
      case when v_can_view_financials then e.before_json else private.mask_audit_json(e.before_json, false) end,
      case when v_can_view_financials then e.after_json else private.mask_audit_json(e.after_json, false) end
    from public.audit_entries e
    left join public.memberships actor_membership
      on actor_membership.workspace_id = e.workspace_id
      and actor_membership.id = e.actor_membership_id
    left join public.user_profiles profile on profile.id = actor_membership.user_id
    where e.workspace_id = p_workspace_id
      and (p_event_type is null or e.event_type = btrim(p_event_type))
      and (p_actor_membership_id is null or e.actor_membership_id = p_actor_membership_id)
      and (p_from is null or e.occurred_at >= p_from)
      and (p_to is null or e.occurred_at <= p_to)
      and (p_before_at is null or (e.occurred_at, e.id) < (p_before_at, p_before_id))
    order by e.occurred_at desc, e.id desc
    limit p_limit;
end;
$$;
grant create on schema public to ubmp_command;
alter function public.get_audit_entries(uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) owner to ubmp_command;
revoke all on function public.get_audit_entries(uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_audit_entries(uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to authenticated;

create or replace function public.update_workspace(
  p_workspace_id uuid, p_expected_version bigint, p_name text, p_timezone text, p_default_currency text
) returns table(id uuid, name text, timezone text, default_currency text, version bigint)
language plpgsql security definer set search_path = '' as $$
declare
  oldrow public.workspaces%rowtype;
  actor uuid;
begin
  if not private.active_session() then
    raise exception using errcode = 'PT401', message = 'UNAUTHENTICATED';
  end if;
  actor := private.member_id(p_workspace_id);
  if actor is null or not private.has_permission(p_workspace_id, 'workspace.manage') then
    raise exception using errcode = 'PT403', message = 'FORBIDDEN';
  end if;
  select * into oldrow from public.workspaces w where w.id = p_workspace_id for update;
  if p_expected_version is null or oldrow.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'STALE_VERSION';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_timezone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone)
    or p_default_currency is null or p_default_currency !~ '^[A-Z]{3}$'
  then
    raise exception using errcode = 'PT400', message = 'VALIDATION_FAILED';
  end if;

  update public.workspaces w
  set name = btrim(p_name), timezone = p_timezone, default_currency = p_default_currency,
      version = w.version + 1, updated_at = now()
  where w.id = p_workspace_id;
  perform private.append_audit_entry(
    p_workspace_id, 'user', actor, 'workspace.updated', 'workspace', p_workspace_id,
    jsonb_build_object('name', oldrow.name, 'timezone', oldrow.timezone, 'default_currency', oldrow.default_currency),
    jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone, 'default_currency', p_default_currency)
  );
  return query select w.id, w.name, w.timezone, w.default_currency, w.version
    from public.workspaces w where w.id = p_workspace_id;
end;
$$;
alter function public.update_workspace(uuid, bigint, text, text, text) owner to ubmp_command;
revoke create on schema public from ubmp_command;

comment on function private.append_audit_entry(uuid, text, uuid, text, text, uuid, jsonb, jsonb, uuid, uuid)
  is 'Append a database-timestamped audit fact within the caller transaction. Domain commands must derive the user actor and pass only safe, bounded diffs.';
comment on function public.get_audit_entries(uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)
  is 'Permission-checked, workspace-scoped audit page. Cursor uses descending (occurred_at,id); date filters are inclusive.';
