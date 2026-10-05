import { readonlyDb } from "./rbac.reader.js";
import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import {
  RBAC_TEST_OPERATIONS,
  type CurrentRoleInfo,
  type GrantInfo,
  type PermissionSummary,
  type RbacTestOperation,
  type RbacTestResult,
} from "./rbac.types.js";

type CurrentRoleRow = RowDataPacket & {
  currentRole: string | null;
};

type GrantRow = RowDataPacket & {
  Grants_for_role_auth_service?: string;
  Grants_for_role_readonly?: string;
  [key: string]: string | undefined;
};

export async function getCurrentRole(): Promise<CurrentRoleInfo> {
  const [rows] = await db.query<CurrentRoleRow[]>(
    "SELECT CURRENT_ROLE() AS currentRole",
  );

  return {
    currentRole: rows[0]?.currentRole ?? null,
  };
}

export async function getRoleGrants(role: string): Promise<GrantInfo> {
  if (!/^[A-Za-z0-9_]+$/.test(role)) {
    throw new Error("Invalid role name");
  }

  const [rows] = await db.query<GrantRow[]>(
    `SHOW GRANTS FOR \`${role}\``,
  );

  const grants = rows.map((row) => {
    const value = Object.values(row)[0];
    return value ?? "";
  });

  return {
    role,
    grants,
  };
}

export async function getPermissionSummary(): Promise<PermissionSummary> {
  const { currentRole } = await getCurrentRole();

  if (!currentRole) {
    return {
      role: null,
      permissions: {},
    };
  }

  const { grants } = await getRoleGrants(currentRole);

  const permissions: Record<string, string[]> = {};

  for (const grant of grants) {
    const match = grant.match(
      /^GRANT (.+) ON `([^`]+)`\.`([^`*]+|\*)` TO/,
    );

    if (!match) {
      continue;
    }

    const privilegeList = match[1];
    const table = match[3];

    if (!privilegeList || !table) {
      continue;
    }

    const privileges = privilegeList
      .split(",")
      .map((privilege) => privilege.trim());

    permissions[table] = privileges;
  }

  return {
    role: currentRole,
    permissions,
  };
}

export async function testRbacOperation(
  operation: RbacTestOperation,
): Promise<RbacTestResult> {
  try {
    switch (operation) {
      case RBAC_TEST_OPERATIONS.SELECT_APP_USERS:
        await db.query(
          "SELECT id FROM app_users LIMIT 1",
        );
        break;

      case RBAC_TEST_OPERATIONS.DELETE_APP_USERS:
        await db.query(
          "DELETE FROM app_users WHERE id = 999999999",
        );
        break;

      case RBAC_TEST_OPERATIONS.INSERT_LOGIN_AUDIT:
        await db.query(
          `INSERT INTO login_audit
           (attempted_email, success, reason)
           VALUES (?, ?, ?)`,
          ["rbac-api-test@example.com", false, "RBAC_API_TEST"],
        );
        break;

      case RBAC_TEST_OPERATIONS.UPDATE_LOGIN_AUDIT:
        await db.query(
          `UPDATE login_audit
           SET reason = ?
           WHERE id = 999999999`,
          ["RBAC_API_CHANGED"],
        );
        break;

      default:
        throw new Error("Unknown RBAC test operation");
    }

    return {
      operation,
      allowed: true,
      message: "Operation allowed",
    };
  } catch (error) {
    const dbError = error as {
      errno?: number;
      code?: string;
      message?: string;
    };

    if (
      dbError.errno === 1142 ||
      dbError.code === "ER_TABLEACCESS_DENIED_ERROR"
    ) {
      return {
        operation,
        allowed: false,
        message: dbError.message ?? "Operation denied",
      };
    }

    throw error;
  }
}

export async function testReadonlyOperation(
  operation: RbacTestOperation,
): Promise<RbacTestResult> {
  const connection = await readonlyDb.getConnection();

  try {
    await connection.beginTransaction();

    switch (operation) {
      case "select_app_users":
        await connection.query(
          "SELECT id, email, username FROM app_users LIMIT 1",
        );
        break;

      case "delete_app_users":
        await connection.query(
          "DELETE FROM app_users WHERE id = 999999999",
        );
        break;

      case "insert_login_audit":
        await connection.query(
          `INSERT INTO login_audit
           (attempted_email, success, reason)
           VALUES (?, ?, ?)`,
          ["reader-api-test@example.com", false, "READER_API_TEST"],
        );
        break;

      case "update_login_audit":
        await connection.query(
          `UPDATE login_audit
           SET reason = ?
           WHERE id = 999999999`,
          ["READER_API_TEST_CHANGED"],
        );
        break;
    }

    await connection.rollback();

    return {
      operation,
      allowed: true,
      message: "Operation allowed by the readonly database role.",
    };
  } catch (error) {
    await connection.rollback();

    if (
      typeof error === "object" &&
      error !== null &&
      "errno" in error &&
      (error as { errno?: number }).errno === 1142
    ) {
      return {
        operation,
        allowed: false,
        message: "Operation denied by MariaDB privileges.",
      };
    }

    throw error;
  } finally {
    connection.release();
  }
}