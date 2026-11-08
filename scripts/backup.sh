#!/bin/sh
# age recipient is a PUBLIC encryption key. Private recovery key stays off host.
set -eu
: "${AGE_RECIPIENT:?Set the off-site recovery public key}"
command -v age >/dev/null
umask 077
mkdir -p backups
backup_path="backups/hcmflow-$(date -u +%Y%m%dT%H%M%SZ).sql.age"
partial_path="${backup_path}.partial"
trap 'rm -f "$partial_path"' EXIT HUP INT TERM
# A temporary unencrypted dump is never written to disk. pipefail ensures pg_dump failures are caught.
bash -o pipefail -c 'docker compose exec -T postgres pg_dumpall -U postgres | age -r "$AGE_RECIPIENT" > "$1"' _ "$partial_path"
test -s "$partial_path"
mv "$partial_path" "$backup_path"
trap - EXIT HUP INT TERM
printf '%s\n' "Encrypted backup created: $backup_path. Copy to independent storage and verify restore."
