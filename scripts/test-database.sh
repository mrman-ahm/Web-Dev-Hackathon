#!/usr/bin/env bash
set -euo pipefail
# Local-only runner: never accepts cloud URLs or prints CLI status credentials.
cd "$(dirname "$0")/.."
test_output=$(mktemp)
trap 'rm -f "$test_output"' EXIT
docker exec -i supabase_db_ubmp_core_foundation psql -U postgres -d postgres -X -f - < tests/database/core.sql > "$test_output" 2>&1 || { cat "$test_output"; exit 1; }
cat "$test_output"
if grep -Eq '(^|[[:space:]])not ok|Looks like you failed|Looks like you planned' "$test_output"; then exit 1; fi
