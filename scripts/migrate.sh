#!/bin/sh
set -eu
# Compose injects runtime configuration. Override DATABASE_URL only for explicit migration.
for service in identity workforce payroll; do
 docker compose -f compose.yaml -f compose.migrate.yaml run --rm --no-deps -e RUNTIME_ROLE="${service}_app" "$service" sh -c \
 'exec python -m hcm.cli migrate' \
 >/dev/null
done
