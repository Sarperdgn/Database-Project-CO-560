# MariaDB Student Project — Authentication & Project Architecture

**Owner:** Sarp  
**Project area:** Authentication & Access Control  
**Target MariaDB version:** MariaDB Server 11.8.9

## Architecture

```text
Client
  |
  | HTTP / JSON
  v
Express API
  |
  | parameterized SQL
  | auth_service account
  v
MariaDB
  |
  +-- app_users
  +-- login_audit
```

There are two distinct authentication layers:

1. **Application users** authenticate with email + password.
   Passwords are never stored directly; only Argon2id hashes are stored.
2. **MariaDB accounts** authenticate backend services to the database.
   The API uses `auth_service`, not `root`, and receives only the privileges it
   needs.

## Database design

### `app_users`

| Column | Purpose |
|---|---|
| `id` | Internal user identity |
| `email` | Unique login identifier |
| `username` | Unique public username |
| `password_hash` | Argon2id password hash |
| `is_active` | Account enable/disable flag |
| `failed_login_attempts` | Supports temporary lockout |
| `locked_until` | Lock expiration |
| `token_version` | Invalidates old JWTs after password change |
| `last_login_at` | Last successful authentication |
| timestamps | Creation/update metadata |

### `login_audit`

Stores successful/failed login events without storing passwords.

## API

### Register

`POST /api/auth/register`

```json
{
  "email": "student@example.com",
  "username": "student1",
  "password": "correct-horse-battery-staple"
}
```

### Login

`POST /api/auth/login`

```json
{
  "email": "student@example.com",
  "password": "correct-horse-battery-staple"
}
```

Successful registration/login returns an access token.

### Current user

`GET /api/auth/me`

Header:

```text
Authorization: Bearer <access-token>
```

### Change password

`POST /api/auth/change-password`

Header:

```text
Authorization: Bearer <access-token>
```

Body:

```json
{
  "currentPassword": "correct-horse-battery-staple",
  "newPassword": "another-long-password-value"
}
```

Changing the password increments `token_version`, which invalidates previously
issued tokens.

## Start the project

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Replace all example secrets in `.env`.

3. Build and start:

```bash
docker compose up --build
```

4. Check:

```bash
curl http://localhost:3000/health
```

Expected:

```json
{"status":"ok"}
```

## Example test flow

Register:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"sarp@example.com",
    "username":"sarp",
    "password":"this-is-a-test-password"
  }'
```

Login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"sarp@example.com",
    "password":"this-is-a-test-password"
  }'
```

## Verify MariaDB privileges

Enter the database as root:

```bash
docker compose exec db mariadb \
  -uroot -p"$MARIADB_ROOT_PASSWORD"
```

Then:

```sql
SHOW GRANTS FOR 'auth_service'@'%';
SHOW GRANTS FOR 'project_reader'@'%';
```

Expected design:

- `auth_service`: `SELECT`, `INSERT`, `UPDATE` on `app_users`; `INSERT` on
  `login_audit`
- `project_reader`: read-only access
- neither runtime account receives administrative privileges

## Security decisions

- Argon2id for application password hashing
- Parameterized SQL through `mysql2`
- Generic login failure message to reduce account enumeration
- Five failed attempts trigger a temporary 15-minute lock
- Login audit records
- JWTs expire after one hour
- Password change invalidates older tokens
- Helmet security headers
- Rate limiting around authentication routes
- MariaDB root account is not used by the application
- Least-privilege database grants

## What teammates should use

For protected routes, import:

```ts
requireAuth
```

After it succeeds:

```ts
req.auth!.userId
```

is the authenticated application user ID.

See `INTEGRATION.md` for the merge contract.
