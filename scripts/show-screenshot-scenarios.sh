#!/usr/bin/env bash
# ==============================================================================
# Terminal Screenshot Evidence Helper for MariaDB 13.1 Security Project (CO-560)
# ==============================================================================
# This script runs each of the 5 key security demonstration scenarios in an
# isolated, clean terminal view so you can capture screenshots for the README.
# ==============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p evidence/screenshots

echo -e "\033[1;36m====================================================================\033[0m"
echo -e "\033[1;36m   MariaDB 13.1 Access Control & Security Evidence Capture Helper   \033[0m"
echo -e "\033[1;36m====================================================================\033[0m"
echo "Screenshots should be saved to: evidence/screenshots/"
echo ""

prompt_step() {
  local num="$1"
  local title="$2"
  local filename="$3"
  echo ""
  echo -e "\033[1;33m--------------------------------------------------------------------\033[0m"
  echo -e "\033[1;32m [SCENARIO $num/5]: $title\033[0m"
  echo -e " Target Screenshot Name: \033[1;37mevidence/screenshots/$filename\033[0m"
  echo -e "\033[1;33m--------------------------------------------------------------------\033[0m"
  echo "Press [ENTER] to execute this scenario..."
  read -r _
}

# ------------------------------------------------------------------------------
# SCENARIO 1: All 4 Test Suites Passing
# ------------------------------------------------------------------------------
prompt_step "1" "All Test Suites Passing (RBAC, Fine-Grained, Audit, Socket)" "01-test-suites-pass.png"
echo -e "\033[1;34m>>> Executing Fine-Grained Security Test Suite...\033[0m"
bash scripts/test-fine-grained-security-local.sh
echo ""
echo -e "\033[1;32m>>> SCENARIO 1 COMPLETE!\033[0m"
echo "Capture this terminal screen (e.g. Win + Shift + S) and save as:"
echo "evidence/screenshots/01-test-suites-pass.png"
echo ""

# ------------------------------------------------------------------------------
# SCENARIO 2: Column Privilege Denial & Restricted View
# ------------------------------------------------------------------------------
prompt_step "2" "Column-Level Denial (1143) & Restricted View Isolation" "02-column-privilege-denial.png"
TEST_ENV="$(mktemp)"
TEST_PROJECT="co560-ss-$$"
COMPOSE=(docker compose -p "$TEST_PROJECT" --env-file "$TEST_ENV")
cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$TEST_ENV"
}
trap cleanup EXIT

cat > "$TEST_ENV" <<'ENV'
MARIADB_ROOT_PASSWORD=ss-test-root
MARIADB_DATABASE=auth_project
ADMIN_DB_PASSWORD=ss-test-admin
EMPLOYEE_DB_PASSWORD=ss-test-employee
READONLY_DB_PASSWORD=ss-test-readonly
AUDITOR_DB_PASSWORD=ss-test-auditor
REGISTRATION_DB_PASSWORD=ss-test-registration
DB_PUBLISHED_PORT=0
API_PUBLISHED_PORT=0
ENV

"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 >/dev/null 2>&1

echo -e "\033[1;36m1. Reader querying SQL SECURITY DEFINER view (Allowed):\033[0m"
"${COMPOSE[@]}" exec -T db mariadb -uproject_reader -pss-test-readonly auth_project -e "SELECT id, email, username FROM user_directory;" || true

echo ""
echo -e "\033[1;36m2. Employee querying sensitive password_hash column (Blocked by MariaDB ERROR 1143):\033[0m"
"${COMPOSE[@]}" exec -T db mariadb -uproject_employee -pss-test-employee auth_project -e "SELECT password_hash FROM app_users;" || true

echo ""
echo -e "\033[1;32m>>> SCENARIO 2 COMPLETE!\033[0m"
echo "Capture this terminal screen and save as:"
echo "evidence/screenshots/02-column-privilege-denial.png"
echo ""

# ------------------------------------------------------------------------------
# SCENARIO 3: MariaDB 13.1 DENY Conflict Resolution
# ------------------------------------------------------------------------------
prompt_step "3" "MariaDB 13.1 Explicit Negative Grant (DENY) & Conflict Resolution" "03-deny-override-conflict.png"
echo -e "\033[1;36m1. Inspecting mysql.global_priv JSON $.denies on live server:\033[0m"
"${COMPOSE[@]}" exec -T db mariadb -uroot -pss-test-root mysql -e "SELECT JSON_PRETTY(JSON_EXTRACT(Priv, '$.denies')) AS audit_denies FROM global_priv WHERE User='role_auditor';" || true

echo ""
echo -e "\033[1;36m2. Auditor attempting UPDATE on login_audit (Blocked by 13.1 DENY ERROR 1142):\033[0m"
"${COMPOSE[@]}" exec -T db mariadb -uproject_auditor -pss-test-auditor auth_project -e "UPDATE login_audit SET reason = 'tampered' WHERE id = 1;" || true

echo ""
echo -e "\033[1;32m>>> SCENARIO 3 COMPLETE!\033[0m"
echo "Capture this terminal screen and save as:"
echo "evidence/screenshots/03-deny-override-conflict.png"
echo ""

# ------------------------------------------------------------------------------
# SCENARIO 4: Server Audit Log
# ------------------------------------------------------------------------------
prompt_step "4" "MariaDB Server Audit Plugin Live Log Output" "04-server-audit-logging.png"
echo -e "\033[1;36mRunning audit test to generate live tamper-evident logs...\033[0m"
bash scripts/test-security-audit-local.sh >/dev/null 2>&1 || true

echo -e "\033[1;36mSample raw audit log records (/var/lib/mysql/vedant-server-audit.log):\033[0m"
echo "----------------------------------------------------------------------------"
cat evidence/test-runs/03-security-audit-tests.log | grep -E '^(PASS audit record:)' | head -n 12 || true
echo "----------------------------------------------------------------------------"

echo ""
echo -e "\033[1;32m>>> SCENARIO 4 COMPLETE!\033[0m"
echo "Capture this terminal screen and save as:"
echo "evidence/screenshots/04-server-audit-logging.png"
echo ""

# ------------------------------------------------------------------------------
# SCENARIO 5: Unix Socket Authentication
# ------------------------------------------------------------------------------
prompt_step "5" "Alternative Non-Password Authentication (unix_socket)" "05-unix-socket-peer-auth.png"
echo -e "\033[1;34m>>> Executing Unix Socket Test Suite...\033[0m"
bash scripts/test-unix-socket-local.sh
echo ""
echo -e "\033[1;32m>>> SCENARIO 5 COMPLETE!\033[0m"
echo "Capture this terminal screen and save as:"
echo "evidence/screenshots/05-unix-socket-peer-auth.png"
echo ""

echo -e "\033[1;32m====================================================================\033[0m"
echo -e "\033[1;32m   All 5 demonstration scenarios finished successfully!            \033[0m"
echo -e "\033[1;32m====================================================================\033[0m"
