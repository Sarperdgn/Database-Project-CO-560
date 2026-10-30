-- Fine-Grained Access Control, Role Inheritance & Conflicting Permissions (MariaDB 13.1).
-- Demonstrates restricted views, column-level vs object-level privileges,
-- SQL SECURITY DEFINER context, multi-role inheritance, conflicting GRANT/DENY
-- resolution across roles and privilege hierarchies, and mysql.global_priv JSON storage.

-- 1. Inspect the restricted view definition, columns, and persistent DENY storage (run as root):
SHOW CREATE VIEW auth_project.user_directory;
SHOW COLUMNS FROM auth_project.user_directory;
SHOW GRANTS FOR role_readonly;
SHOW GRANTS FOR role_employee;
SHOW GRANTS FOR role_auditor;
SELECT User, Host, JSON_PRETTY(JSON_EXTRACT(Priv, '$.denies')) AS denies
  FROM mysql.global_priv
  WHERE User IN ('role_auditor', 'role_employee', 'role_readonly');

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

-- 4. Multi-Level Role Inheritance and Conflicting Permissions Across Roles (run as root):
-- A) Role inheritance (role_readonly + role_employee -> role_support_lead):
CREATE ROLE role_support_lead;
GRANT role_readonly TO role_support_lead;
GRANT role_employee TO role_support_lead;
GRANT role_support_lead TO 'project_reader'@'%';
-- Connect as project_reader and run:
-- SET ROLE role_support_lead;
-- SELECT id, email, username FROM auth_project.user_directory;            --> ALLOWED (via role_readonly)
-- UPDATE auth_project.app_users SET username = 'lead_edit' WHERE id = 1;  --> ALLOWED (via role_employee)
-- SELECT password_hash FROM auth_project.app_users WHERE id = 1;          --> ERROR 1143 (still blocked)
REVOKE role_support_lead FROM 'project_reader'@'%';
DROP ROLE role_support_lead;

-- B) Conflicting permissions in role inheritance (inherited DENY beats inherited GRANT):
CREATE ROLE role_audit_editor;
GRANT SELECT (id), UPDATE, DELETE ON auth_project.login_audit TO role_audit_editor;
CREATE ROLE role_compliance_lead;
GRANT role_auditor TO role_compliance_lead;      -- carries SELECT + DENY UPDATE, DELETE
GRANT role_audit_editor TO role_compliance_lead; -- carries GRANT UPDATE, DELETE
GRANT role_compliance_lead TO 'project_auditor'@'%';
-- Connect as project_auditor and run:
-- SET ROLE role_compliance_lead;
-- UPDATE auth_project.login_audit SET reason = 'conflict' WHERE id = 999999999; --> ERROR 1142 (inherited DENY wins)
REVOKE role_auditor FROM role_compliance_lead;
-- Now under SET ROLE role_compliance_lead, UPDATE succeeds via role_audit_editor.
DROP ROLE role_compliance_lead;
DROP ROLE role_audit_editor;

-- C) Direct user GRANT vs inherited role DENY (and direct user DENY vs inherited role GRANT):
GRANT UPDATE ON auth_project.login_audit TO 'project_auditor'@'%';
-- Connect as project_auditor (default role role_auditor active):
-- UPDATE auth_project.login_audit SET reason = 'direct' WHERE id = 999999999; --> ERROR 1142 (role DENY beats user GRANT)
REVOKE UPDATE ON auth_project.login_audit FROM 'project_auditor'@'%';

DENY UPDATE (username) ON auth_project.app_users TO 'project_employee'@'%';
-- Connect as project_employee (default role role_employee active):
-- UPDATE auth_project.app_users SET username = 'direct_deny' WHERE id = 1;    --> ERROR 1143 (user DENY beats role GRANT)
REVOKE DENY UPDATE (username) ON auth_project.app_users FROM 'project_employee'@'%';

-- 5. MariaDB 13.1 Hierarchy Propagation & Fine-Grained DENY (run as root):
-- A) Column-level DENY overrides an existing column-level GRANT UPDATE (username):
DENY UPDATE (username) ON auth_project.app_users TO role_employee;
SHOW GRANTS FOR role_employee;
-- Connect as project_employee: UPDATE (username) is rejected with ERROR 1143.
REVOKE DENY UPDATE (username) ON auth_project.app_users FROM role_employee;

-- B) Table-level DENY propagates downward and masks column-level GRANT UPDATE (username):
DENY UPDATE ON auth_project.app_users TO role_employee;
-- Connect as project_employee: UPDATE (username) is rejected even though column GRANT remains.
REVOKE DENY UPDATE ON auth_project.app_users FROM role_employee;

-- C) Schema-wide GRANT with table-level DENY ("everything in this schema except that table"):
GRANT SELECT ON auth_project.* TO role_readonly;
DENY SELECT ON auth_project.app_users TO role_readonly;
DENY SELECT ON auth_project.login_audit TO role_readonly;
-- Connect as project_reader:
-- SELECT * FROM auth_project.user_directory;  --> succeeds (covered by auth_project.*)
-- SELECT * FROM auth_project.app_users;       --> rejected with ERROR 1142 (table DENY beats db GRANT)
-- SELECT * FROM auth_project.login_audit;     --> rejected with ERROR 1142 (table DENY beats db GRANT)
REVOKE DENY SELECT ON auth_project.app_users FROM role_readonly;
REVOKE DENY SELECT ON auth_project.login_audit FROM role_readonly;
REVOKE SELECT ON auth_project.* FROM role_readonly;

-- D) Column-level DENY on a view ("everything except" column carve-out from broad SELECT):
DENY SELECT (email) ON auth_project.user_directory TO role_readonly;
-- Connect as project_reader:
-- SELECT id, username FROM auth_project.user_directory;  --> succeeds
-- SELECT * FROM auth_project.user_directory;             --> rejected with ERROR 1143 (email column denied)
-- SELECT email FROM auth_project.user_directory;         --> rejected with ERROR 1143
REVOKE DENY SELECT (email) ON auth_project.user_directory FROM role_readonly;

-- E) Routine-level DENY overrides GRANT EXECUTE ON PROCEDURE:
DENY EXECUTE ON PROCEDURE auth_project.change_own_password TO role_readonly;
-- Connect as project_reader: CALL change_own_password('new-valid-password-123') --> rejected with ERROR 1370
REVOKE DENY EXECUTE ON PROCEDURE auth_project.change_own_password FROM role_readonly;
