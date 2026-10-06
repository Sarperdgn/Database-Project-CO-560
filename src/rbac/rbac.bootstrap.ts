import mysql from "mysql2/promise";
import { DB_ROLES } from "./rbac.types.js";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(
      `${name} may contain only letters, digits and underscores.`,
    );
  }

  return value;
}

function isMissingGrantError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const mariadbError = error as {
    errno?: number;
    code?: string;
  };

  return (
    mariadbError.errno === 1141 ||
    mariadbError.errno === 1147 ||
    mariadbError.code === "ER_NONEXISTING_GRANT" ||
    mariadbError.code === "ER_NONEXISTING_TABLE_GRANT"
  );
}

async function revokeIfPresent(
  connection: mysql.Connection,
  sql: string,
): Promise<void> {
  try {
    await connection.query(sql);
  } catch (error) {
    // Running the bootstrap more than once should not fail just because
    // a direct privilege has already been removed.
    if (!isMissingGrantError(error)) {
      throw error;
    }
  }
}

export async function bootstrapRbac(): Promise<void> {
  const database = requireIdentifier(
    requireEnv("MARIADB_DATABASE"),
    "MARIADB_DATABASE",
  );

  const authDbUser = requireIdentifier(
    requireEnv("AUTH_DB_USER"),
    "AUTH_DB_USER",
  );

  const readonlyDbUser = requireIdentifier(
    requireEnv("READONLY_DB_USER"),
    "READONLY_DB_USER",
  );

  const rootPassword = requireEnv("MARIADB_ROOT_PASSWORD");

  const host = process.env.DB_HOST ?? "db";
  const port = Number(process.env.DB_PORT ?? "3306");

  const connection = await mysql.createConnection({
    host,
    port,
    user: "root",
    password: rootPassword,
  });

  try {
    // ------------------------------------------------------------
    // 1. Create MariaDB roles
    // ------------------------------------------------------------

    await connection.query(
      `CREATE ROLE IF NOT EXISTS \`${DB_ROLES.ADMIN}\``,
    );

    await connection.query(
      `CREATE ROLE IF NOT EXISTS \`${DB_ROLES.AUTH_SERVICE}\``,
    );

    await connection.query(
      `CREATE ROLE IF NOT EXISTS \`${DB_ROLES.READONLY}\``,
    );

    // ------------------------------------------------------------
    // 2. Remove old direct privileges
    // ------------------------------------------------------------

    await revokeIfPresent(
      connection,
      `REVOKE SELECT, INSERT, UPDATE
       ON \`${database}\`.\`app_users\`
       FROM '${authDbUser}'@'%'`,
    );

    await revokeIfPresent(
      connection,
      `REVOKE INSERT
       ON \`${database}\`.\`login_audit\`
       FROM '${authDbUser}'@'%'`,
    );

    await revokeIfPresent(
      connection,
      `REVOKE SELECT
       ON \`${database}\`.*
       FROM '${readonlyDbUser}'@'%'`,
    );

    // ------------------------------------------------------------
    // 3. Grant privileges to roles
    // ------------------------------------------------------------

    await connection.query(
      `GRANT ALL PRIVILEGES
       ON \`${database}\`.*
       TO \`${DB_ROLES.ADMIN}\``,
    );

    await connection.query(
      `GRANT SELECT, INSERT, UPDATE
       ON \`${database}\`.\`app_users\`
       TO \`${DB_ROLES.AUTH_SERVICE}\``,
    );

    await connection.query(
      `GRANT INSERT
       ON \`${database}\`.\`login_audit\`
       TO \`${DB_ROLES.AUTH_SERVICE}\``,
    );

    await connection.query(
      `GRANT SELECT
       ON \`${database}\`.*
       TO \`${DB_ROLES.READONLY}\``,
    );

    // ------------------------------------------------------------
    // 4. Assign roles to MariaDB users
    // ------------------------------------------------------------

    await connection.query(
      `GRANT \`${DB_ROLES.AUTH_SERVICE}\`
       TO '${authDbUser}'@'%'`,
    );

    await connection.query(
      `GRANT \`${DB_ROLES.READONLY}\`
       TO '${readonlyDbUser}'@'%'`,
    );

    // ------------------------------------------------------------
    // 5. Configure default roles
    // ------------------------------------------------------------

    await connection.query(
      `SET DEFAULT ROLE \`${DB_ROLES.AUTH_SERVICE}\`
       FOR '${authDbUser}'@'%'`,
    );

    await connection.query(
      `SET DEFAULT ROLE \`${DB_ROLES.READONLY}\`
       FOR '${readonlyDbUser}'@'%'`,
    );

    console.log("MariaDB RBAC bootstrap completed successfully.");
  } finally {
    await connection.end();
  }
}