#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# A unique Compose project owns its containers and volume; existing data is untouched.
TEST_ENV="$(mktemp)"
TEST_PROJECT="co560-rbac-$(date +%s)-$$"
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
DB_PUBLISHED_PORT=0
API_PUBLISHED_PORT=0
ENV
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180
sql() {
  local account="$1" password="$2" query="$3"
  "${COMPOSE[@]}" exec -T -e MYSQL_PWD="$password" db \
    mariadb --protocol=tcp -h127.0.0.1 -u"$account" auth_project -Nse "$query"
}
admin() { sql project_admin local-test-admin-password "$1"; }
employee() { sql project_employee local-test-employee-password "$1"; }
reader() { sql project_reader local-test-readonly-password "$1"; }
auditor() { sql project_auditor local-test-auditor-password "$1"; }
root_sql() {
  "${COMPOSE[@]}" exec -T -e MYSQL_PWD=local-test-root-password db \
    mariadb --protocol=socket -uroot auth_project -Nse "$1"
}
allow() { local label="$1"; shift; "$@" >/dev/null; echo "PASS allowed: $label"; }
deny() {
  local label="$1" code="$2" result
  shift 2
  if result="$("$@" 2>&1)"; then
    echo "FAIL unexpectedly allowed: $label" >&2; exit 1
  fi
  # A syntax error or unavailable server is not proof of access control.
  if ! [[ "$result" =~ ERROR\ ($code)\  ]]; then
    echo "FAIL wrong error for $label: $result" >&2; exit 1
  fi
  echo "PASS denied by MariaDB: $label"
}
for kind in admin employee readonly auditor; do
  case "$kind" in readonly) actor=reader;; *) actor="$kind";; esac
  actual="$("$actor" 'SELECT CURRENT_ROLE();')"
  [[ "$actual" == "role_$kind" ]] || { echo "Wrong default role: $actual"; exit 1; }
done
allow 'admin table DDL' admin 'CREATE TABLE rbac_probe (id INT); DROP TABLE rbac_probe;'
allow 'employee public view' employee 'SELECT * FROM user_directory;'
allow 'employee username update' employee "START TRANSACTION; UPDATE app_users SET username='updated' WHERE id=1; ROLLBACK;"
allow 'reader public view' reader 'SELECT * FROM user_directory;'
allow 'auditor audit read' auditor 'SELECT * FROM login_audit;'
deny 'reader update' '1142|1143' reader "UPDATE app_users SET username='bad' WHERE id=1;"
deny 'reader password hashes' 1142 reader 'SELECT password_hash FROM app_users;'
deny 'reader audit data' 1142 reader 'SELECT * FROM login_audit;'
deny 'employee password hashes' 1143 employee 'SELECT password_hash FROM app_users;'
deny 'employee password modification' 1143 employee "UPDATE app_users SET password_hash='bad' WHERE id=1;"
deny 'employee delete' 1142 employee 'DELETE FROM app_users WHERE id=1;'
deny 'auditor audit modification' 1142 auditor "UPDATE login_audit SET reason='bad';"
deny 'auditor directory' 1142 auditor 'SELECT * FROM user_directory;'
deny 'reader DDL' 1142 reader 'DROP TABLE app_users;'
deny 'reader global account creation' 1227 reader "CREATE USER 'rbac_unauthorized'@'%';"
deny 'reader role escalation' 1959 reader 'SET ROLE role_admin;'
deny 'no direct privileges after disabling role' 1142 reader 'SET ROLE NONE; SELECT * FROM user_directory;'
deny 'wrong password' 1045 sql project_reader incorrect 'SELECT 1;'
# Revocation also works without the API or any TypeScript policy change.
root_sql "REVOKE SELECT ON auth_project.user_directory FROM role_readonly;"
deny 'revoked reader grant' 1142 reader 'SELECT * FROM user_directory;'
root_sql 'GRANT SELECT ON auth_project.user_directory TO role_readonly;'
allow 'restored reader grant' reader 'SELECT * FROM user_directory;'
"${COMPOSE[@]}" exec -T api node --input-type=module < scripts/test-api.mjs
echo 'All database and API RBAC tests passed.'
