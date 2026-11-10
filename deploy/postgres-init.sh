#!/bin/sh
set -eu
# Safe to rerun to add a service database. Existing passwords/roles/data are preserved.
for service in identity workforce payroll workplace; do
 eval "db_password=\$${service}_DB_PASSWORD"
 eval "migration_password=\$${service}_MIGRATION_PASSWORD"
 case "$db_password$migration_password" in ''|*[!a-f0-9]*) echo 'Use generated hexadecimal database passwords' >&2; exit 1;; esac
 for suffix in owner app; do
  role="${service}_${suffix}"
  if [ "$(psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname='$role'")" != 1 ]; then
   if [ "$suffix" = owner ]; then role_password="$migration_password"; else role_password="$db_password"; fi
   psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres >/dev/null <<EOSQL
CREATE ROLE $role LOGIN PASSWORD '$role_password' NOSUPERUSER NOBYPASSRLS;
EOSQL
  fi
 done
 if [ "$(psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$service'")" != 1 ]; then
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $service OWNER ${service}_owner;" >/dev/null
 fi
 psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "REVOKE ALL ON DATABASE $service FROM PUBLIC; GRANT CONNECT ON DATABASE $service TO ${service}_app;" >/dev/null
 psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$service" -c "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${service}_app;" >/dev/null
done
