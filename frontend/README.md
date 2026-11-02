# Access control lab frontend

React, TypeScript and Vite UI for internal testing of the existing MariaDB API. The backend enforces all permissions using each caller's MariaDB credentials. Credentials remain in component memory and reload signs out.

## Run

Start the repository's backend using its root README, then:

```sh
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. Development and local preview proxy `/api` and `/health` to http://127.0.0.1:3000. Set `API_PROXY_TARGET` when the backend uses another port. No backend CORS or authentication changes are required.

With the backend offline, use http://127.0.0.1:5173/?preview=1. This isolated preview uses a fictional identity, the initial directory fixture, and an empty audit table. It sends no backend requests.

## Supported screens

- Overview of identity, active role, directory and audit-table access.
- Search directory rows and submit username updates.
- Read and filter the audit table, including stored IP and creation time when rows exist.
- Reference matrix for seeded roles.
- Read-only access checks against existing endpoints.
- Sign-in and read-only account registration.

Course guide and Account settings have been removed. The audit table is not an automatically collected login history: the current backend reads it but never inserts events or captures client IPs. The optional MariaDB Server Audit file is not exposed by the API. See [API_CONTRACT.md](API_CONTRACT.md) for fields, limitations and exact request contracts.

## Verification

```sh
npm run build
npm run test:api # requires repository root dependencies
npx playwright install chromium
npm test
```

Transport tests run without a backend. Browser workflow tests use controlled responses. For the live smoke test, start the backend, set `CO560_USERNAME` and `CO560_PASSWORD` in the environment, and run `npm test -- live-api.spec.ts`. It is skipped when credentials are absent. Do not commit credentials.

The latest contract review was performed with the backend offline; live database enforcement is not claimed as freshly verified. This interface is for the local internal lab and does not add production hosting or security configuration.
