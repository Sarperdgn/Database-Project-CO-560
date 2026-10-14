# Backend integration

The authoritative security policy is in [`database/security`](database/security), with the schema and directory view in [`database/init/01-schema.sql`](database/init/01-schema.sql).

Each request must execute SQL through a connection authenticated as that caller's real MariaDB account. `src/db.ts` exposes `connectAs(username, password)`; `src/app.ts` demonstrates connection ownership, parameter binding, error translation, and cleanup. The runtime has only database host/port/name configuration, no stored database account credentials.

For a new route, use the existing `databaseRoute` wrapper in `src/app.ts`. Validate inputs, execute a fixed parameterized statement on its supplied connection, and return the result. Add required privileges to the appropriate MariaDB role in SQL. Do not introduce a shared privileged pool, a user-selected role, or TypeScript permission checks as the authorization boundary. Test both the SQL directly and the route with allowed and disallowed database accounts.

`CURRENT_USER()` identifies the authenticated MariaDB account; `CURRENT_ROLE()` reports the active role. An `app_users.id` is sample domain data, not an authenticated principal. The previous `requireAuth`, application registration, and JWT contract has been removed. See [README.md](README.md) for endpoints, fresh-volume setup, and local transport limitations.
