#!/bin/sh
set -eu
# Values are generated hex secrets; never print them. Separate migration and runtime roles.
for service in identity workforce payroll; do
 eval "db_password=\$${service}_DB_PASSWORD"
 eval "migration_password=\$${service}_MIGRATION_PASSWORD"
 case "$db_password$migration_password" in *[!a-f0-9]*) echo 'Use generated hexadecimal database passwords' >&2; exit 1;; esac
 psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE ${service}_owner LOGIN PASSWORD '$migration_password' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE ${service}_app LOGIN PASSWORD '$db_password' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE $service OWNER ${service}_owner;
REVOKE ALL ON DATABASE $service FROM PUBLIC;
GRANT CONNECT ON DATABASE $service TO ${service}_app;
EOSQL
 psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$service" -c "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${service}_app;"
done
