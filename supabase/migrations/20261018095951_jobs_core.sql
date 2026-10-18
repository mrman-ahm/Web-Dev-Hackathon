-- Durable domain events and outbox. Provider I/O happens after a committed claim,
-- outside this database transaction; completion is token checked and at least once.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'ubmp_worker') then
    create role ubmp_worker nologin nobypassrls;
  end if;
end
$$;
alter role ubmp_worker nologin nobypassrls;
grant ubmp_worker to postgres;
grant usage on schema public, private to ubmp_worker;

create table private.domain_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  schema_version smallint not null default 1 check (schema_version = 1),
  aggregate_type text not null check (length(aggregate_type) between 1 and 80),
  aggregate_id uuid not null,
  aggregate_version bigint not null check (aggregate_version > 0),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_kind text not null check (actor_kind in ('user','system','provider')),
  actor_membership_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (workspace_id, id),
  unique (workspace_id, aggregate_type, aggregate_id, aggregate_version, event_name),
  foreign key (workspace_id, actor_membership_id)
    references public.memberships(workspace_id, id) on delete restrict,
  check ((actor_kind = 'user' and actor_membership_id is not null)
      or (actor_kind in ('system','provider') and actor_membership_id is null)),
  check (octet_length(payload::text) <= 32768)
);

create table private.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  event_id uuid,
  kind text not null check (kind in (
    'integration.inbox.process', 'messaging.send', 'payments.checkout.create',
    'calendar.event.sync', 'notifications.telegram.send', 'domain.consume',
    'realtime.invalidate', 'export.generate'
  )),
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending','running','succeeded','failed','unknown')),
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  terminal_at timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, kind, dedupe_key),
  foreign key (workspace_id, event_id)
    references private.domain_events(workspace_id, id) on delete restrict,
  check (octet_length(payload::text) <= 16384),
  check ((state = 'running' and lease_token is not null and lease_until is not null)
      or (state <> 'running' and lease_token is null and lease_until is null)),
  check ((state in ('succeeded','failed','unknown') and terminal_at is not null)
      or (state in ('pending','running') and terminal_at is null))
);

create table private.outbox_job_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  outbox_job_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  lease_token uuid not null unique,
  started_at timestamptz not null default clock_timestamp(),
  effect_started_at timestamptz,
  finished_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'confirmed','temporary_failure','permanent_failure','unknown','lease_expired'
  )),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  retry_at timestamptz,
  unique (outbox_job_id, attempt_number),
  foreign key (workspace_id, outbox_job_id)
    references private.outbox_jobs(workspace_id, id) on delete restrict,
  check ((outcome is null and finished_at is null)
      or (outcome is not null and finished_at is not null))
);

create table private.worker_dispatch_receipts (
  nonce text primary key check (nonce ~ '^[A-Za-z0-9_-]{22,128}$'),
  signed_at timestamptz not null,
  accepted_at timestamptz not null default clock_timestamp()
);

create index domain_events_aggregate_timeline
  on private.domain_events(workspace_id, aggregate_type, aggregate_id, aggregate_version);
create index outbox_jobs_due
  on private.outbox_jobs(available_at, created_at, id) where state = 'pending';
create index outbox_jobs_expired_lease
  on private.outbox_jobs(lease_until, created_at, id) where state = 'running';
create index outbox_jobs_failure_visibility
  on private.outbox_jobs(workspace_id, kind, updated_at desc, id desc)
  where state in ('failed','unknown');
create index outbox_attempt_history
  on private.outbox_job_attempts(workspace_id, outbox_job_id, attempt_number desc);
create index worker_dispatch_receipts_retention
  on private.worker_dispatch_receipts(accepted_at);

alter table private.domain_events enable row level security;
alter table private.outbox_jobs enable row level security;
alter table private.outbox_job_attempts enable row level security;
alter table private.worker_dispatch_receipts enable row level security;
revoke all on private.domain_events, private.outbox_jobs, private.outbox_job_attempts,
  private.worker_dispatch_receipts from public, anon, authenticated, service_role;

grant select, insert on private.domain_events to ubmp_command;
grant select, insert on private.outbox_jobs to ubmp_command;
grant select, insert, update on private.outbox_jobs to ubmp_worker;
grant select, insert, update on private.outbox_job_attempts to ubmp_worker;
grant select, insert on private.worker_dispatch_receipts to ubmp_worker;
grant delete on private.worker_dispatch_receipts to ubmp_worker;

create policy command_events_read on private.domain_events
  for select to ubmp_command using (true);
create policy command_events_append on private.domain_events
  for insert to ubmp_command with check (true);
create policy command_jobs_read on private.outbox_jobs
  for select to ubmp_command using (true);
create policy command_jobs_append on private.outbox_jobs
  for insert to ubmp_command with check (true);
create policy worker_jobs_read on private.outbox_jobs
  for select to ubmp_worker using (true);
create policy worker_jobs_create on private.outbox_jobs
  for insert to ubmp_worker with check (true);
create policy worker_jobs_update on private.outbox_jobs
  for update to ubmp_worker using (true) with check (true);
create policy worker_attempts_read on private.outbox_job_attempts
  for select to ubmp_worker using (true);
create policy worker_attempts_create on private.outbox_job_attempts
  for insert to ubmp_worker with check (true);
create policy worker_attempts_update on private.outbox_job_attempts
  for update to ubmp_worker using (true) with check (true);
create policy worker_dispatch_receipts_read on private.worker_dispatch_receipts
  for select to ubmp_worker using (true);
create policy worker_dispatch_receipts_create on private.worker_dispatch_receipts
  for insert to ubmp_worker with check (true);
create policy worker_dispatch_receipts_purge on private.worker_dispatch_receipts
  for delete to ubmp_worker using (true);

create function private.reject_domain_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'Domain events are append-only';
end
$$;
revoke all on function private.reject_domain_event_mutation() from public, anon, authenticated, service_role;
create trigger domain_events_no_mutation
  before update or delete or truncate on private.domain_events
  for each statement execute function private.reject_domain_event_mutation();

create function private.contains_sensitive_key(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  v_entry record;
  v_item jsonb;
  v_key text;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_entry in select key, value from jsonb_each(p_value) loop
      v_key := regexp_replace(lower(v_entry.key), '[^a-z0-9]', '', 'g');
      if v_key ~ '(secret|token|password|credential|authorization|privatekey|apikey|cardnumber|cvv|cvc|securitycode)' then
        return true;
      end if;
      if private.contains_sensitive_key(v_entry.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_item in select value from jsonb_array_elements(p_value) loop
      if private.contains_sensitive_key(v_item) then return true; end if;
    end loop;
  end if;
  return false;
end
$$;
revoke all on function private.contains_sensitive_key(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.contains_sensitive_key(jsonb) to ubmp_command;

create function private.append_domain_event(
  p_event_id uuid,
  p_workspace_id uuid,
  p_event_name text,
  p_schema_version smallint,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_aggregate_version bigint,
  p_actor_kind text,
  p_actor_membership_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_payload jsonb,
  p_jobs jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_job jsonb;
  v_kind text;
  v_dedupe_key text;
  v_payload jsonb;
  v_available_at timestamptz;
  v_max_attempts integer;
  v_job_id uuid;
begin
  if p_event_id is null or p_workspace_id is null or p_aggregate_id is null
    or p_correlation_id is null or p_aggregate_version is null or p_aggregate_version < 1
    or p_schema_version is null or p_schema_version <> 1
    or p_event_name is null or p_event_name !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
    or p_aggregate_type is null or length(p_aggregate_type) not between 1 and 80
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 32768
    or private.contains_sensitive_key(p_payload) then
    raise exception using errcode = '22023', message = 'Invalid domain event';
  end if;
  if p_actor_kind is null or p_actor_kind not in ('user','system','provider')
    or (p_actor_kind = 'user' and (p_actor_membership_id is null
      or private.member_id(p_workspace_id) is distinct from p_actor_membership_id))
    or (p_actor_kind in ('system','provider') and p_actor_membership_id is not null) then
    raise exception using errcode = '42501', message = 'Invalid domain event actor';
  end if;
  if p_jobs is null or jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 20 then
    raise exception using errcode = '22023', message = 'Invalid outbox jobs';
  end if;

  insert into private.domain_events(
    id, workspace_id, event_name, schema_version, aggregate_type, aggregate_id,
    aggregate_version, actor_kind, actor_membership_id, correlation_id,
    causation_id, payload
  ) values (
    p_event_id, p_workspace_id, p_event_name, p_schema_version, p_aggregate_type,
    p_aggregate_id, p_aggregate_version, p_actor_kind, p_actor_membership_id,
    p_correlation_id, p_causation_id, p_payload
  );

  for v_job in select value from jsonb_array_elements(p_jobs) loop
    if jsonb_typeof(v_job) <> 'object'
      or (v_job - array['kind','dedupeKey','payload','maxAttempts','availableAt']) <> '{}'::jsonb
      or not (v_job ? 'kind') or not (v_job ? 'dedupeKey') or not (v_job ? 'payload') then
      raise exception using errcode = '22023', message = 'Invalid outbox job';
    end if;
    v_kind := v_job->>'kind';
    v_dedupe_key := v_job->>'dedupeKey';
    v_payload := v_job->'payload';
    if v_kind not in (
      'integration.inbox.process', 'messaging.send', 'payments.checkout.create',
      'calendar.event.sync', 'notifications.telegram.send', 'domain.consume',
      'realtime.invalidate', 'export.generate'
    ) or v_dedupe_key is null or length(v_dedupe_key) not between 1 and 200
      or v_payload is null or jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 16384
      or private.contains_sensitive_key(v_payload) then
      raise exception using errcode = '22023', message = 'Invalid outbox job';
    end if;
    v_max_attempts := 5;
    if v_job ? 'maxAttempts' then
      if jsonb_typeof(v_job->'maxAttempts') <> 'number'
        or (v_job->>'maxAttempts') !~ '^[1-9][0-9]?$' then
        raise exception using errcode = '22023', message = 'Invalid outbox job retry limit';
      end if;
      v_max_attempts := (v_job->>'maxAttempts')::integer;
      if v_max_attempts not between 1 and 10 then
        raise exception using errcode = '22023', message = 'Invalid outbox job retry limit';
      end if;
    end if;
    v_available_at := clock_timestamp();
    if v_job ? 'availableAt' then
      if jsonb_typeof(v_job->'availableAt') <> 'string' then
        raise exception using errcode = '22023', message = 'Invalid outbox schedule';
      end if;
      begin
        v_available_at := (v_job->>'availableAt')::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'Invalid outbox schedule';
      end;
      if v_available_at > clock_timestamp() + interval '30 days' then
        raise exception using errcode = '22023', message = 'Outbox schedule is too distant';
      end if;
    end if;

    insert into private.outbox_jobs(
      workspace_id, event_id, kind, dedupe_key, payload, available_at, max_attempts
    ) values (
      p_workspace_id, p_event_id, v_kind, v_dedupe_key, v_payload, v_available_at, v_max_attempts
    ) on conflict (workspace_id, kind, dedupe_key) do nothing returning id into v_job_id;
    if v_job_id is null then
      select j.id into v_job_id
      from private.outbox_jobs j
      where j.workspace_id = p_workspace_id and j.kind = v_kind and j.dedupe_key = v_dedupe_key;
      if not found or (select j.payload from private.outbox_jobs j where j.id = v_job_id) is distinct from v_payload then
        raise exception using errcode = '23505', message = 'Outbox idempotency key conflicts with a different payload';
      end if;
    end if;
  end loop;
  return p_event_id;
end
$$;
grant create on schema private to ubmp_command;
alter function private.append_domain_event(uuid,uuid,text,smallint,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,jsonb) owner to ubmp_command;
revoke create on schema private from ubmp_command;
revoke all on function private.append_domain_event(uuid,uuid,text,smallint,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.append_domain_event(uuid,uuid,text,smallint,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,jsonb)
  to ubmp_command;

create function private.claim_due_jobs(p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_job record;
  v_token uuid;
  v_lease_until timestamptz;
  v_jobs jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Invalid job batch size';
  end if;

  for v_job in
    select j.*
    from private.outbox_jobs j
    where (j.state = 'pending' and j.available_at <= clock_timestamp())
       or (j.state = 'running' and j.lease_until <= clock_timestamp())
    order by case when j.state = 'pending' then j.available_at else j.lease_until end,
      j.created_at, j.id
    limit p_limit
    for update skip locked
  loop
    if v_job.state = 'running' then
      if exists (
        select 1 from private.outbox_job_attempts a
        where a.workspace_id = v_job.workspace_id and a.outbox_job_id = v_job.id
          and a.lease_token = v_job.lease_token and a.effect_started_at is not null
      ) then
        update private.outbox_job_attempts a
        set outcome = 'unknown', error_code = 'WORKER_LEASE_EXPIRED_AFTER_EFFECT_START',
            finished_at = clock_timestamp()
        where a.workspace_id = v_job.workspace_id and a.outbox_job_id = v_job.id
          and a.lease_token = v_job.lease_token and a.finished_at is null;
        update private.outbox_jobs j
        set state = 'unknown', lease_token = null, lease_until = null,
            last_error_code = 'WORKER_LEASE_EXPIRED_AFTER_EFFECT_START',
            terminal_at = clock_timestamp(), updated_at = clock_timestamp()
        where j.id = v_job.id;
        continue;
      end if;

      update private.outbox_job_attempts a
      set outcome = 'lease_expired', error_code = 'WORKER_LEASE_EXPIRED',
          finished_at = clock_timestamp()
      where a.workspace_id = v_job.workspace_id and a.outbox_job_id = v_job.id
        and a.lease_token = v_job.lease_token and a.finished_at is null;
      if v_job.attempts >= v_job.max_attempts then
        update private.outbox_jobs j
        set state = 'failed', lease_token = null, lease_until = null,
            last_error_code = 'WORKER_LEASE_EXPIRED', terminal_at = clock_timestamp(),
            updated_at = clock_timestamp()
        where j.id = v_job.id;
        continue;
      end if;
    end if;

    v_token := gen_random_uuid();
    v_lease_until := clock_timestamp() + interval '45 seconds';
    update private.outbox_jobs j
    set state = 'running', attempts = j.attempts + 1, lease_token = v_token,
        lease_until = v_lease_until, last_error_code = null, updated_at = clock_timestamp()
    where j.id = v_job.id;
    insert into private.outbox_job_attempts(
      workspace_id, outbox_job_id, attempt_number, lease_token
    ) values (v_job.workspace_id, v_job.id, v_job.attempts + 1, v_token);
    v_jobs := v_jobs || jsonb_build_array(jsonb_build_object(
      'jobId', v_job.id, 'workspaceId', v_job.workspace_id, 'eventId', v_job.event_id,
      'kind', v_job.kind, 'payload', v_job.payload, 'attempt', v_job.attempts + 1,
      'maxAttempts', v_job.max_attempts, 'leaseToken', v_token, 'leaseUntil', v_lease_until
    ));
  end loop;
  return v_jobs;
end
$$;

create function private.dispatch_jobs(p_nonce text, p_signed_at timestamptz, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inserted integer;
  v_jobs jsonb;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{22,128}$'
    or p_signed_at is null or abs(extract(epoch from (clock_timestamp() - p_signed_at))) > 30
    or p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Invalid worker dispatch';
  end if;

  with expired as (
    select r.nonce from private.worker_dispatch_receipts r
    where r.accepted_at < clock_timestamp() - interval '48 hours'
    order by r.accepted_at limit 500
  )
  delete from private.worker_dispatch_receipts r using expired e where r.nonce = e.nonce;

  insert into private.worker_dispatch_receipts(nonce, signed_at)
  values (p_nonce, p_signed_at) on conflict (nonce) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('accepted', false, 'jobs', '[]'::jsonb);
  end if;
  v_jobs := private.claim_due_jobs(p_limit);
  return jsonb_build_object('accepted', true, 'jobs', v_jobs);
end
$$;

create function private.mark_job_effect_started(p_job_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if p_job_id is null or p_lease_token is null then return false; end if;
  update private.outbox_job_attempts a
  set effect_started_at = coalesce(a.effect_started_at, clock_timestamp())
  from private.outbox_jobs j
  where j.id = p_job_id and j.state = 'running' and j.lease_token = p_lease_token
    and j.lease_until > clock_timestamp()
    and a.workspace_id = j.workspace_id and a.outbox_job_id = j.id
    and a.lease_token = p_lease_token and a.finished_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;

create function private.finish_job(p_job_id uuid, p_lease_token uuid, p_outcome jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_job private.outbox_jobs%rowtype;
  v_status text;
  v_code text;
  v_retry_after integer := 0;
  v_delay integer;
  v_retry_at timestamptz;
  v_outcome text;
  v_error_code text;
begin
  if p_job_id is null or p_lease_token is null or p_outcome is null or jsonb_typeof(p_outcome) <> 'object'
    or (p_outcome - array['status','code','retryAfterSeconds']) <> '{}'::jsonb
    or not (p_outcome ? 'status') then
    raise exception using errcode = '22023', message = 'Invalid job result';
  end if;
  v_status := p_outcome->>'status';
  v_code := p_outcome->>'code';
  if v_status not in ('confirmed','temporary_failure','permanent_failure','unknown')
    or (v_code is not null and v_code !~ '^[A-Z][A-Z0-9_]{0,79}$')
    or (v_status in ('temporary_failure','permanent_failure','unknown') and v_code is null) then
    raise exception using errcode = '22023', message = 'Invalid job result';
  end if;
  if p_outcome ? 'retryAfterSeconds' then
    if v_status <> 'temporary_failure' or jsonb_typeof(p_outcome->'retryAfterSeconds') <> 'number'
      or (p_outcome->>'retryAfterSeconds') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Invalid retry delay';
    end if;
    v_retry_after := least((p_outcome->>'retryAfterSeconds')::numeric, 86400)::integer;
  end if;

  select j.* into v_job from private.outbox_jobs j
  where j.id = p_job_id for update;
  if not found or v_job.state <> 'running' or v_job.lease_token <> p_lease_token
    or v_job.lease_until <= clock_timestamp() then
    return false;
  end if;
  perform 1 from private.outbox_job_attempts a
  where a.workspace_id = v_job.workspace_id and a.outbox_job_id = v_job.id
    and a.lease_token = p_lease_token and a.finished_at is null
  for update;
  if not found then return false; end if;

  if v_status = 'temporary_failure' and v_job.attempts < v_job.max_attempts then
    v_delay := case v_job.attempts when 1 then 5 when 2 then 15 when 3 then 30 else 120 end
      + floor(random() * 3)::integer;
    v_delay := greatest(v_delay, v_retry_after);
    v_retry_at := clock_timestamp() + make_interval(secs => v_delay);
    v_outcome := 'temporary_failure';
    v_error_code := v_code;
    update private.outbox_jobs j
    set state = 'pending', available_at = v_retry_at, lease_token = null, lease_until = null,
        last_error_code = v_code, terminal_at = null, updated_at = clock_timestamp()
    where j.id = p_job_id;
  elsif v_status = 'temporary_failure' then
    v_outcome := 'temporary_failure';
    v_error_code := v_code;
    update private.outbox_jobs j
    set state = 'failed', lease_token = null, lease_until = null,
        last_error_code = v_code, terminal_at = clock_timestamp(), updated_at = clock_timestamp()
    where j.id = p_job_id;
  elsif v_status = 'confirmed' then
    v_outcome := 'confirmed';
    v_error_code := null;
    update private.outbox_jobs j
    set state = 'succeeded', lease_token = null, lease_until = null,
        last_error_code = null, terminal_at = clock_timestamp(), updated_at = clock_timestamp()
    where j.id = p_job_id;
  elsif v_status = 'permanent_failure' then
    v_outcome := 'permanent_failure';
    v_error_code := v_code;
    update private.outbox_jobs j
    set state = 'failed', lease_token = null, lease_until = null,
        last_error_code = v_code, terminal_at = clock_timestamp(), updated_at = clock_timestamp()
    where j.id = p_job_id;
  else
    v_outcome := 'unknown';
    v_error_code := v_code;
    update private.outbox_jobs j
    set state = 'unknown', lease_token = null, lease_until = null,
        last_error_code = v_code, terminal_at = clock_timestamp(), updated_at = clock_timestamp()
    where j.id = p_job_id;
  end if;

  update private.outbox_job_attempts a
  set outcome = v_outcome, error_code = v_error_code, retry_at = v_retry_at,
      finished_at = clock_timestamp()
  where a.workspace_id = v_job.workspace_id and a.outbox_job_id = v_job.id
    and a.lease_token = p_lease_token and a.finished_at is null;
  if not found then
    raise exception using errcode = '40001', message = 'Job attempt changed during completion';
  end if;
  return found;
end
$$;

create function private.extend_job_lease(p_job_id uuid, p_lease_token uuid, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if p_job_id is null or p_lease_token is null or p_seconds is null or p_seconds not between 1 and 300 then
    raise exception using errcode = '22023', message = 'Invalid lease extension';
  end if;
  update private.outbox_jobs j
  set lease_until = greatest(j.lease_until, clock_timestamp()) + make_interval(secs => p_seconds),
      updated_at = clock_timestamp()
  where j.id = p_job_id and j.state = 'running' and j.lease_token = p_lease_token
    and j.lease_until > clock_timestamp();
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;

grant create on schema private to ubmp_worker;
grant create on schema public to ubmp_worker;
alter function private.claim_due_jobs(integer) owner to ubmp_worker;
alter function private.dispatch_jobs(text,timestamptz,integer) owner to ubmp_worker;
alter function private.mark_job_effect_started(uuid,uuid) owner to ubmp_worker;
alter function private.finish_job(uuid,uuid,jsonb) owner to ubmp_worker;
alter function private.extend_job_lease(uuid,uuid,integer) owner to ubmp_worker;

create function public.dispatch_jobs(p_nonce text, p_signed_at timestamptz, p_limit integer)
returns jsonb language sql security definer set search_path = '' as $$
  select private.dispatch_jobs(p_nonce, p_signed_at, p_limit)
$$;
create function public.mark_job_effect_started(p_job_id uuid, p_lease_token uuid)
returns boolean language sql security definer set search_path = '' as $$
  select private.mark_job_effect_started(p_job_id, p_lease_token)
$$;
create function public.finish_job(p_job_id uuid, p_lease_token uuid, p_outcome jsonb)
returns boolean language sql security definer set search_path = '' as $$
  select private.finish_job(p_job_id, p_lease_token, p_outcome)
$$;
create function public.extend_job_lease(p_job_id uuid, p_lease_token uuid, p_seconds integer)
returns boolean language sql security definer set search_path = '' as $$
  select private.extend_job_lease(p_job_id, p_lease_token, p_seconds)
$$;

alter function public.dispatch_jobs(text,timestamptz,integer) owner to ubmp_worker;
alter function public.mark_job_effect_started(uuid,uuid) owner to ubmp_worker;
alter function public.finish_job(uuid,uuid,jsonb) owner to ubmp_worker;
alter function public.extend_job_lease(uuid,uuid,integer) owner to ubmp_worker;
revoke create on schema private from ubmp_worker;
revoke create on schema public from ubmp_worker;

revoke all on function private.claim_due_jobs(integer),
  private.dispatch_jobs(text,timestamptz,integer),
  private.mark_job_effect_started(uuid,uuid),
  private.finish_job(uuid,uuid,jsonb),
  private.extend_job_lease(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_due_jobs(integer),
  private.dispatch_jobs(text,timestamptz,integer),
  private.mark_job_effect_started(uuid,uuid),
  private.finish_job(uuid,uuid,jsonb),
  private.extend_job_lease(uuid,uuid,integer) to ubmp_worker;

revoke all on function public.dispatch_jobs(text,timestamptz,integer),
  public.mark_job_effect_started(uuid,uuid),
  public.finish_job(uuid,uuid,jsonb),
  public.extend_job_lease(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatch_jobs(text,timestamptz,integer),
  public.mark_job_effect_started(uuid,uuid),
  public.finish_job(uuid,uuid,jsonb),
  public.extend_job_lease(uuid,uuid,integer) to service_role;
