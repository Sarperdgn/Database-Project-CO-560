# Frontend contract with the existing backend

Checked against `src/app.ts`, `src/db.ts`, `database/init/01-schema.sql` and the role SQL on 2026-11-02. No backend changes were made for this review.

| UI action | Request | Backend response / behavior |
| --- | --- | --- |
| Sign in / refresh identity | GET /api/me, HTTP Basic | Array containing `{account, role}`; role can be null. Each request authenticates directly with MariaDB. |
| Directory | GET /api/users, HTTP Basic | `{id, email, username}[]`, ordered by ID ascending, maximum 100 rows. These are domain records, not database accounts. |
| Edit username | PATCH /api/users/:id, HTTP Basic, `{username}` | 3 to 50 ASCII letters, digits, underscores, periods or hyphens. Returns `Update executed`, even if no row matched. UI reports execution, then reloads; it does not claim a row count or confirmed persistence. |
| Audit table | GET /api/audit, HTTP Basic | `SELECT * FROM login_audit ORDER BY id DESC LIMIT 100`. Empty on fresh initialization. |
| Register | POST /api/auth/register, `{username, password}` | `signup_` followed by 3 to 24 lowercase letters, digits or underscores; password length 12 to 128. Returns HTTP 201 with username. Provisions a MariaDB read-only account, not a directory row. |
| Access lab availability | GET /health | `{status: "ok"}` confirms the API process only, not database connectivity. |

The password-change endpoint still exists in the backend but is not exposed in this UI, per the requested removal of Account settings. No role editing, account deletion, SQL console, or server-audit-file endpoint is available.

## IP addresses and timestamps

`login_audit` contains `id`, nullable `user_id`, `attempted_email`, `success`, `reason`, nullable `ip_address`, and `created_at`. The timestamp defaults to CURRENT_TIMESTAMP when a row is inserted. IP is a nullable string with no automatic capture or default.

The current API contains no INSERT into this table, no client-IP capture, and no login-event writer. Signing in, registration, refresh, and access checks do not create table rows. The UI displays only returned values, labels absent IPs as Not recorded, and explains the empty state. Offset-bearing timestamps display in the browser's timezone with seconds and a timezone label. Timezone-free strings are preserved instead of assigning an unverified timezone. The backend driver’s timezone configuration is not changed.

The optional MariaDB Server Audit plugin writes CONNECT/QUERY events to a file in the database container. That file is distinct from login_audit and cannot be read through this API. It must not be presented as a live browser-IP feed.

## Offline preview and verification

`/?preview=1` is isolated from API requests. It shows the schema's initial student directory fixture and an empty audit table, with an explicitly fictional administrator identity. It does not authenticate, modify rows, or verify permissions.

Frontend production build and transport tests can run without a backend. Browser workflow tests use controlled responses; the opt-in live test requires a running backend and CO560_USERNAME / CO560_PASSWORD. Code-contract alignment does not establish live end-to-end correctness while the backend is offline.
