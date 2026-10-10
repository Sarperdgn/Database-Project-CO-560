# Integration Notes

This module is intentionally isolated so the rest of the team can merge it
without depending on the internal password-handling code.

## Contract for other backend modules

Protect any Express route with:

```ts
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./auth/auth.middleware.js";

router.get(
  "/example",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.userId;

    // Use userId as the authenticated identity in your own tables.
    res.json({ userId });
  },
);
```

The authentication layer exposes only `userId`. Authorization/RBAC can be
implemented on top of this without changing password handling.

## Foreign keys from other tables

Other teammates may reference:

```sql
user_id BIGINT UNSIGNED NOT NULL,
CONSTRAINT fk_example_user
  FOREIGN KEY (user_id) REFERENCES app_users(id)
```

## Do not do these things

- Do not store plaintext passwords.
- Do not let the API connect as MariaDB `root`.
- Do not give the runtime service account `GRANT OPTION`, `DROP`, or `ALTER`.
- Do not trust a `userId` sent in the request body when the route is authenticated.
  Use `req.auth.userId`.
- Do not log passwords or JWT secrets.

## Team merge suggestion

Sarp's branch can own:

- `docker-compose.yml`
- `Dockerfile`
- `database/init/*`
- `src/auth/*`
- `src/config.ts`
- `src/db.ts`

Other team members should import `requireAuth` rather than changing the
authentication code directly.
