export const DB_ROLES = {
  ADMIN: "role_admin",
  AUTH_SERVICE: "role_auth_service",
  READONLY: "role_readonly",
} as const;

export type DatabaseRole =
  (typeof DB_ROLES)[keyof typeof DB_ROLES];

export type GrantInfo = {
  role: string;
  grants: string[];
};

export type CurrentRoleInfo = {
  currentRole: string | null;
};

export type PermissionSummary = {
  role: string | null;
  permissions: Record<string, string[]>;
};

export const RBAC_TEST_OPERATIONS = {
  SELECT_APP_USERS: "select_app_users",
  DELETE_APP_USERS: "delete_app_users",
  INSERT_LOGIN_AUDIT: "insert_login_audit",
  UPDATE_LOGIN_AUDIT: "update_login_audit",
} as const;

export type RbacTestOperation =
  (typeof RBAC_TEST_OPERATIONS)[keyof typeof RBAC_TEST_OPERATIONS];

export type RbacTestResult = {
  operation: RbacTestOperation;
  allowed: boolean;
  message: string;
};