# Omer Faruk — Fine-Grained Access Control & Database Security

**Project:** CO-560, Authentication and Access Control (Area 5)  
**Contribution:** Restricted views for sensitive data, column-level vs. object-level privilege enforcement, `SQL SECURITY DEFINER` context isolation, MariaDB 13.1 column-level `DENY` (negative grants), and unauthorized data access test scenarios.  
**Target Environment:** MariaDB Server `13.1` (`quay.io/mariadb-foundation/mariadb-devel:13.1`)

---

## Match to the Repository Architecture

This section builds directly on the repository's **MariaDB 13.1** architecture without modifying shared schema, role-bootstrap, or API files:

- **Database-enforced security:** All authentication and fine-grained privilege checks happen inside MariaDB itself on the caller's connection (`project_reader`, `project_employee`, `project_auditor`, `project_admin`). No JWTs or application-side permission maps are used.
- **Exact project schema:** Uses `auth_project.app_users`, `auth_project.login_audit`, and `auth_project.user_directory` exactly as defined in [`database/init/01-schema.sql`](database/init/01-schema.sql) and [`database/security/02-roles.sql.in`](database/security/02-roles.sql.in).
- **Clear separation of responsibilities:** Does not duplicate Batuhan's role-assignment test suite (`scripts/test-rbac-local.sh`) or Vedant's server audit plugin suite (`scripts/test-security-audit-local.sh`).

| File | Format | Purpose |
| --- | --- | --- |
| [`database/examples/fine-grained-security.sql`](database/examples/fine-grained-security.sql) | SQL | Interactive queries demonstrating restricted views, column-level grants, `ERROR 1142` vs `ERROR 1143`, and MariaDB 13.1 column-level `DENY`. |
| [`scripts/test-fine-grained-security-local.sh`](scripts/test-fine-grained-security-local.sh) | Bash | Isolated automated test suite that boots a disposable MariaDB 13.1 container, verifies every column/object/view/`DENY` boundary, and cleans up on exit. |
| [`Omer_README.md`](Omer_README.md) | Markdown | Technical documentation of MariaDB's fine-grained access control mechanisms and privilege comparison matrix. |

---

## 1. Restricted Views for Sensitive Information

The base table `app_users` stores public profile fields alongside sensitive security fields:

- **Public directory columns:** `id`, `email`, `username`
- **Sensitive columns:** `password_hash`, `is_active`, `failed_login_attempts`, `locked_until`, `token_version`, `last_login_at`, `created_at`, `updated_at`

To prevent read-only consumers and employees from reading password hashes or security state, [`database/init/01-schema.sql`](database/init/01-schema.sql) defines the `user_directory` view:

```sql
CREATE SQL SECURITY DEFINER VIEW user_directory AS
  SELECT id, email, username FROM app_users;
```

Querying `information_schema.COLUMNS` confirms that `user_directory` projects **only** `id, email, username`. Sensitive columns are completely absent from the view object.

---

## 2. Object-Level vs. Column-Level Access Restrictions

MariaDB enforces privileges at multiple granularities (database $\rightarrow$ table/view $\rightarrow$ column). Notably, MariaDB returns **different SQL error codes** depending on whether an operation is rejected at the object level or the column level:

- **`ERROR 1142 (42000)`:** Table/object-level command denied (`<command> command denied to user ... for table ...`).
- **`ERROR 1143 (42000)`:** Column-level command denied (`<command> command denied to user ... for column '<col>' in table ...`).

### A. Object-Level Restriction (`role_readonly` / `project_reader`)

`role_readonly` receives `SELECT` **only** on the `user_directory` view object, with zero privileges on `app_users` or `login_audit`:

```sql
GRANT SELECT ON `auth_project`.user_directory TO role_readonly;
```

- `SELECT id, email, username FROM user_directory;` $\rightarrow$ **ALLOWED**
- `SELECT id, username FROM app_users;` $\rightarrow$ **DENIED (`ERROR 1142`)**
- `SELECT password_hash FROM app_users;` $\rightarrow$ **DENIED (`ERROR 1142`)**

### B. Column-Level Restriction (`role_employee` / `project_employee`)

`role_employee` must be able to update a user's `username` in `app_users` (which requires reading `id` for the `WHERE id = ?` predicate), but must never read or modify `password_hash` or account lock columns:

```sql
GRANT SELECT ON `auth_project`.user_directory TO role_employee;
GRANT UPDATE (username) ON `auth_project`.app_users TO role_employee;
GRANT SELECT (id) ON `auth_project`.app_users TO role_employee;
```

- `SELECT id FROM app_users WHERE id = 1;` $\rightarrow$ **ALLOWED**
- `UPDATE app_users SET username = 'updated_name' WHERE id = 1;` $\rightarrow$ **ALLOWED**
- `SELECT password_hash FROM app_users WHERE id = 1;` $\rightarrow$ **DENIED (`ERROR 1143` — column privilege violation)**
- `SELECT email FROM app_users WHERE id = 1;` $\rightarrow$ **DENIED (`ERROR 1143` — employee can read `email` only through `user_directory`, not directly from `app_users`)**
- `UPDATE app_users SET password_hash = 'x' WHERE id = 1;` $\rightarrow$ **DENIED (`ERROR 1143`)**
- `UPDATE app_users SET is_active = 0 WHERE id = 1;` $\rightarrow$ **DENIED (`ERROR 1143`)**

---

## 3. Security-Related Database Configurations

### A. `SQL SECURITY DEFINER` vs. `SQL SECURITY INVOKER`

Views in MariaDB execute under one of two security contexts:

1. **`SQL SECURITY DEFINER` (used by `user_directory`):** MariaDB evaluates base-table privileges against the view's creator (`root@localhost`), while checking the caller's privileges against the view itself. This allows `project_reader` to query `user_directory` while having **no access** to `app_users`.
2. **`SQL SECURITY INVOKER`:** MariaDB evaluates base-table privileges against the calling user. As verified in `scripts/test-fine-grained-security-local.sh`, creating an `SQL SECURITY INVOKER` view over `app_users` and granting `SELECT` on it to `role_readonly` fails with **`ERROR 1356 (HY000)`** (`View ... references invalid table(s) or column(s) or function(s) or definer/invoker of view lack rights to use them`) because `project_reader` lacks privileges on `app_users`.

### B. MariaDB 13.1 Native `DENY` (Negative Grants) at Column and Table Level

MariaDB 13.1 introduces explicit **`DENY`** statements that take precedence over positive `GRANT` privileges:

1. **Table-level `DENY` (baseline in [`02-roles.sql.in`](database/security/02-roles.sql.in)):**
   ```sql
   DENY UPDATE, DELETE ON `auth_project`.login_audit TO role_auditor;
   ```
   Even if `GRANT UPDATE ON auth_project.login_audit TO role_auditor` is later issued, the explicit `DENY` overrides it (`ERROR 1142`).

2. **Column-level `DENY` on Base Tables:**
   ```sql
   DENY UPDATE (username) ON auth_project.app_users TO role_employee;
   ```
   Although `role_employee` holds `GRANT UPDATE (username) ON app_users`, adding a column-level `DENY` immediately blocks `UPDATE app_users SET username = ...` with **`ERROR 1143`**. Running `REVOKE DENY UPDATE (username) ON auth_project.app_users FROM role_employee;` restores the permission.

3. **Column-level `DENY` on Views:**
   ```sql
   DENY SELECT (email) ON auth_project.user_directory TO role_readonly;
   ```
   `role_readonly` has `GRANT SELECT ON user_directory` (all columns in the view), but the column-level `DENY` narrows access further:
   - `SELECT id, username FROM user_directory;` $\rightarrow$ **ALLOWED**
   - `SELECT email FROM user_directory;` $\rightarrow$ **DENIED (`ERROR 1143`)**

---

## 4. Privilege Level Comparison Matrix

| Resource / Operation | `project_admin` (`role_admin`) | `project_employee` (`role_employee`) | `project_reader` (`role_readonly`) | `project_auditor` (`role_auditor`) |
| --- | :---: | :---: | :---: | :---: |
| `SELECT id, username FROM user_directory` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Denied (`1142`) |
| `SELECT id FROM app_users` (base table) | ✅ Allowed | ✅ Allowed (column grant) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `SELECT email FROM app_users` (base table) | ✅ Allowed | ❌ Denied (`1143`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `SELECT password_hash FROM app_users` | ✅ Allowed | ❌ Denied (`1143`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `SELECT token_version, locked_until FROM app_users` | ✅ Allowed | ❌ Denied (`1143`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `UPDATE app_users SET username = ...` | ✅ Allowed | ✅ Allowed (column grant) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `UPDATE app_users SET password_hash = ...` | ✅ Allowed | ❌ Denied (`1143`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `UPDATE app_users SET is_active = ...` | ✅ Allowed | ❌ Denied (`1143`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `DELETE FROM app_users` | ✅ Allowed | ❌ Denied (`1142`) | ❌ Denied (`1142`) | ❌ Denied (`1142`) |
| `SELECT * FROM login_audit` | ✅ Allowed | ❌ Denied (`1142`) | ❌ Denied (`1142`) | ✅ Allowed |
| `UPDATE / DELETE ON login_audit` | ✅ Allowed | ❌ Denied (`1142`) | ❌ Denied (`1142`) | ❌ Denied (`1142`, explicit `DENY`) |

---

## 5. Running the Verification Suite

Run the isolated fine-grained security test script from the repository root:

```bash
bash -n scripts/test-fine-grained-security-local.sh
bash scripts/test-fine-grained-security-local.sh
```

The script boots a temporary MariaDB 13.1 container with its own disposable volume, verifies all 21 fine-grained access control assertions (including exact MariaDB error codes `1142`, `1143`, and `1356`), and removes the temporary stack on exit without touching your running development containers.
