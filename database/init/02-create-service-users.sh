#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  MARIADB_ROOT_PASSWORD
  MARIADB_DATABASE
  AUTH_DB_USER
  AUTH_DB_PASSWORD
  READONLY_DB_USER
  READONLY_DB_PASSWORD
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

require_identifier() {
  local value="$1"
  local label="$2"
  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "$label may contain only letters, digits and underscore." >&2
    exit 1
  fi
}

sql_escape_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

require_identifier "$MARIADB_DATABASE" "MARIADB_DATABASE"
require_identifier "$AUTH_DB_USER" "AUTH_DB_USER"
require_identifier "$READONLY_DB_USER" "READONLY_DB_USER"

AUTH_DB_PASSWORD_SQL="$(sql_escape_literal "$AUTH_DB_PASSWORD")"
READONLY_DB_PASSWORD_SQL="$(sql_escape_literal "$READONLY_DB_PASSWORD")"

mariadb \
  --protocol=socket \
  -uroot \
  -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${AUTH_DB_USER}'@'%'
  IDENTIFIED BY '${AUTH_DB_PASSWORD_SQL}';

ALTER USER '${AUTH_DB_USER}'@'%'
  IDENTIFIED BY '${AUTH_DB_PASSWORD_SQL}';

GRANT SELECT, INSERT, UPDATE
  ON \`${MARIADB_DATABASE}\`.\`app_users\`
  TO '${AUTH_DB_USER}'@'%';

GRANT INSERT
  ON \`${MARIADB_DATABASE}\`.\`login_audit\`
  TO '${AUTH_DB_USER}'@'%';

CREATE USER IF NOT EXISTS '${READONLY_DB_USER}'@'%'
  IDENTIFIED BY '${READONLY_DB_PASSWORD_SQL}';

ALTER USER '${READONLY_DB_USER}'@'%'
  IDENTIFIED BY '${READONLY_DB_PASSWORD_SQL}';

GRANT SELECT
  ON \`${MARIADB_DATABASE}\`.*
  TO '${READONLY_DB_USER}'@'%';
SQL

echo "MariaDB service users and least-privilege grants created."
