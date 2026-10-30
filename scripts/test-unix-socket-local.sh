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
