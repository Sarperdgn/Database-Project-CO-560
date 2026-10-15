#!/usr/bin/env bash
# Isolated live MariaDB 13.1 security audit demo for Vedant's project section.
# Requires Docker Engine + Compose v2, Bash, Python 3. Never touches the usual DB.
set -euo pipefail

cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Missing executable: docker" >&2; exit 1; }
PYTHON_BIN=python3
if ! command -v "$PYTHON_BIN" >/dev/null; then
  PYTHON_BIN=python
fi
command -v "$PYTHON_BIN" >/dev/null || {
  echo "Missing Python 3: install Python 3 and reopen this terminal" >&2
  exit 1
}
"$PYTHON_BIN" -c 'import sys; assert sys.version_info.major == 3, "Python 3 required"'
docker compose version >/dev/null

TEST_ENV="$(mktemp)"
chmod 600 "$TEST_ENV"
TEST_PROJECT="co560-vedant-$(date +%s)-$$"
COMPOSE=(docker compose -p "$TEST_PROJECT" --env-file "$TEST_ENV" -f docker-compose.yml -f docker-compose.audit.yml)
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEST_ENV"
}
trap cleanup EXIT

# These are disposable testing credentials, not production secrets.
cat > "$TEST_ENV" <<'ENV'
MARIADB_ROOT_PASSWORD=vedant-temporary-test-root
MARIADB_DATABASE=auth_project
ADMIN_DB_PASSWORD=vedant-temporary-test-admin
EMPLOYEE_DB_PASSWORD=vedant-temporary-test-employee
READONLY_DB_PASSWORD=vedant-temporary-test-reader
AUDITOR_DB_PASSWORD=vedant-temporary-test-auditor
REGISTRATION_DB_PASSWORD=vedant-temporary-test-registrar
DB_PUBLISHED_PORT=0
API_PUBLISHED_PORT=0
ENV

# No API is required for the DB-level audit assertions.
echo "Starting isolated project $TEST_PROJECT (temporary volume destroyed on exit)"
"${COMPOSE[@]}" up -d --wait --wait-timeout 240 db

sql() {
  local account="$1" password="$2" statement="$3"
  "${COMPOSE[@]}" exec -T -e "MYSQL_PWD=$password" db \
    mariadb --protocol=tcp -h127.0.0.1 -u"$account" auth_project -Nse "$statement"
}
root_sql() {
  "${COMPOSE[@]}" exec -T -e MYSQL_PWD=vedant-temporary-test-root db \
    mariadb --protocol=socket -uroot auth_project -Nse "$1"
}
reader() { sql project_reader vedant-temporary-test-reader "$1"; }
employee() { sql project_employee vedant-temporary-test-employee "$1"; }
auditor() { sql project_auditor vedant-temporary-test-auditor "$1"; }

expect_ok() {
  local title="$1"
  shift
  if ! "$@" >/dev/null; then echo "FAIL: $title" >&2; exit 1; fi
  echo "PASS allowed: $title"
}
expect_error() {
  local title="$1" codes="$2" result
  shift 2
  if result="$("$@" 2>&1)"; then
    echo "FAIL unexpectedly allowed: $title" >&2; exit 1
  fi
  if ! grep -Eq "(^|[[:space:]])ERROR[[:space:]]+(${codes})[[:space:]]+\\(" <<< "$result"; then
    echo "FAIL wrong error for $title: $result" >&2; exit 1
  fi
  echo "PASS blocked by MariaDB: $title (error $codes)"
}

version="$(root_sql 'SELECT VERSION();')"
[[ "$version" == 13.1.* ]] || { echo "FAIL: MariaDB 13.1 required; found $version" >&2; exit 1; }
[[ "$(root_sql "SELECT PLUGIN_STATUS FROM information_schema.PLUGINS WHERE PLUGIN_NAME='SERVER_AUDIT';")" == "ACTIVE" ]] || {
  echo "FAIL: SERVER_AUDIT plugin is not ACTIVE (verify plugin installed in image)" >&2; exit 1;
}
[[ "$(root_sql 'SELECT @@GLOBAL.server_audit_logging;')" == 1 ]] || {
  echo 'FAIL: auditing is disabled' >&2; exit 1;
}
[[ "$(root_sql 'SELECT @@GLOBAL.server_audit_events;')" == *CONNECT* ]] || {
  echo 'FAIL: CONNECT events not audited' >&2; exit 1;
}
[[ "$(root_sql 'SELECT @@GLOBAL.server_audit_events;')" == *QUERY* ]] || {
  echo 'FAIL: QUERY events not audited' >&2; exit 1;
}
echo "PASS MariaDB $version, server_audit ACTIVE, logging=ON"

expect_ok 'reader public view' reader 'SELECT * FROM user_directory;'
expect_error 'reader bad password' 1045 sql project_reader incorrect-password 'SELECT 1;'
expect_error 'reader secret table access' 1142 reader 'SELECT password_hash FROM app_users;'
expect_error 'reader unwanted write' '1142|1143' reader "UPDATE app_users SET username='nope' WHERE id=1;"
expect_error 'reader role escalation' 1959 reader 'SET ROLE role_admin;'
expect_ok 'employee allowed public read' employee 'SELECT * FROM user_directory;'

root_sql 'REVOKE SELECT ON auth_project.user_directory FROM role_readonly;'
expect_error 'revoked reader privilege' '1044|1142' reader "SELECT 'vedant_revoked' FROM user_directory;"
root_sql 'GRANT SELECT ON auth_project.user_directory TO role_readonly;'
expect_ok 'reader privilege restored' reader 'SELECT * FROM user_directory;'

root_sql "ALTER USER 'project_employee'@'%' ACCOUNT LOCK;"
expect_error 'disabled employee login' 4151 employee 'SELECT 1;'
root_sql "ALTER USER 'project_employee'@'%' ACCOUNT UNLOCK;"
expect_ok 'employee account unlocked' employee 'SELECT 1;'

# The policy initially DENYs auditor UPDATE, DELETE; demonstrate precedence.
root_sql 'GRANT UPDATE ON auth_project.login_audit TO role_auditor;'
expect_error 'DENY overrides added UPDATE grant' 1142 auditor \
  "UPDATE login_audit SET reason='vedant_deny' WHERE id=999999999;"
root_sql 'REVOKE DENY UPDATE ON auth_project.login_audit FROM role_auditor;'
expect_ok 'REVOKE DENY exposes granted UPDATE' auditor \
  "UPDATE login_audit SET reason='vedant_restored' WHERE id=999999999;"
root_sql 'DENY UPDATE ON auth_project.login_audit TO role_auditor;'
root_sql 'REVOKE UPDATE ON auth_project.login_audit FROM role_auditor;'
expect_error 'DENY policy restored' 1142 auditor \
  "UPDATE login_audit SET reason='blocked' WHERE id=999999999;"

# Test evidence is read only (not saved to or committed in Git).
# Query log file is intentionally restricted to the isolated database container.
"${COMPOSE[@]}" exec -T db cat /var/lib/mysql/vedant-server-audit.log | \
  "$PYTHON_BIN" scripts/verify-audit-log.py

echo 'PASS: Vedant security audit test suite passed in disposable Compose stack.'
