A project for area 5, "Authentication and access control" for the [MariaDB student database projects, 2026-09](https://mariadb.org/bachelor_hackathon_2026-09/).

# MariaDB Authentication and Access Control

[![CI](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-rbac.yml/badge.svg?branch=main)](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-rbac.yml)

[![Security Audit](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-server-audit.yml/badge.svg?branch=main)](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-server-audit.yml)

[![Unix Socket Auth](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-unix-socket.yml/badge.svg?branch=main)](https://github.com/Sarperdgn/Database-Project-CO-560/actions/workflows/mariadb-unix-socket.yml)

A reproducible, database-first tutorial demonstrating how **MariaDB accounts, roles, column-level privileges, and MariaDB 13.1 `DENY` (negative grants)** control access to application data. An optional Express API exposes the same controls over HTTP; the database, not application-side role checks, makes the authorization decisions.

**Project area:** 5 — Authentication and access control  
**Course:** CO-560 Database Core, Constructor University  
**MariaDB target:** **13.1 preview/development image** (`quay.io/mariadb-foundation/mariadb-devel:13.1` in `docker-compose.yml`)  
**Repository:** [Sarperdgn/Database-Project-CO-560](https://github.com/Sarperdgn/Database-Project-CO-560)

> **Scope:** This is a local educational demonstration, not a production-ready authentication service. It implements MariaDB role enforcement and negative grants, but **does not yet implement a non-password MariaDB authentication method or verified TLS**. The optional HTTP interface uses unencrypted HTTP Basic authentication on loopback. See [Security limitations and assignment coverage](#security-limitations-and-assignment-coverage).

## 1. What this project demonstrates

A security model is more convincing when a disallowed SQL statement still fails **after the API is bypassed**. This project gives each kind of user a separate MariaDB account, assigns an appropriate default role, and places grants and denials in SQL scripts. Readers can connect directly to MariaDB to test the exact same rules that the HTTP API encounters.

- **Native authentication:** MariaDB validates the credentials of each account that opens a protected connection.
- **Role-based access control (RBAC):** `role_admin`, `role_employee`, `role_readonly`, and `role_auditor` receive different rights.
- **Least privilege:** A public-column view and column-scoped grants avoid exposing `password_hash` or allowing unrestricted updates.
- **Explicit negative privileges:** MariaDB **13.1 `DENY`** prevents the auditor from changing audit data, even after someone adds a conflicting positive grant.
- **Account lifecycle:** A restricted SQL procedure creates new `signup_*` MariaDB accounts with the read-only role; an invoker-security procedure changes the caller's own password.
- **Repeatable negative tests:** Dedicated scripts test successful and rejected actions using actual MariaDB error codes. An opt-in Server Audit configuration can record connection attempts and queries.

### Architecture

```text
                    +---------------------------+
                    | HTTP client / SQL client  |
                    +-------------+-------------+
                                  |
                 +----------------+----------------+
                 |                                 |
          HTTP Basic / API                    MariaDB CLI
                 |                                 |
         +-------v---------+                       |
         | Express / Node  |                       |
         | validation, SQL |                       |
         | error mapping   |                       |
         +-------+---------+                       |
                 | connection as calling user     |
                 +----------------+----------------+
                                  |
                         +--------v---------+
                         | MariaDB 13.1     |
                         | accounts + roles |
                         | GRANT + DENY     |
                         | views + routines |
                         +------------------+
```

Protected API requests each open a fresh database connection using the caller's HTTP Basic username/password and destroy that connection afterward. The API does not maintain a JWT permission map, switch to an elevated role for protected requests, or use one privileged connection for all users. **Registration is a deliberate exception:** the public registration endpoint uses a separate, narrowly scoped `project_registrar` account, whose credential is supplied through configuration and whose role can execute only the provisioning procedure.

## 2. Requirements and quick start

You need **Docker Engine**, **Docker Compose v2**, and an internet connection to pull the MariaDB 13.1 development image and build the Node.js container. To run the repository's RBAC tests, you also need **Node.js 22** and npm. The separate audit-verification test requires **Python 3** and Bash.

```bash
git clone https://github.com/Sarperdgn/Database-Project-CO-560.git
cd Database-Project-CO-560
cp .env.example .env
```

**Edit `.env` and replace every demonstration password.** Never commit `.env` or real credentials. Then start an isolated project:

```bash
docker compose -p co560-demo up --build -d --wait
```

Check the services and the server version:

```bash
docker compose -p co560-demo ps
docker compose -p co560-demo exec db mariadb -uroot -p -e 'SELECT VERSION();'
curl http://127.0.0.1:3000/health
```

Enter the `MARIADB_ROOT_PASSWORD` from `.env` when prompted. The health endpoint should return `{"status":"ok"}`. The default published ports are **127.0.0.1:3000** for the HTTP API and **127.0.0.1:3307** for MariaDB. If those ports are already in use, add `API_PUBLISHED_PORT` and `DB_PUBLISHED_PORT` with unused values to `.env`.

**Important:** The Docker database initialization scripts run **only when the database volume is first created**. The `co560-demo` project name keeps this tutorial separate from other Compose projects. Rebuilding the API does not re-apply SQL changes to an existing database volume. To remove this demonstration's database and data **permanently** when finished:

```bash
docker compose -p co560-demo down -v
```

Do not run `down -v` against a project whose data you want to keep.

## 3. Data model and design decisions

The SQL in [`database/init/01-schema.sql`](database/init/01-schema.sql) creates two InnoDB tables, one protected view, and one illustrative directory record:

| Object | Key fields | Purpose and design rationale |
| --- | --- | --- |
| `app_users` | `id`, `email`, `username`, `password_hash`, status/lockout fields, timestamps | Protected demonstration data. Unique email/username constraints model a small user directory. **Rows are not MariaDB login accounts.** The hash and lockout fields are illustrative and are not used by the current authentication flow. |
| `login_audit` | `id`, optional `user_id`, `attempted_email`, `success`, `reason`, `ip_address`, `created_at` | Illustrates sensitive event data and an auditor-only read use case. The foreign key to `app_users` uses `ON DELETE SET NULL` to preserve the record when a directory row is removed. It is **not automatically populated with MariaDB login events**. |
| `user_directory` | `id`, `email`, `username` | A `SQL SECURITY DEFINER` view that reveals only intended directory columns. Readers and employees can query the view without gaining direct access to password hashes. |

The initial directory row (`student@example.invalid`) is inserted by the schema script. MariaDB identities such as `project_reader` are created separately by SQL account-management statements; these are not linked to `app_users.id`.

### Database initialization, in order

1. `database/init/01-schema.sql` creates the sample tables, view, and seed row.
2. `database/init/02-security.sh` renders the SQL templates with validated environment values and executes them during fresh-volume initialization.
3. `database/security/01-accounts.sql.in` creates the four demonstration accounts.
4. `database/security/02-roles.sql.in` defines roles, positive grants, default role assignments, and explicit `DENY` rules.
5. `database/security/03-self-service.sql.in` creates the limited registrar and account/password procedures.

The loader handles template substitution; **SQL files define the security policy**. This separation makes the rules independently readable and testable.

## 4. MariaDB roles and permission matrix

| Account | Default role | Intended permitted operations | Examples of blocked operations |
| --- | --- | --- | --- |
| `project_admin` | `role_admin` | Manage tables and records in the project database | No global account-management rights or `GRANT OPTION` supplied by this role |
| `project_employee` | `role_employee` | Read `user_directory`, read `app_users.id`, update only `app_users.username` | Read `password_hash`, delete records, change the password-hash column |
| `project_reader` | `role_readonly` | Read `user_directory` | Modify data, read the audit table or private base-table columns, activate the admin role |
| `project_auditor` | `role_auditor` | Read `login_audit` | Modify or delete `login_audit`, access the public directory |
| `project_registrar` | `role_registration` | Execute `register_account(...)` | Direct `CREATE USER`, direct directory queries, role assignment outside the procedure |
| Newly registered `signup_*` | `role_readonly` | Read `user_directory`, change own password via granted procedure | Modify the directory or activate an unauthorized role |

The essential SQL is in [`database/security/02-roles.sql.in`](database/security/02-roles.sql.in):

```sql
CREATE ROLE role_readonly;
GRANT SELECT ON auth_project.user_directory TO role_readonly;
GRANT role_readonly TO 'project_reader'@'%';
SET DEFAULT ROLE role_readonly FOR 'project_reader'@'%';

-- MariaDB 13.1: a negative grant overrides a conflicting positive grant.
DENY UPDATE, DELETE ON auth_project.login_audit TO role_auditor;
```

The example uses the default database name, `auth_project`; the real initialization script substitutes `MARIADB_DATABASE`. `DENY` is a **MariaDB 13.1 feature** and is not available in MariaDB 11.8 or other older releases. `REVOKE` removes an existing grant; `REVOKE DENY` removes a negative grant. The two mechanisms are not interchangeable.

## 5. Hands-on SQL tutorial: allow, block, and revoke

Connect directly to the database as the read-only account (enter its password from `.env`):

```bash
docker compose -p co560-demo exec db \
  mariadb --protocol=tcp -h127.0.0.1 -u project_reader -p auth_project
```

Run the following statements **one at a time**. Errors on the negative cases are intentional:

```sql
SELECT CURRENT_USER(), CURRENT_ROLE();  -- project_reader@%, role_readonly
SELECT * FROM user_directory;            -- allowed
SELECT password_hash FROM app_users;    -- denied: no base-table privilege
UPDATE app_users SET username = 'x' WHERE id = 1; -- denied
SET ROLE role_admin;                     -- denied: role not assigned
SHOW GRANTS;                             -- inspect the account's grants
```

Now reconnect as `project_employee`. A username update is permitted, but reading the password-hash column is not:

```sql
START TRANSACTION;
UPDATE app_users SET username = 'updated_by_employee' WHERE id = 1;
ROLLBACK;  -- leave the sample data unchanged
SELECT password_hash FROM app_users; -- intentionally denied
```

### Demonstrate that `DENY` beats `GRANT`

As the database administrator, execute the following *in the demonstration database*:

```sql
GRANT UPDATE ON auth_project.login_audit TO role_auditor;
SHOW GRANTS FOR role_auditor;
```

Despite the added positive grant, a new `project_auditor` session still cannot execute:

```sql
UPDATE login_audit SET reason = 'should_not_work' WHERE id = 999999999;
```

To inspect how removing the negative grant changes the result, the administrator can run:

```sql
REVOKE DENY UPDATE ON auth_project.login_audit FROM role_auditor;
-- The same UPDATE is now permitted because the positive GRANT remains.

-- Restore the original access-control policy before finishing:
DENY UPDATE ON auth_project.login_audit TO role_auditor;
REVOKE UPDATE ON auth_project.login_audit FROM role_auditor;
```

Use [`database/examples/inspect.sql`](database/examples/inspect.sql), [`database/examples/deny.sql`](database/examples/deny.sql), and [`database/examples/revoke.sql`](database/examples/revoke.sql) for additional worked statements. These examples intentionally include commands that must fail under particular accounts; they are not intended to be executed blindly as a single migration.

## 6. Optional Express HTTP demonstration

The TypeScript API is intentionally thin: it validates requests, opens a MariaDB connection with the caller's credentials, issues parameterized SQL, translates common MariaDB authentication/permission errors to HTTP responses, and closes the connection. It does **not** decide access from JWT claims or a hard-coded application permission matrix.

| Endpoint | Authentication | Operation |
| --- | --- | --- |
| `GET /health` | None | Service health check (not a database connectivity test) |
| `GET /api/me` | HTTP Basic | Return `CURRENT_USER()` and `CURRENT_ROLE()` |
| `GET /api/users` | HTTP Basic | Read public directory fields |
| `PATCH /api/users/:id` | HTTP Basic | Attempt to update a username; MariaDB decides whether allowed |
| `GET /api/audit` | HTTP Basic | Attempt to read the protected `login_audit` table |
| `POST /api/auth/register` | Public; limited registrar account behind the endpoint | Create a restricted MariaDB `signup_*` account |
| `POST /api/auth/change-password` | HTTP Basic | Change the authenticated account's own password |

Try the following commands on the demo machine. The `-u` options **prompt for passwords** rather than putting passwords into shell history:

```bash
curl -u project_reader http://127.0.0.1:3000/api/me
curl -u project_reader http://127.0.0.1:3000/api/users
curl -u project_reader -X PATCH http://127.0.0.1:3000/api/users/1 \
  -H 'Content-Type: application/json' \
  -d '{"username":"new_student"}'  # HTTP 403
curl -u project_employee -X PATCH http://127.0.0.1:3000/api/users/1 \
  -H 'Content-Type: application/json' \
  -d '{"username":"new_student"}'  # HTTP 200
curl -u project_auditor http://127.0.0.1:3000/api/audit
```

### Register a restricted account

A registration username must match `signup_[a-z0-9_]{3,24}`; passwords must be 12–128 characters. Registration executes a `SQL SECURITY DEFINER` provisioning procedure using a low-privilege registrar account; new accounts receive **only** the read-only role.

```bash
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"signup_alice","password":"replace-with-a-unique-passphrase"}'

curl -u signup_alice http://127.0.0.1:3000/api/me

curl -u signup_alice -X POST http://127.0.0.1:3000/api/auth/change-password \
  -H 'Content-Type: application/json' \
  -d '{"newPassword":"another-unique-long-passphrase"}'
```

These are **local examples**; do not transmit credentials or passwords over untrusted HTTP networks. The new password takes effect on subsequent connections. The repository's older application-level registration/JWT approach is no longer the active implementation.

## 7. Automated tests and audit evidence

### Database RBAC and HTTP tests

```bash
npm ci
npm run build
npm run test:rbac
```

[`scripts/test-rbac-local.sh`](scripts/test-rbac-local.sh) creates an isolated, disposable Compose project and tests **actual MariaDB behavior**, including correct default roles, successful operations, forbidden table/column access, role escalation, invalid passwords, revocation and restoration, `DENY` precedence, and the restricted registrar. It invokes [`scripts/test-api.mjs`](scripts/test-api.mjs) to verify that HTTP endpoints preserve the database permissions, including requests made concurrently as different users.

The test checks **MariaDB error numbers** rather than treating any error (such as a syntax mistake or failed connection) as proof of access control. Its isolated volume is removed on exit. The script reports success only when its assertions pass; **this README does not claim a verified test run or attach fabricated test results**.

### Optional MariaDB Server Audit test

```bash
bash scripts/test-security-audit-local.sh
```

This second disposable test enables MariaDB's **Server Audit plugin** through [`docker-compose.audit.yml`](docker-compose.audit.yml) and [`database/audit/99-server-audit.cnf`](database/audit/99-server-audit.cnf). It attempts allowed queries, unauthorized reads/updates, incorrect-password logins, role escalation, account locking, revocation, and `DENY` precedence. [`scripts/verify-audit-log.py`](scripts/verify-audit-log.py) inspects real server audit-log records; the script fails if required evidence is missing.

The `login_audit` **SQL table is separate from the Server Audit plugin's file-based log**. The plugin does not prevent malicious SQL by itself: its job is to produce evidence of attempted and rejected operations.

**Audit test scenarios:** The audit suite verifies successful directory reads; wrong-password authentication failures; denied access to `password_hash`; rejected reader writes; rejected role escalation; `REVOKE`/`GRANT` changes; employee account lock/unlock; and the precedence of `DENY` over an added positive `GRANT`. The script checks the returned MariaDB error codes and separately searches the Server Audit log for the corresponding events. These are **test scenarios**, not claims that this README's author ran the tests successfully.

**Audit threat model and limitations:** Audit logs may contain SQL text and sensitive values. The optional plugin writes to a file within the database container's volume and filters query logging to the four demonstration accounts, while connection logging may still include other accounts. A privileged database administrator or host operator can inspect or alter local logs; the demonstration does not provide tamper-proof retention, external log forwarding, or production monitoring. An account lock prevents new connections but does not end existing sessions. For any real deployment, configure access-controlled off-host logging, retention, alerting, and encrypted transport. The audit configuration is loaded only when the explicit `docker-compose.audit.yml` override is used; if the container image lacks a working Server Audit plugin, startup or the test will fail rather than count the test as passed.

## 8. What we found and what remains unprotected

| Control / experiment | Expected behavior demonstrated by repository code | What it does **not** establish |
| --- | --- | --- |
| Per-user MariaDB connections | A reader cannot gain the employee's write privileges by bypassing the API | Protection if the reader steals the employee's actual password |
| Default roles and column grants | Directory access works without exposing `password_hash`; users cannot activate roles they were not granted | Row-level ownership restrictions for individual directory entries |
| MariaDB 13.1 `DENY` | A conflicting `GRANT UPDATE` does not override the auditor's negative privilege | Protection against a sufficiently privileged administrator who changes the policy |
| Restricted registration procedure | Callers receive only a read-only MariaDB login; the registrar cannot run unrestricted `CREATE USER` | An alternative, passwordless authentication method |
| Account locking and audit-test scenarios | New locked-account connections are rejected; audit logs can record failed connections and statements when enabled | Forced termination of previously established sessions; tamper-proof/off-host audit retention |
| Loopback publishing | Default ports are not advertised on all host interfaces | End-to-end encryption or security against other processes/users on the same host |

### Security limitations and assignment coverage

The [Area 5 rubric](https://mariadb.org/bachelor_hackathon_2026-09/#5-authentication-and-access-control) asks for role/`DENY` enforcement, a non-password or alternative MariaDB authentication method, attacks against each control, verified TLS, and full reproducibility.

- **Implemented in repository source:** MariaDB 13.1 role assignments and explicit `DENY`; database-level permission checks and attacks; direct SQL and API examples; registration and password-change routines; disposable test harnesses; optional audit plugin configuration.
- **Not implemented / not evidenced:** **verified MariaDB TLS** (the application connection does not configure TLS) and **ED25519, PARSEC, or Unix-socket authentication in place of ordinary password credentials**. Passwords are used in `.env` for local setup and by HTTP Basic clients; the registrar's password is provided to the API through an environment variable.
- **Still to verify in an actual run:** the scripts must be executed against a compatible MariaDB 13.1 image to establish observed PASS results. No runtime logs or screenshots are supplied in this repository as proof of execution merely by documenting the commands.
- **Deployment limitations:** HTTP Basic is plaintext without HTTPS; API-to-MariaDB TLS certificate verification is absent; the audit plugin is opt-in, can capture sensitive SQL text, and logs to a local database volume. Use a secure transport and off-host log management before considering real-world use.

This separation is intentional: **a working role tutorial is not evidence that every Area 5 security requirement has been completed**.

## 9. Repository map

```text
.
├── README.md                           # Main walkthrough
├── .env.example                        # Local environment template
├── docker-compose.yml                  # MariaDB 13.1 + Express API
├── docker-compose.audit.yml            # Optional Server Audit override
├── database/
│   ├── init/
│   │   ├── 01-schema.sql               # Schema, view, seed record
│   │   └── 02-security.sh              # SQL-template loader
│   ├── security/
│   │   ├── 01-accounts.sql.in          # MariaDB accounts
│   │   ├── 02-roles.sql.in             # GRANT, DENY, default roles
│   │   └── 03-self-service.sql.in      # Registration/password routines
│   ├── examples/                      # Inspect, revoke, DENY SQL demos
│   └── audit/                         # Optional Server Audit config
├── src/                                # Express API, configuration, DB connections
├── scripts/
│   ├── test-rbac-local.sh              # Disposable direct-DB test suite
│   ├── test-api.mjs                    # HTTP permission checks
│   ├── test-security-audit-local.sh    # Optional audit attack suite
│   └── verify-audit-log.py             # Audit-log assertions
└── INTEGRATION.md                      # Backend extension guidance
```

For the current implementation, use **the SQL, source files, and this root README as authoritative**. The full documentation for authentication, access control, and security auditing is consolidated here.

## 10. Team and contributions

This is a Constructor University **CO-560 Database Core** student project. The project contributions are summarized below:

| Contributor | Documented area |
| --- | --- |
| **Sarp** | MariaDB-backed authentication, API integration, account creation, and password lifecycle |
| **Batuhan** | MariaDB roles, permission assignments, and role-based access control |
| **Omer** | MariaDB roles, configs, permissions and tests | 
| **Vedant** | Server Audit configuration, negative/attack tests, and evidence validation |

## References

- [MariaDB student projects — Area 5 and evaluation criteria](https://mariadb.org/bachelor_hackathon_2026-09/)
- [MariaDB 13.1: `DENY` / negative grants](https://mariadb.org/mariadb-13-1-feature-in-focus-deny-negative-grants/)
- [MariaDB user account management](https://mariadb.com/docs/server/security/user-account-management)
- [MariaDB authentication plugins](https://mariadb.com/docs/server/reference/plugins/authentication-plugins)
- [MariaDB Server Audit plugin](https://mariadb.com/docs/server/reference/plugins/mariadb-audit-plugin)
