GRANT UPDATE, DELETE ON auth_project.login_audit TO role_auditor;

SHOW GRANTS FOR role_auditor;

REVOKE DENY UPDATE, DELETE ON auth_project.login_audit FROM role_auditor;

DENY UPDATE, DELETE ON auth_project.login_audit TO role_auditor;
REVOKE UPDATE, DELETE ON auth_project.login_audit FROM role_auditor;
