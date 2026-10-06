#!/usr/bin/env bash
set -euo pipefail


required_vars=(
  MARIADB_ROOT_PASSWORD
  MARIADB_DATABASE
  AUTH_DB_USER
  READONLY_DB_USER
)

# Check that all required environment variables exist.
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

# Only allow safe SQL identifiers.
require_identifier() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "$label may contain only letters, digits and underscore." >&2
    exit 1
  fi
}

require_identifier "$MARIADB_DATABASE" "MARIADB_DATABASE"
require_identifier "$AUTH_DB_USER" "AUTH_DB_USER"
require_identifier "$READONLY_DB_USER" "READONLY_DB_USER"

mariadb \
  --protocol=socket \
  -uroot \
  -p"${MARIADB_ROOT_PASSWORD}" <<SQL


CREATE ROLE IF NOT EXISTS role_admin;
CREATE ROLE IF NOT EXISTS role_auth_service;
CREATE ROLE IF NOT EXISTS role_readonly;


-- These privileges were originally granted directly to the
-- service users in 02-create-service-users.sh.
-- We remove them so access is controlled through roles.

REVOKE SELECT, INSERT, UPDATE
ON \`${MARIADB_DATABASE}\`.\`app_users\`
FROM '${AUTH_DB_USER}'@'%';

REVOKE INSERT
ON \`${MARIADB_DATABASE}\`.\`login_audit\`
FROM '${AUTH_DB_USER}'@'%';

REVOKE SELECT
ON \`${MARIADB_DATABASE}\`.*
FROM '${READONLY_DB_USER}'@'%';


-- Administrative role:
-- Full access to the project database.
-- GRANT OPTION is intentionally not included.
GRANT ALL PRIVILEGES
ON \`${MARIADB_DATABASE}\`.*
TO role_admin;


-- Authentication service role:
-- Can read, create and update application users.
-- DELETE is intentionally not allowed.
GRANT SELECT, INSERT, UPDATE
ON \`${MARIADB_DATABASE}\`.\`app_users\`
TO role_auth_service;

-- Authentication service can only add audit records.
-- Existing audit records cannot be changed or deleted.
GRANT INSERT
ON \`${MARIADB_DATABASE}\`.\`login_audit\`
TO role_auth_service;


-- Read-only role:
-- Can read all tables in the project database.
GRANT SELECT
ON \`${MARIADB_DATABASE}\`.*
TO role_readonly;


GRANT role_auth_service
TO '${AUTH_DB_USER}'@'%';

GRANT role_readonly
TO '${READONLY_DB_USER}'@'%';


SET DEFAULT ROLE role_auth_service
FOR '${AUTH_DB_USER}'@'%';

SET DEFAULT ROLE role_readonly
FOR '${READONLY_DB_USER}'@'%';

SQL

echo "MariaDB RBAC roles and privileges created successfully."