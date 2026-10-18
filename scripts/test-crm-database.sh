#!/usr/bin/env bash
set -euo pipefail
# Local-only runner for the CRM pgTAP suite. Never targets a cloud database.
cd "$(dirname "$0")/.."
db_container="${SUPABASE_DB_CONTAINER:-}"
if [[ -z "$db_container" ]]; then
  echo "Set SUPABASE_DB_CONTAINER to an isolated disposable Supabase database container." >&2
  exit 2
fi
test_output=$(mktemp)
trap 'rm -f "$test_output"' EXIT
docker exec -i "$db_container" psql -U postgres -d postgres -X -f - < tests/database/crm_records.sql > "$test_output" 2>&1 || { cat "$test_output"; exit 1; }
cat "$test_output"
if grep -Eq '(^|[[:space:]])not ok|Looks like you failed|Looks like you planned' "$test_output"; then exit 1; fi
