-- Fine-Grained Access Control & Database Security examples (MariaDB 13.1).
-- Demonstrates restricted views, column-level vs object-level privileges,
-- SQL SECURITY DEFINER context, and MariaDB 13.1 column-level DENY.

-- 1. Inspect the restricted view definition and exposed columns (run as root/admin):
SHOW CREATE VIEW auth_project.user_directory;
SHOW COLUMNS FROM auth_project.user_directory;
SHOW GRANTS FOR role_readonly;
SHOW GRANTS FOR role_employee;

-- 2. Object-level restriction (connect as project_reader):
-- Succeeds: reader has SELECT on the user_directory view.
SELECT id, email, username FROM auth_project.user_directory;
-- Rejected with ERROR 1142: reader has no privilege on the base table app_users.
SELECT password_hash FROM auth_project.app_users;

-- 3. Column-level restriction (connect as project_employee):
-- Succeeds: employee has SELECT (id) and UPDATE (username) on app_users.
SELECT id FROM auth_project.app_users WHERE id = 1;
START TRANSACTION;
UPDATE auth_project.app_users SET username = 'employee_column_demo' WHERE id = 1;
ROLLBACK;
-- Rejected with ERROR 1143: employee has no SELECT or UPDATE privilege on password_hash.
SELECT password_hash FROM auth_project.app_users WHERE id = 1;
UPDATE auth_project.app_users SET password_hash = 'unauthorized_hash' WHERE id = 1;

-- 4. MariaDB 13.1 column-level DENY precedence (run as root):
-- Explicitly deny updating the username column even though GRANT UPDATE (username) exists.
DENY UPDATE (username) ON auth_project.app_users TO role_employee;
SHOW GRANTS FOR role_employee;
-- Now connect as project_employee: UPDATE (username) is rejected with ERROR 1143.
-- Restore original policy:
REVOKE DENY UPDATE (username) ON auth_project.app_users FROM role_employee;

-- Column-level DENY on a restricted view (run as root):
DENY SELECT (email) ON auth_project.user_directory TO role_readonly;
-- Now connect as project_reader:
-- SELECT id, username FROM auth_project.user_directory;  --> succeeds
-- SELECT email FROM auth_project.user_directory;         --> rejected with ERROR 1143
REVOKE DENY SELECT (email) ON auth_project.user_directory FROM role_readonly;
