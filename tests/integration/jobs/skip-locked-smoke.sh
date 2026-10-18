#!/usr/bin/env bash
set -euo pipefail

db_container=supabase_db_ubmp_core_foundation
job_id=61000000-0000-4000-8000-000000000001
dedupe_key=qa:jobs-core:skip-locked-smoke
nonce_while_locked=qa_skiplocked_dispatch_nonce_0001
nonce_after_release=qa_skiplocked_dispatch_nonce_0002
lock_output=$(mktemp)
lock_pid=''
job_created=0

cleanup() {
  if [[ -n "$lock_pid" ]]; then
    wait "$lock_pid" 2>/dev/null || true
  fi
  if [[ "$job_created" -eq 1 ]]; then
    docker exec -i "$db_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f - >/dev/null <<SQL
delete from private.outbox_job_attempts where outbox_job_id = '$job_id';
delete from private.outbox_jobs where id = '$job_id';
delete from private.worker_dispatch_receipts where nonce in ('$nonce_while_locked','$nonce_after_release');
SQL
  fi
  rm -f "$lock_output"
}
trap cleanup EXIT

workspace_count=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c 'select count(*) from public.workspaces')
due_count=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c "select count(*) from private.outbox_jobs where state='pending' and available_at <= clock_timestamp()")
existing_test_id=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c "select count(*) from private.outbox_jobs where id='$job_id'")
if [[ "$workspace_count" -lt 1 || "$due_count" -ne 0 || "$existing_test_id" -ne 0 ]]; then
  echo 'SKIP: local database needs one workspace and an empty due-job queue.'
  exit 77
fi

docker exec -i "$db_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f - >/dev/null <<SQL
insert into private.outbox_jobs(id,workspace_id,kind,dedupe_key,payload,available_at)
select '$job_id', w.id, 'domain.consume', '$dedupe_key', '{}'::jsonb, clock_timestamp()-interval '1 minute'
from public.workspaces w order by w.id limit 1;
SQL
job_created=1

docker exec -i "$db_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f - >"$lock_output" <<SQL &
begin;
select id from private.outbox_jobs where id='$job_id' for update;
select pg_sleep(4);
commit;
SQL
lock_pid=$!
sleep 0.25

started_at=$(date +%s%N)
while_locked=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c "select public.dispatch_jobs('$nonce_while_locked',clock_timestamp(),1)::text")
elapsed_ms=$((($(date +%s%N)-started_at)/1000000))
python3 -c 'import json,sys; result=json.loads(sys.argv[1]); assert result == {"accepted": True, "jobs": []}, result' "$while_locked"
if [[ "$elapsed_ms" -ge 2000 ]]; then
  echo "FAIL: dispatch waited $elapsed_ms ms for a locked row instead of skipping it."
  exit 1
fi

wait "$lock_pid"
lock_pid=''
after_release=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c "select public.dispatch_jobs('$nonce_after_release',clock_timestamp(),1)::text")
lease_token=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["jobs"][0]["leaseToken"])' "$after_release")
finished=$(docker exec "$db_container" psql -U postgres -d postgres -X -A -t -c "select public.finish_job('$job_id','$lease_token','{\"status\":\"confirmed\"}'::jsonb)")
if [[ "$finished" != 't' ]]; then
  echo 'FAIL: unlocked job could not be claimed and completed.'
  exit 1
fi
echo "PASS: locked row skipped in ${elapsed_ms} ms; job claimed after unlock."
