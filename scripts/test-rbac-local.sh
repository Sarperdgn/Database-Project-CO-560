#!/usr/bin/env bash
set -euo pipefail

echo "=== MariaDB RBAC local test ==="

TEST_ENV="$(mktemp)"

cleanup() {
  echo
  echo "Cleaning test environment..."
  docker compose --env-file "$TEST_ENV" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEST_ENV"
}

trap cleanup EXIT

cat > "$TEST_ENV" <<'EOF'
MARIADB_ROOT_PASSWORD=local-test-root-password
MARIADB_DATABASE=auth_project

ADMIN_DB_USER=project_admin
ADMIN_DB_PASSWORD=local-test-admin-password

AUTH_DB_USER=auth_service
AUTH_DB_PASSWORD=local-test-auth-password

READONLY_DB_USER=project_reader
READONLY_DB_PASSWORD=local-test-readonly-password

JWT_SECRET=local-test-jwt-secret
EOF

COMPOSE=(docker compose --env-file "$TEST_ENV")

ROOT_PASSWORD="local-test-root-password"
DATABASE="auth_project"

ADMIN_USER="project_admin"
ADMIN_PASSWORD="local-test-admin-password"

AUTH_USER="auth_service"
AUTH_PASSWORD="local-test-auth-password"

READONLY_USER="project_reader"
READONLY_PASSWORD="local-test-readonly-password"


echo
echo "1. Starting fresh MariaDB..."

"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d db


echo
echo "2. Waiting for MariaDB health check..."

for i in $(seq 1 60); do
  STATUS="$(docker inspect \
    --format='{{.State.Health.Status}}' \
    db-auth-mariadb 2>/dev/null || true)"

  if [[ "$STATUS" == "healthy" ]]; then
    echo "MariaDB is healthy."
    break
  fi

  if [[ "$STATUS" == "unhealthy" ]]; then
    echo "MariaDB became unhealthy."
    "${COMPOSE[@]}" logs db
    exit 1
  fi

  sleep 2
done

STATUS="$(docker inspect \
  --format='{{.State.Health.Status}}' \
  db-auth-mariadb 2>/dev/null || true)"

if [[ "$STATUS" != "healthy" ]]; then
  echo "MariaDB did not become healthy in time."
  "${COMPOSE[@]}" logs db
  exit 1
fi


root_sql() {
  "${COMPOSE[@]}" exec -T db \
    mariadb \
    -uroot \
    -p"$ROOT_PASSWORD" \
    "$DATABASE" \
    -Nse "$1"
}


user_sql() {
  local user="$1"
  local password="$2"
  local sql="$3"

  "${COMPOSE[@]}" exec -T db \
    mariadb \
    -u"$user" \
    -p"$password" \
    "$DATABASE" \
    -Nse "$sql"
}


expect_role() {
  local user="$1"
  local password="$2"
  local expected_role="$3"

  local actual_role

  actual_role="$(user_sql \
    "$user" \
    "$password" \
    "SELECT CURRENT_ROLE();")"

  if [[ "$actual_role" != "$expected_role" ]]; then
    echo "FAIL: $user expected role $expected_role but got $actual_role"
    exit 1
  fi

  echo "PASS: $user -> $expected_role"
}


expect_allowed() {
  local description="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    echo "PASS: $description -> allowed"
  else
    echo "FAIL: $description should be allowed"
    exit 1
  fi
}


expect_denied() {
  local description="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    echo "FAIL: $description should be denied"
    exit 1
  else
    echo "PASS: $description -> denied"
  fi
}


echo
echo "3. Checking MariaDB users and roles..."

USER_COUNT="$(root_sql "
SELECT COUNT(*)
FROM mysql.user
WHERE User IN (
  'project_admin',
  'auth_service',
  'project_reader',
  'role_admin',
  'role_auth_service',
  'role_readonly'
);
")"

if [[ "$USER_COUNT" != "6" ]]; then
  echo "FAIL: Expected 6 users/roles, found $USER_COUNT"
  exit 1
fi

echo "PASS: all expected users and roles exist"


echo
echo "4. Checking default roles..."

expect_role "$ADMIN_USER" "$ADMIN_PASSWORD" "role_admin"
expect_role "$AUTH_USER" "$AUTH_PASSWORD" "role_auth_service"
expect_role "$READONLY_USER" "$READONLY_PASSWORD" "role_readonly"


echo
echo "5. Testing role_admin..."

expect_allowed \
  "admin SELECT app_users" \
  user_sql "$ADMIN_USER" "$ADMIN_PASSWORD" \
  "SELECT * FROM app_users LIMIT 1;"

expect_allowed \
  "admin DELETE app_users" \
  user_sql "$ADMIN_USER" "$ADMIN_PASSWORD" \
  "DELETE FROM app_users WHERE id = 999999999;"


echo
echo "6. Testing role_auth_service..."

expect_allowed \
  "auth_service SELECT app_users" \
  user_sql "$AUTH_USER" "$AUTH_PASSWORD" \
  "SELECT * FROM app_users LIMIT 1;"

expect_allowed \
  "auth_service INSERT login_audit" \
  user_sql "$AUTH_USER" "$AUTH_PASSWORD" \
  "START TRANSACTION;
   INSERT INTO login_audit
     (attempted_email, success, reason)
   VALUES
     ('rbac-test@example.invalid', 0, 'RBAC_TEST');
   ROLLBACK;"

expect_denied \
  "auth_service DELETE app_users" \
  user_sql "$AUTH_USER" "$AUTH_PASSWORD" \
  "DELETE FROM app_users WHERE id = 999999999;"

expect_denied \
  "auth_service UPDATE login_audit" \
  user_sql "$AUTH_USER" "$AUTH_PASSWORD" \
  "UPDATE login_audit
   SET reason = 'RBAC_TEST_CHANGED'
   WHERE id = 999999999;"


echo
echo "7. Testing role_readonly..."

expect_allowed \
  "project_reader SELECT app_users" \
  user_sql "$READONLY_USER" "$READONLY_PASSWORD" \
  "SELECT * FROM app_users LIMIT 1;"

expect_denied \
  "project_reader INSERT login_audit" \
  user_sql "$READONLY_USER" "$READONLY_PASSWORD" \
  "INSERT INTO login_audit
     (attempted_email, success, reason)
   VALUES
     ('reader-test@example.invalid', 0, 'RBAC_TEST');"

expect_denied \
  "project_reader UPDATE app_users" \
  user_sql "$READONLY_USER" "$READONLY_PASSWORD" \
  "UPDATE app_users
   SET username = username
   WHERE id = 999999999;"

expect_denied \
  "project_reader DELETE app_users" \
  user_sql "$READONLY_USER" "$READONLY_PASSWORD" \
  "DELETE FROM app_users WHERE id = 999999999;"


echo
echo "======================================"
echo "ALL MARIA DB RBAC TESTS PASSED"
echo "======================================"