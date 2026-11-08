#!/usr/bin/env bash
# Synthetic CI only: restores a workforce dump into a disposable database, never into the source.
set -euo pipefail
trap 'docker compose exec -T postgres dropdb -U postgres --if-exists hcmflow_restore_drill >/dev/null' EXIT
original_count=$(docker compose exec -T postgres psql -U postgres -d workforce -Atc 'SELECT count(*) FROM employees')
docker compose exec -T postgres createdb -U postgres hcmflow_restore_drill
docker compose exec -T postgres pg_dump -U postgres --no-owner --no-acl workforce | docker compose exec -T postgres psql -U postgres -d hcmflow_restore_drill >/dev/null
restored_count=$(docker compose exec -T postgres psql -U postgres -d hcmflow_restore_drill -Atc 'SELECT count(*) FROM employees')
test "$original_count" = "$restored_count"
echo 'PASS: disposable workforce restore matches source row count; this is not an off-site recovery rehearsal.'
