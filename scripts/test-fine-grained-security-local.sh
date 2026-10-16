#!/usr/bin/env bash
# Isolated MariaDB 13.1 fine-grained access control & database security test suite
# for Omer Faruk's project section.
# Tests restricted views, column-level vs object-level privileges, SQL SECURITY
# DEFINER vs INVOKER behavior, and MariaDB 13.1 column-level DENY precedence.
set -euo pipefail

cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Missing executable: docker" >&2; exit 1; }
docker compose version >/dev/null

TEST_ENV="$(mktemp)"
chmod 600 "$TEST_ENV"
TEST_PROJECT="co560-omer-$(date +%s)-$$"
COMPOSE=(docker compose -p "$TEST_PROJECT" --env-file "$TEST_ENV" -f docker-compose.yml)
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEST_ENV"
}
trap cleanup EXIT

cat > "$TEST_ENV" <<'ENV'
MARIADB_ROOT_PASSWORD=omer-temporary-test-root
MARIADB_DATABASE=auth_project
ADMIN_DB_PASSWORD=omer-temporary-test-admin
EMPLOYEE_DB_PASSWORD=omer-temporary-test-employee
READONLY_DB_PASSWORD=omer-temporary-test-reader
AUDITOR_DB_PASSWORD=omer-temporary-test-auditor
REGISTRATION_DB_PASSWORD=omer-temporary-test-registrar
DB_PUBLISHED_PORT=0
API_PUBLISHED_PORT=0
ENV

echo "Starting isolated MariaDB 13.1 stack $TEST_PROJECT (disposable volume)..."
"${COMPOSE[@]}" up -d --wait --wait-timeout 240 db

sql() {
  local account="$1" password="$2" statement="$3"
  "${COMPOSE[@]}" exec -T -e "MYSQL_PWD=$password" db \
    mariadb --protocol=tcp -h127.0.0.1 -u"$account" auth_project -Nse "$statement"
}
root_sql() {
  "${COMPOSE[@]}" exec -T -e MYSQL_PWD=omer-temporary-test-root db \
    mariadb --protocol=socket -uroot auth_project -Nse "$1"
}
reader() { sql project_reader omer-temporary-test-reader "$1"; }
employee() { sql project_employee omer-temporary-test-employee "$1"; }
auditor() { sql project_auditor omer-temporary-test-auditor "$1"; }
admin() { sql project_admin omer-temporary-test-admin "$1"; }

expect_ok() {
  local title="$1"
  shift
  if ! "$@" >/dev/null; then
    echo "FAIL: $title" >&2
    exit 1
  fi
  echo "PASS allowed: $title"
}

expect_error() {
  local title="$1" codes="$2" result
  shift 2
  if result="$("$@" 2>&1)"; then
    echo "FAIL unexpectedly allowed: $title" >&2
    exit 1
  fi
  if ! grep -Eq "(^|[[:space:]])ERROR[[:space:]]+(${codes})[[:space:]]+\\(" <<< "$result"; then
    echo "FAIL wrong error for $title: $result" >&2
    exit 1
  fi
  echo "PASS denied by MariaDB: $title (error $codes)"
}

# 1. Verify MariaDB 13.1 runtime and security session configuration
version="$(root_sql 'SELECT VERSION();')"
[[ "$version" == 13.1.* ]] || { echo "FAIL: MariaDB 13.1 required; found $version" >&2; exit 1; }
echo "PASS MariaDB version verified: $version"

# 2. Verify restricted view metadata (exposes only id, email, username; hides sensitive columns)
view_cols="$(root_sql "SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='auth_project' AND TABLE_NAME='user_directory';")"
[[ "$view_cols" == "id,email,username" ]] || {
  echo "FAIL: user_directory view columns expected 'id,email,username', got '$view_cols'" >&2
  exit 1
}
view_security="$(root_sql "SELECT SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA='auth_project' AND TABLE_NAME='user_directory';")"
[[ "$view_security" == "DEFINER" ]] || {
  echo "FAIL: user_directory expected SECURITY_TYPE=DEFINER, got '$view_security'" >&2
  exit 1
}
echo "PASS restricted view schema: user_directory exposes only ($view_cols) with SQL SECURITY $view_security"

# 3. Object-level access restrictions (role_readonly / project_reader)
expect_ok 'reader SELECT on restricted view user_directory' \
  reader 'SELECT id, email, username FROM user_directory WHERE id = 1;'
expect_error 'reader direct SELECT on base table app_users' 1142 \
  reader 'SELECT id, username FROM app_users WHERE id = 1;'
expect_error 'reader direct SELECT of password_hash on app_users' 1142 \
  reader 'SELECT password_hash FROM app_users WHERE id = 1;'
expect_error 'reader direct SELECT of token_version on app_users' 1142 \
  reader 'SELECT token_version FROM app_users WHERE id = 1;'
expect_error 'reader direct SELECT on login_audit' 1142 \
  reader 'SELECT * FROM login_audit;'

# 4. Column-level access restrictions (role_employee / project_employee)
expect_ok 'employee column-level SELECT (id) on app_users' \
  employee 'SELECT id FROM app_users WHERE id = 1;'
expect_ok 'employee column-level UPDATE (username) on app_users' \
  employee "START TRANSACTION; UPDATE app_users SET username = 'fg_allowed_name' WHERE id = 1; ROLLBACK;"
expect_error 'employee unauthorized column SELECT (password_hash)' 1143 \
  employee 'SELECT password_hash FROM app_users WHERE id = 1;'
expect_error 'employee unauthorized column SELECT (email) from base table' 1143 \
  employee 'SELECT email FROM app_users WHERE id = 1;'
expect_error 'employee unauthorized column SELECT (failed_login_attempts)' 1143 \
  employee 'SELECT failed_login_attempts FROM app_users WHERE id = 1;'
expect_error 'employee unauthorized column SELECT (locked_until)' 1143 \
  employee 'SELECT locked_until FROM app_users WHERE id = 1;'
expect_error 'employee unauthorized column UPDATE (password_hash)' 1143 \
  employee "UPDATE app_users SET password_hash = 'tampered' WHERE id = 1;"
expect_error 'employee unauthorized column UPDATE (is_active)' 1143 \
  employee 'UPDATE app_users SET is_active = 0 WHERE id = 1;'
expect_error 'employee unauthorized column UPDATE (token_version)' 1143 \
  employee 'UPDATE app_users SET token_version = 99 WHERE id = 1;'

# 5. Demonstrate SQL SECURITY DEFINER vs SQL SECURITY INVOKER behavior
root_sql 'CREATE SQL SECURITY INVOKER VIEW auth_project.user_directory_invoker_probe AS SELECT id, username FROM auth_project.app_users;'
root_sql 'GRANT SELECT ON auth_project.user_directory_invoker_probe TO role_readonly;'
expect_error 'SQL SECURITY INVOKER view fails when caller lacks base-table privilege' 1356 \
  reader 'SELECT * FROM user_directory_invoker_probe;'
root_sql 'DROP VIEW auth_project.user_directory_invoker_probe;'

# 6. MariaDB 13.1 column-level DENY precedence on base table and view
root_sql 'DENY UPDATE (username) ON auth_project.app_users TO role_employee;'
expect_error 'MariaDB 13.1 column-level DENY UPDATE (username) overrides GRANT' 1143 \
  employee "UPDATE app_users SET username = 'denied_by_13_1' WHERE id = 1;"
root_sql 'REVOKE DENY UPDATE (username) ON auth_project.app_users FROM role_employee;'
expect_ok 'REVOKE DENY restores employee UPDATE (username)' \
  employee "START TRANSACTION; UPDATE app_users SET username = 'restored_after_deny' WHERE id = 1; ROLLBACK;"

root_sql 'DENY SELECT (email) ON auth_project.user_directory TO role_readonly;'
expect_ok 'reader SELECT non-denied columns (id, username) from user_directory' \
  reader 'SELECT id, username FROM user_directory WHERE id = 1;'
expect_error 'MariaDB 13.1 column-level DENY SELECT (email) on view' 1143 \
  reader 'SELECT email FROM user_directory WHERE id = 1;'
root_sql 'REVOKE DENY SELECT (email) ON auth_project.user_directory FROM role_readonly;'
expect_ok 'REVOKE DENY restores reader SELECT (email) on view' \
  reader 'SELECT id, email, username FROM user_directory WHERE id = 1;'

# 7. Compare privilege levels across all 4 project accounts
expect_ok 'admin full base-table access including sensitive columns' \
  admin 'SELECT id, email, username, password_hash, token_version FROM app_users WHERE id = 1;'
expect_ok 'auditor read access to login_audit' \
  auditor 'SELECT * FROM login_audit;'
expect_error 'auditor blocked from user_directory view' 1142 \
  auditor 'SELECT * FROM user_directory;'
expect_error 'auditor blocked by 13.1 DENY from updating login_audit' 1142 \
  auditor "UPDATE login_audit SET reason = 'tampered' WHERE id = 1;"

echo "PASS: All fine-grained access control and MariaDB 13.1 security tests passed."
