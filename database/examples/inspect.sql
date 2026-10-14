-- Connect as a tutorial account to inspect the identity and active role.
SELECT CURRENT_USER() AS authenticated_account, CURRENT_ROLE() AS active_role;
SHOW GRANTS;

-- Reader/employee/admin: succeeds. Auditor: rejected with error 1142.
SELECT id, email, username FROM user_directory;
-- Reader: rejected with error 1142. Employee: rejected with error 1143.
SELECT password_hash FROM app_users;
-- Employee/admin: succeeds. Reader/auditor: rejected.
START TRANSACTION;
UPDATE app_users SET username = 'permission_demo' WHERE id = 1;
ROLLBACK;
-- Auditor/admin: succeeds. Reader/employee: rejected.
SELECT * FROM login_audit;
-- Reader: rejected with error 1959, since this role was never granted to it.
SET ROLE role_admin;
