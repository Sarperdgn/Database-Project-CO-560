# Fine-Grained Access Control & Database Security

**Author:** Ömer Faruk Koçtürk  
**Course:** Databases & Web Services (CO-560)  
**Project Area:** MariaDB Authentication & Access Control (Area 5)  
**Target Environment:** MariaDB Server 11.8.9

---

## Overview

This module covers the design and implementation of **fine-grained access control** and database security within MariaDB. While general Role-Based Access Control (RBAC) assigns coarse table-level or database-level permissions to roles, fine-grained access control hardens the database further to strictly enforce the **Principle of Least Privilege**:
1. Protecting sensitive cryptographic credentials and security counters using restricted views.
2. Differentiating between object-level and column-level privileges.
3. Leveraging `SQL SECURITY DEFINER` views to expose specific data without granting base-table access.
4. Testing and documenting unauthorized access scenarios and MariaDB's rejection mechanisms.

---

## 1. Restricted Views for Sensitive Information

The primary `app_users` table contains both public directory information and sensitive authentication metadata:

```sql
CREATE TABLE app_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    token_version INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ...
);
```

### The `user_directory` View
To prevent clients, directory consumers, and read-only users from accessing sensitive authentication internals, we implemented the restricted view `user_directory` in `database/init/01-schema.sql`:

```sql
CREATE SQL SECURITY DEFINER VIEW user_directory AS
  SELECT id, email, username FROM app_users;
```

* **Exposed Columns:** `id`, `email`, `username`.
* **Hidden Sensitive Columns:** `password_hash`, `is_active`, `failed_login_attempts`, `locked_until`, `token_version`.

Consumers querying `user_directory` can search and list users without any possibility of extracting password hashes or lock timestamps.

---

## 2. Column-Level vs. Object-Level Access Control

We defined distinct tiers of granular access in `database/security/02-roles.sql.in`:

### Object-Level Restrictions (`role_readonly` / `project_reader`)
Rather than granting broad database-level or table-level permissions, `role_readonly` is granted access **strictly to the view**:
```sql
GRANT SELECT ON `auth_project`.user_directory TO role_readonly;
```
* **Permitted:** `SELECT * FROM user_directory;`
* **Denied:** `SELECT * FROM app_users;` (MariaDB rejects direct base table access).

### Column-Level Restrictions (`role_employee` / `project_employee`)
An employee account needs to update user profiles (such as changing a display username), but must never be allowed to inspect password hashes, elevate accounts, or alter passwords.

Instead of granting `UPDATE ON app_users`, we restrict access down to specific column names:
```sql
-- Read access to the public directory view
GRANT SELECT ON `auth_project`.user_directory TO role_employee;

-- Column-level write permission: only the username column can be modified
GRANT UPDATE (username) ON `auth_project`.app_users TO role_employee;

-- Column-level read permission: only id is readable to support the WHERE predicate
GRANT SELECT (id) ON `auth_project`.app_users TO role_employee;
```

If `project_employee` attempts to read `password_hash` or update another column like `is_active`, MariaDB intercepts the query at the engine level and rejects it.

---

## 3. Security-Related Database Configurations

### A. Context Escalation via `SQL SECURITY DEFINER`
* **Problem:** In MariaDB, if a view uses `SQL SECURITY INVOKER` (the default), MariaDB evaluates privileges against the caller. Because `role_readonly` has no permissions on the underlying `app_users` table, an invoker view query would fail with access denied.
* **Solution:** We explicitly specify `SQL SECURITY DEFINER` during view creation. MariaDB executes the view query with the privileges of the definer (the bootstrap administrator who created it). This safely exposes only `id`, `email`, and `username` while keeping `app_users` completely locked down from direct reads.

### B. MariaDB 11.8 Access Model (Withheld Grants vs. `DENY`)
MariaDB 11.8 does **not** feature an explicit SQL `DENY` statement (available in newer releases). In this pinned version:
* All permissions default to denied unless an explicit `GRANT` exists.
* Negative security policies are enforced by withholding privileges or utilizing `REVOKE`.
* Default roles automatically activate upon connection via `SET DEFAULT ROLE <role> FOR <user>@'%'`.

### C. Principle of Least Privilege Configurations
* **No Global Administrative Privileges:** Neither `role_employee`, `role_readonly`, nor `role_auditor` possess `CREATE USER`, `DROP`, `ALTER`, or `GRANT OPTION`.
* **Safe Literal Handling:** Security initialization executes with `SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES'` to ensure password and configuration strings cannot be injected.

---

## 4. Test Scenarios & Unauthorized Access Demonstrations

All security boundaries are verified automatically through `scripts/test-rbac-local.sh` and interactively through MariaDB CLI sessions.

### Summary of Tested Operations

| Actor | Action / SQL Query | Expected Result | MariaDB Response |
|---|---|---|---|
| **Reader** | `SELECT * FROM user_directory;` | **ALLOWED** | Returns `id, email, username` |
| **Reader** | `SELECT password_hash FROM app_users;` | **DENIED** | `ERROR 1142 (42000): SELECT command denied` |
| **Reader** | `UPDATE app_users SET username='bad' WHERE id=1;` | **DENIED** | `ERROR 1142 (42000): UPDATE command denied` |
| **Reader** | `SET ROLE role_admin;` (Role Escalation) | **DENIED** | `ERROR 1959 (OP000): Invalid role specification` |
| **Reader** | `SELECT * FROM login_audit;` | **DENIED** | `ERROR 1142 (42000): SELECT command denied` |
| **Employee** | `SELECT * FROM user_directory;` | **ALLOWED** | Returns `id, email, username` |
| **Employee** | `UPDATE app_users SET username='new_name' WHERE id=1;` | **ALLOWED** | Column update succeeds |
| **Employee** | `SELECT password_hash FROM app_users;` | **DENIED** | `ERROR 1143 (42000): SELECT command denied for column 'password_hash'` |
| **Employee** | `UPDATE app_users SET password_hash='hacked';` | **DENIED** | `ERROR 1143 (42000): UPDATE command denied for column 'password_hash'` |
| **Employee** | `DELETE FROM app_users WHERE id=1;` | **DENIED** | `ERROR 1142 (42000): DELETE command denied` |
| **Auditor** | `SELECT * FROM login_audit;` | **ALLOWED** | Reads audit trail |
| **Auditor** | `SELECT * FROM user_directory;` | **DENIED** | `ERROR 1142 (42000): SELECT command denied` |
| **Auditor** | `UPDATE login_audit SET reason='tampered';` | **DENIED** | `ERROR 1142 (42000): UPDATE command denied` |

---

## 5. Privilege Comparison Matrix

| Privilege / Resource | `role_admin` | `role_employee` | `role_readonly` | `role_auditor` |
|---|:---:|:---:|:---:|:---:|
| `SELECT ON user_directory` (View) | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Denied |
| `SELECT ON app_users` (Base Table) | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| `SELECT (id) ON app_users` (Column) | ✅ Allowed | ✅ Allowed | ❌ Denied | ❌ Denied |
| `SELECT (password_hash)` (Column) | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| `UPDATE (username) ON app_users` | ✅ Allowed | ✅ Allowed | ❌ Denied | ❌ Denied |
| `UPDATE (password_hash) ON app_users`| ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| `DELETE FROM app_users` | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| `SELECT ON login_audit` | ✅ Allowed | ❌ Denied | ❌ Denied | ✅ Allowed |
| `UPDATE/DELETE ON login_audit` | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| `DDL (CREATE / DROP / ALTER)` | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
