# Authentication and API architecture

The API now authenticates directly with MariaDB as the caller, using a fresh connection per HTTP request. There is no shared service account, Argon2 application login, or JWT role decision. MariaDB authenticates the username/password and enforces the caller's default role.

- Account authentication SQL: [`database/security/01-accounts.sql.in`](database/security/01-accounts.sql.in)
- Connection creation: [`src/db.ts`](src/db.ts)
- HTTP examples and error translation: [`src/app.ts`](src/app.ts)
- Integration contract: [`INTEGRATION.md`](INTEGRATION.md)
- Setup, walkthrough, and limitations: [`README.md`](README.md)

The old `app_users` columns remain as sample protected data. Rows in that table do not represent MariaDB login accounts. HTTP Basic and the database connection are intended only for this local tutorial until verified transport encryption is configured.
