-- Append audit facts without requiring the actor to read the resulting row.
create or replace function private.append_audit_entry(
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

  -- INSERT ... RETURNING also applies the audit SELECT policy. Generate the id
  -- here so a command actor does not need audit.view just to append its audit fact.
  v_id := gen_random_uuid();
  insert into public.audit_entries(
    id, workspace_id, actor_kind, actor_membership_id, event_type, target_type, target_id,
    before_json, after_json, correlation_id, source_event_id
  ) values (
    v_id, p_workspace_id, p_actor_kind, p_actor_membership_id, btrim(p_event_type),
    btrim(p_target_type), p_target_id,
    private.mask_audit_json(p_before_json, true),
    private.mask_audit_json(p_after_json, true),
    coalesce(p_correlation_id, gen_random_uuid()), p_source_event_id
  );
  return v_id;
end;
$$;
