#!/usr/bin/env bash
set -euo pipefail
if [[ ! -f docker-compose.yml || ! -f database/security/02-roles.sql.in ]]; then
  echo 'Run this script from the Database-Project-CO-560 repository root.' >&2
  exit 1
fi
mkdir -p database/init scripts
cat > database/Dockerfile <<'EOF'
FROM quay.io/mariadb-foundation/mariadb-devel:13.1

RUN useradd --system --no-create-home --shell /usr/sbin/nologin project_socket
EOF
cat > database/init/03-unix-socket.sql <<'EOF'
CREATE USER 'project_socket'@'localhost' IDENTIFIED VIA unix_socket;
GRANT role_readonly TO 'project_socket'@'localhost';
SET DEFAULT ROLE role_readonly FOR 'project_socket'@'localhost';
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('docker-compose.yml')
s = p.read_text()
needle = '  db:\n    image: quay.io/mariadb-foundation/mariadb-devel:13.1\n'
replacement = '  db:\n    build:\n      context: .\n      dockerfile: database/Dockerfile\n'
if needle in s:
    s = s.replace(needle, replacement, 1)
    p.write_text(s)
assert replacement in s, 'Unexpected Compose db image declaration; review manually.'
PY
cat > scripts/test-unix-socket-local.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_ENV="$(mktemp)"
TEST_PROJECT="co560-socket-$(date +%s)-$$"
COMPOSE=(docker compose -p "$TEST_PROJECT" --env-file "$TEST_ENV")
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEST_ENV"
}
trap cleanup EXIT
cat > "$TEST_ENV" <<'ENV'
MARIADB_ROOT_PASSWORD=local-test-root-password
MARIADB_DATABASE=auth_project
ADMIN_DB_PASSWORD=local-test-admin-password
EMPLOYEE_DB_PASSWORD=local-test-employee-password
READONLY_DB_PASSWORD=local-test-readonly-password
AUDITOR_DB_PASSWORD=local-test-auditor-password
REGISTRATION_DB_PASSWORD=local-test-registration-password
DB_PUBLISHED_PORT=0
API_PUBLISHED_PORT=0
ENV
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180

socket_query() {
  "${COMPOSE[@]}" exec -T -u project_socket db \
    mariadb --no-defaults --protocol=socket --user=project_socket \
    --skip-password auth_project --batch --skip-column-names -e "$1"
}
reject() {
  local description="$1" expected="$2" output
  shift 2
  if output="$("$@" 2>&1)"; then
    printf 'FAIL (unexpectedly allowed): %s\n' "$description" >&2
    exit 1
  fi
  if ! grep -Eq "ERROR (${expected}) " <<<"$output"; then
    printf 'FAIL (unexpected failure for %s): %s\n' "$description" "$output" >&2
    exit 1
  fi
  printf 'PASS (MariaDB rejected): %s\n' "$description"
}

identity="$(socket_query 'SELECT CURRENT_USER();')"
[[ "$identity" == 'project_socket@localhost' ]] || {
  echo "FAIL socket identity: $identity" >&2; exit 1;
}
role="$(socket_query 'SELECT CURRENT_ROLE();')"
[[ "$role" == 'role_readonly' ]] || {
  echo "FAIL default role: $role" >&2; exit 1;
}
rows="$(socket_query 'SELECT COUNT(*) FROM user_directory;')"
[[ "$rows" =~ ^[0-9]+$ ]] || { echo 'FAIL allowed directory SELECT' >&2; exit 1; }
echo 'PASS: passwordless Unix-socket login and read-only role, directory SELECT'

reject 'socket account cannot update rows' '1142|1143' socket_query \
  "UPDATE app_users SET username='blocked' WHERE id=1;"
reject 'socket account cannot access password hashes' '1142|1143' socket_query \
  'SELECT password_hash FROM app_users;'
reject 'socket account cannot read audit data' '1142|1143' socket_query \
  'SELECT * FROM login_audit;'
reject 'socket account cannot elevate role' 1959 socket_query \
  'SET ROLE role_admin;'

reject 'mismatched OS identity' '1045|1698' \
  "${COMPOSE[@]}" exec -T -u nobody db \
    mariadb --no-defaults --protocol=socket --user=project_socket \
    --skip-password auth_project -e 'SELECT 1;'

reject 'TCP passwordless login' '1045|1698' \
  "${COMPOSE[@]}" exec -T -u project_socket db \
    mariadb --no-defaults --protocol=tcp --host=127.0.0.1 \
    --user=project_socket --skip-password auth_project -e 'SELECT 1;'

echo 'All Unix-socket authentication tests passed.'
EOF
chmod +x scripts/test-unix-socket-local.sh
python3 - <<'PYREADME'
from pathlib import Path
p = Path('README.md')
if p.exists():
    text = p.read_text()
    old = '- **Not implemented / not evidenced:** **verified MariaDB TLS** (the application connection does not configure TLS) and **ED25519, PARSEC, or Unix-socket authentication in place of ordinary password credentials**.'
    new = '- **Not implemented / not evidenced:** **verified MariaDB TLS** (the application connection does not configure TLS). The existing API still uses password-based database connections; the separately provisioned `project_socket@localhost` account demonstrates Unix-socket authentication.'
    text = text.replace(old, new)
    text = text.replace('| An alternative, passwordless authentication method |', '| Passwordless socket access from the remote HTTP API |')
    heading = '## 9. Repository map'
    section = "### Alternative MariaDB Unix socket authentication\n\nSee [UNIX_SOCKET_AUTH.md](UNIX_SOCKET_AUTH.md) and run `bash scripts/test-unix-socket-local.sh`. This demonstrates passwordless local OS authentication with read-only privileges; the remote API remains password-based.\n\n"
    if heading in text and '### Alternative MariaDB Unix socket authentication' not in text and '### Alternative authentication: MariaDB Unix socket' not in text:
        text = text.replace(heading, section + heading, 1)
    p.write_text(text)
PYREADME
cat > UNIX_SOCKET_AUTH.md <<'EOF'
# Unix-socket authentication (Area 5)

This is an **alternative MariaDB login method** for a dedicated local OS identity, separate from the HTTP Basic / MariaDB password logins used by the existing Express API.

`database/Dockerfile` adds the Linux user `project_socket` to the MariaDB container. On fresh-volume initialization, `database/init/03-unix-socket.sql` creates the matching database account `project_socket@localhost` with MariaDB's `unix_socket` plugin, grants the existing `role_readonly`, and makes it the default role. MariaDB reads the operating system peer identity from the Unix socket. No MariaDB password is stored for this account.

## Test (requires Docker with Compose v2)

```bash
bash scripts/test-unix-socket-local.sh
```

The integration test uses a uniquely named, disposable Compose project, verifies passwordless socket login, `CURRENT_USER()` and `CURRENT_ROLE()`, an authorized directory read, unauthorized writes and private reads, forbidden role escalation, an OS-user mismatch, and attempted TCP authentication. Every negative test asserts the **specific MariaDB error code**; a broken connection does not count as an authorization success. Its database volume is deleted at the end. Do **not** use `docker compose down -v` against your existing project.

To inspect interactively in your regular Compose project *after starting with a fresh database volume*:

```bash
docker compose exec -u project_socket db \
  mariadb --no-defaults --protocol=socket -u project_socket --skip-password auth_project
```

If you already have a database volume, the bootstrap SQL **will not run again**. Apply `database/init/03-unix-socket.sql` as an administrator to that existing database after adding the OS user via the updated Docker image, then recreate the database container. Do not delete your populated volume.

## Security boundary

The socket grants only the read-only database role; no SQL superuser authority or host-wide access is granted. Unix-socket authentication works only **inside the DB container**, where the matching OS user exists and can open the socket. It does not turn HTTP Basic into passwordless login or work across the API container's TCP connection. A process that can run as `project_socket` in the DB container can authenticate as that MariaDB account; restrict container and Docker-daemon access. This feature does not provide TCP encryption/TLS.
EOF
printf '\nUnix-socket authentication implementation added. Run: bash scripts/test-unix-socket-local.sh\n'
