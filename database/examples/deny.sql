-- MariaDB 13.1 GRANT vs DENY, Role Inheritance, and Conflicting Permissions Demo
-- Run administrative GRANT / DENY / CREATE ROLE statements as root, and test
-- queries as the corresponding project accounts.

-- ============================================================================
-- 1. Baseline Table-Level Conflict: DENY beats a later GRANT on the same role
-- ============================================================================
GRANT UPDATE, DELETE ON auth_project.login_audit TO role_auditor;
SHOW GRANTS FOR role_auditor;
-- Connect as project_auditor:
-- UPDATE login_audit SET reason = 'blocked' WHERE id = 999999999; --> ERROR 1142 (42000)

-- Lift only the negative grant; the positive GRANT now takes effect:
REVOKE DENY UPDATE, DELETE ON auth_project.login_audit FROM role_auditor;
-- Connect as project_auditor: UPDATE and DELETE now succeed.

-- Restore baseline immutability policy:
DENY UPDATE, DELETE ON auth_project.login_audit TO role_auditor;
REVOKE UPDATE, DELETE ON auth_project.login_audit FROM role_auditor;

-- ============================================================================
-- 2. Role Inheritance Conflict: Inherited DENY vs Inherited GRANT across roles
-- ============================================================================
CREATE ROLE role_audit_editor;
GRANT SELECT (id), UPDATE, DELETE ON auth_project.login_audit TO role_audit_editor;

CREATE ROLE role_compliance_lead;
-- Inherit both role_auditor (has DENY UPDATE, DELETE) and role_audit_editor (has GRANT UPDATE, DELETE):
GRANT role_auditor TO role_compliance_lead;
GRANT role_audit_editor TO role_compliance_lead;
GRANT role_compliance_lead TO 'project_auditor'@'%';

-- Connect as project_auditor and activate the composite role:
-- SET ROLE role_compliance_lead;
-- SELECT * FROM login_audit;                                      --> ALLOWED (inherited from role_auditor)
-- UPDATE login_audit SET reason = 'conflict' WHERE id = 999999999; --> ERROR 1142 (inherited DENY beats inherited GRANT)

-- Detach role_auditor from role_compliance_lead (leaving role_audit_editor + SELECT):
REVOKE role_auditor FROM role_compliance_lead;
-- Now under SET ROLE role_compliance_lead, UPDATE on login_audit is ALLOWED.

-- Clean up composite role demo:
DROP ROLE role_compliance_lead;
DROP ROLE role_audit_editor;

-- ============================================================================
-- 3. Direct User GRANT vs Active Role DENY
-- ============================================================================
GRANT UPDATE ON auth_project.login_audit TO 'project_auditor'@'%';
-- Connect as project_auditor (with default role role_auditor active):
-- UPDATE login_audit SET reason = 'direct_grant' WHERE id = 999999999; --> ERROR 1142 (role DENY blocks user GRANT)
REVOKE UPDATE ON auth_project.login_audit FROM 'project_auditor'@'%';
