#!/usr/bin/env bash
# Synthetic staging/CI only. Restore into separately named disposable databases.
set -euo pipefail
created=false
restore_database=''
cleanup() {
 if [ "$created" = true ]; then docker compose exec -T postgres dropdb -U postgres --if-exists "$restore_database" >/dev/null; fi
}
trap cleanup EXIT
for source_database in identity workforce payroll workplace; do
 case "$source_database" in
  identity) record_table=users ;;
  workforce) record_table=employees ;;
  payroll) record_table=runs ;;
  workplace) record_table=work_items ;;
 esac
 restore_database="hcmflow_restore_drill_${source_database}"
 original_count=$(docker compose exec -T postgres psql -U postgres -d "$source_database" -Atc "SELECT count(*) FROM $record_table")
 original_digest=$(docker compose exec -T postgres psql -U postgres -d "$source_database" -Atc "SELECT md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY id),'')) FROM $record_table t")
 docker compose exec -T postgres createdb -U postgres "$restore_database"
 created=true
 docker compose exec -T postgres pg_dump -U postgres --no-owner --no-acl "$source_database" | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$restore_database" >/dev/null
 restored_count=$(docker compose exec -T postgres psql -U postgres -d "$restore_database" -Atc "SELECT count(*) FROM $record_table")
 restored_digest=$(docker compose exec -T postgres psql -U postgres -d "$restore_database" -Atc "SELECT md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY id),'')) FROM $record_table t")
 test "$original_count" = "$restored_count"
 test "$original_digest" = "$restored_digest"
 docker compose exec -T postgres dropdb -U postgres "$restore_database"
 created=false
 printf 'PASS: %s disposable logical restore matches record count and data fingerprint\n' "$source_database"
done
echo 'This verifies logical restore, not off-site disaster recovery, key escrow or an RPO/RTO commitment.'
