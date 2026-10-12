-- Run as root, using the configured project database (default auth_project).
-- In a second terminal, connect as project_reader and try:
-- SELECT * FROM user_directory;
REVOKE SELECT ON auth_project.user_directory FROM role_readonly;
-- A new reader connection now receives error 1142. Restore access with:
GRANT SELECT ON auth_project.user_directory TO role_readonly;
-- REVOKE removes a grant. It is not a negative permission that overrides
-- privileges inherited from another role or a broader database grant.
