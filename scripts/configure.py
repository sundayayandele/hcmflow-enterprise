"""Create local staging secrets; never print values or overwrite existing configuration."""

import base64
import os
from pathlib import Path
import secrets
import sys

path = Path(".env")
if path.exists() and "--extend" in sys.argv:
    existing = path.read_text()
    additions = []
    for key in ("WORKPLACE_DB_PASSWORD", "WORKPLACE_MIGRATION_PASSWORD"):
        if not any(line.startswith(key + "=") for line in existing.splitlines()):
            additions.append(key + "=" + secrets.token_hex(32))
    if additions:
        with path.open("a") as f:
            f.write("\n" + "\n".join(additions) + "\n")
    path.chmod(0o600)
    print("Added only missing workplace secrets; existing values preserved.")
    raise SystemExit(0)
if path.exists():
    raise SystemExit(".env already exists; refusing to replace secrets")
values = {
    key: secrets.token_hex(32)
    for key in [
        "POSTGRES_PASSWORD",
        "JWT_SECRET",
        "IDENTITY_DB_PASSWORD",
        "WORKFORCE_DB_PASSWORD",
        "PAYROLL_DB_PASSWORD",
        "WORKPLACE_DB_PASSWORD",
        "IDENTITY_MIGRATION_PASSWORD",
        "WORKFORCE_MIGRATION_PASSWORD",
        "PAYROLL_MIGRATION_PASSWORD",
        "WORKPLACE_MIGRATION_PASSWORD",
    ]
}
values["PII_KEY"] = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    for k, v in values.items():
        f.write(f"{k}={v}\n")
print("Created .env with file mode 0600. Store an encrypted recovery copy separately.")
