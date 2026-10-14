#!/usr/bin/env bash
set -euo pipefail
: "${MARIADB_ROOT_PASSWORD:?Required}"
: "${MARIADB_DATABASE:?Required}"
[[ "$MARIADB_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'Invalid database identifier' >&2; exit 1; }
for name in ADMIN_DB_PASSWORD EMPLOYEE_DB_PASSWORD READONLY_DB_PASSWORD AUDITOR_DB_PASSWORD; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name" >&2; exit 1; }
done
# SQL stays in database/security; this adapter only substitutes configuration.
render() {
  local sql token name value quote="'"
  sql="$(cat "$1")"
  # Scan only the remaining template, never substituted passwords. Passwords
  # containing quotes, backslashes, &, or template-like text remain literal.
  while [[ "$sql" =~ \{\{([A-Z_]+)\}\} ]]; do
    token="${BASH_REMATCH[0]}"
    name="${BASH_REMATCH[1]}"
    case "$name" in
      MARIADB_DATABASE|ADMIN_DB_PASSWORD|EMPLOYEE_DB_PASSWORD|READONLY_DB_PASSWORD|AUDITOR_DB_PASSWORD) ;;
      *) echo "Unknown SQL template variable: $name" >&2; return 1 ;;
    esac
    value="${!name}"
    value="${value//$quote/$quote$quote}"
    printf '%s%s' "${sql%%"$token"*}" "$value"
    sql="${sql#*"$token"}"
  done
  printf '%s\n' "$sql"
}
# Render completely before executing; an invalid configuration must fail init.
accounts="$(render /opt/project-security/01-accounts.sql.in)"
roles="$(render /opt/project-security/02-roles.sql.in)"
{
  printf "SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES';\n"
  printf '%s\n' "$accounts" "$roles"
} | MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb --protocol=socket -uroot "$MARIADB_DATABASE"
