A project for area 5, "Authentication and access control" for the [MariaDB student database projects, 2026-09](https://mariadb.org/bachelor_hackathon_2026-09/).

# MariaDB Authentication and Access Control

**MariaDB enforces access control on the connection itself.** Each kind of user has a real database account and a default role. The optional Express API authenticates a new connection using the caller's MariaDB username and password. It contains no role permission map, shared database credentials, or JWT authorization rules.

## Start here: executable SQL

- [`database/init/01-schema.sql`](database/init/01-schema.sql): tables, sample directory entry, and public-column view.
- [`database/security/01-accounts.sql.in`](database/security/01-accounts.sql.in): `CREATE USER` and password authentication.
- [`database/security/02-roles.sql.in`](database/security/02-roles.sql.in): roles, grants, role assignments, default roles, and intentionally withheld permissions.
- [`database/examples/inspect.sql`](database/examples/inspect.sql): operations to try as different accounts.
- [`database/examples/revoke.sql`](database/examples/revoke.sql): removing and restoring a grant.

The `.sql.in` files are SQL templates. [`02-security.sh`](database/init/02-security.sh) substitutes environment settings, escapes password literals, and runs them during initial database creation. Policy lives in SQL, not in that loader or TypeScript.

## Accounts and permissions

| MariaDB account | Default role | Allowed operations |
|---|---|---|
| `project_admin` | `role_admin` | All privileges on the project database, without `GRANT OPTION` or global account administration |
| `project_employee` | `role_employee` | Read the public directory; update only `app_users.username` (and read `id` for the update predicate) |
| `project_reader` | `role_readonly` | Read only the public directory |
| `project_auditor` | `role_auditor` | Read only `login_audit` |

Every other operation is denied unless another grant explicitly allows it. The reader cannot access `app_users.password_hash`, modify data, or activate the administrator role. The auditor cannot modify audit records. The `SQL SECURITY DEFINER` directory view deliberately exposes only `id`, `email`, and `username`; callers receive no access to its private base-table columns.

MariaDB 11.8 does **not** support the SQL `DENY` statement. This tutorial demonstrates denied operations through absent grants and `REVOKE`. Explicit negative permissions appear in later versions; do not copy their syntax into this pinned environment. See the version notes in the official [GRANT documentation](https://github.com/mariadb-corporation/mariadb-docs/blob/main/server/reference/sql-statements/account-management-sql-statements/grant.md). Default roles activate when a user connects; see [SET ROLE](https://github.com/mariadb-corporation/mariadb-docs/blob/main/server/reference/sql-statements/account-management-sql-statements/set-role.md).

## Run the tutorial

```bash
cp .env.example .env
# Edit .env and replace the example passwords.
docker compose -p co560-native up --build -d --wait
```

Use a fresh Compose project name as above when moving from the previous version. Initialization runs only for an empty volume. This is a replacement tutorial setup, not an in-place migration of old users/grants. Existing volumes are left intact; if another stack occupies ports 3000/3307, stop it or set `API_PUBLISHED_PORT` and `DB_PUBLISHED_PORT` in `.env`.

Open a database session; enter the reader password from `.env` at the prompt:

```bash
docker compose -p co560-native exec db mariadb --protocol=tcp -h127.0.0.1 -u project_reader -p auth_project
```

If you changed `MARIADB_DATABASE`, substitute that name in examples. In this session:

```sql
SELECT CURRENT_USER(), CURRENT_ROLE();
-- project_reader@%, role_readonly
SELECT * FROM user_directory;           -- allowed
SELECT password_hash FROM app_users;   -- error 1142
UPDATE app_users SET username = 'x' WHERE id = 1; -- error 1142
SET ROLE role_admin;                    -- error 1959
```

Repeat with `project_employee`, `project_auditor`, and `project_admin`. These restrictions work with the API stopped. For grant inspection and the revocation example, open a root socket session with `docker compose -p co560-native exec db mariadb -uroot -p auth_project`, then run `SHOW GRANTS FOR role_readonly;` and `SHOW GRANTS FOR 'project_reader'@'%';`.

## Optional HTTP interface

HTTP Basic credentials are passed directly to MariaDB for authentication. Each request uses its own connection, which is destroyed afterward. The default database role determines the result; the API only validates input and translates MariaDB errors into HTTP 401/403 responses.

```bash
# curl prompts for the corresponding MariaDB password each time.
curl -u project_reader http://localhost:3000/api/me
curl -u project_reader http://localhost:3000/api/users
curl -u project_reader -X PATCH http://localhost:3000/api/users/1 \
  -H 'Content-Type: application/json' -d '{"username":"student_updated"}'
# HTTP 403: MariaDB rejects the UPDATE.
curl -u project_employee -X PATCH http://localhost:3000/api/users/1 \
  -H 'Content-Type: application/json' -d '{"username":"student_updated"}'
# HTTP 200: MariaDB permits the username column update.
curl -u project_auditor http://localhost:3000/api/audit
```

This replaces the previous `/api/auth/register`, login, password-change, and JWT flow. `app_users` now serves as sample protected data; its rows are **not** MariaDB accounts. Its existing password and lockout columns are retained as private demonstration data, not used to authenticate callers. `login_audit` is also sample data: this version does not automatically collect MariaDB connection events. Account provisioning and password changes belong to the database administrator through SQL.

## Verification

```bash
npm ci
npm run build
npm run test:rbac
```

The test creates a uniquely named Compose stack with an isolated disposable volume and ephemeral published ports, and removes only that stack afterward. It verifies actual default roles, permitted operations, exact permission-error codes, wrong credentials, column restrictions, role escalation, revocation, and HTTP behavior including concurrent mixed identities. Docker must be running. Database assertions connect directly, independently of the API.

## Scope and limitations

This is a local teaching environment. Published ports bind to loopback. HTTP Basic is not encrypted, and verified API-to-database TLS is not configured; use HTTPS and verified MariaDB TLS before deploying across untrusted networks. Passwords are stored by MariaDB using its default password authentication mechanism; this version does not demonstrate alternative plugins or certificate authentication. The view enforces column access, not per-person row ownership. The employee role can update any directory entry's username. The administrator role is intentionally powerful within the project database and should be used for administration only.
