## MariaDB Roles and Role-Based Access Control

This part of the project implements MariaDB roles and role-based access control (RBAC).
The main goal is to give each database user only the permissions that are required for its task.

The RBAC configuration is implemented in: database/init/03-create-roles.sh



# Roles
Three MariaDB roles are used:
    Role	              Purpose
role_admin        	Full administrative access
role_auth_service	Access required by the authentication service
role_readonly	    Read-only database access



# Permissions
- The admin role has full access to the project database:
GRANT ALL PRIVILEGES
ON auth_project.*
TO role_admin;


- The authentication service role has limited access.

For app_users:
GRANT SELECT, INSERT, UPDATE
ON auth_project.app_users
TO role_auth_service;


- For login_audit:

GRANT INSERT
ON auth_project.login_audit
TO role_auth_service;


- The read-only role can only read data:
GRANT SELECT
ON auth_project.*
TO role_readonly;



# Role Assignments
The existing MariaDB users are connected to the roles:
auth_service -> role_auth_service
project_reader -> role_readonly

The roles are set as default roles so they are automatically active when the users connect to MariaDB.



# GRANT and REVOKE
The original setup gave privileges directly to the database users.
In the RBAC setup these direct privileges are removed with REVOKE and the permissions are assigned to roles instead.

The access structure therefore becomes: User -> Role -> Privileges

instead of: User -> Privileges

Principle of Least Privilege
The authentication service only receives the permissions needed for authentication.

- For app_users:
SELECT   allowed
INSERT   allowed
UPDATE   allowed
DELETE   denied

- For login_audit:
INSERT   allowed
UPDATE   denied
DELETE   denied

The authentication service does not receive administrative permissions such as DROP, ALTER, or GRANT OPTION.
The read-only user only receives SELECT permission and cannot modify database data.



# Verification
The created users and roles were checked with:

SELECT User, Host, is_role
FROM mysql.user
WHERE User IN (
    'role_admin',
    'role_auth_service',
    'role_readonly',
    'auth_service',
    'project_reader'
);


The privileges and role assignments were checked with:

SHOW GRANTS FOR role_auth_service;
SHOW GRANTS FOR role_readonly;
SHOW GRANTS FOR 'auth_service'@'%';
SHOW GRANTS FOR 'project_reader'@'%';



# Access-Control Tests
* The active role of each user was checked with:
SELECT CURRENT_ROLE();

* For auth_service, the active role was:
role_auth_service

The following tests were performed:
    Operation	            Result
SELECT * FROM app_users 	Allowed
DELETE FROM app_users	    Denied
INSERT INTO login_audit 	Allowed
UPDATE login_audit	        Denied


* For project_reader, the active role was:
role_readonly

The following tests were performed:
    Operation	            Result
SELECT * FROM app_users 	Allowed
UPDATE app_users	        Denied
INSERT INTO login_audit	    Denied
DELETE FROM app_users	    Denied


The test results show that the configured roles correctly allow required operations and reject unauthorized operations.

This demonstrates:
- MariaDB role creation
- Role assignment
- GRANT
- REVOKE
- Database-level privileges
- Table-level privileges
- Principle of least privilege
- Allowed and denied access tests



# TypeScript RBAC Implementation

In addition to the MariaDB initialization script, the RBAC logic was also implemented in TypeScript and connected to the API.

The main RBAC files are:

src/rbac/
├── rbac.types.ts
├── rbac.bootstrap.ts
├── run-rbac-bootstrap.ts
├── rbac.service.ts
├── rbac.routes.ts
└── rbac.reader.ts


* RBAC Bootstrap
rbac.bootstrap.ts contains the main RBAC setup logic.
It is responsible for:
- creating MariaDB roles
- revoking old direct privileges
- granting privileges to roles
- assigning roles to database users
- configuring default roles

The bootstrap can be executed with --> npm run rbac:bootstrap
run-rbac-bootstrap.ts is the entry point that starts the bootstrap process.


* RBAC Service
rbac.service.ts contains the main RBAC database logic used by the API.
It is used to:
- get the current active role
- read role grants
- create permission summaries
- test allowed and denied database operations

The test operations are executed inside transactions and rolled back so that test data is not permanently stored.


* Read-Only Database Connection
" rbac.reader.ts " creates a separate database connection for the project_reader user.
This allows the role_readonly permissions to be tested using the actual read-only database user


* RBAC API
The RBAC functionality is exposed through the following API endpoints.
Current Role --> GET /api/rbac/current-role

Returns the currently active MariaDB role


* Role Grants
GET /api/rbac/roles/:role/grants
Returns the privileges assigned to the selected role.


* Permission Summary
GET /api/rbac/permissions
Returns a simplified summary of the permissions of the current role.


* Authentication Service Permission Test
POST /api/rbac/test

Supported operations:
- select_app_users
- delete_app_users
- insert_login_audit
- update_login_audit


Expected results for role_auth_service:

      Operation	        Result
   select_app_users	    Allowed
   delete_app_users	    Denied
  insert_login_audit	Allowed
  update_login_audit	Denied



* Read-Only Permission Test
POST /api/rbac/test-readonly

Expected results for role_readonly:

       Operation	    Result
   select_app_users	    Allowed
   delete_app_users 	Denied
  insert_login_audit	Denied
  update_login_audit	Denied


These API tests confirm that each role only has the permissions required for its task and that unauthorized database operations are rejected.