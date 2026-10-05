import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAccessToken } from "./token.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  is_active: number;
  failed_login_attempts: number;
  locked_until: Date | null;
  token_version: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function writeAudit(
  userId: number | null,
  attemptedEmail: string,
  success: boolean,
  reason: string,
  ipAddress: string | null,
): Promise<void> {
  await db.execute(
    `INSERT INTO login_audit
      (user_id, attempted_email, success, reason, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, attemptedEmail, success, reason, ipAddress],
  );
}

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
}): Promise<{
  user: { id: number; email: string; username: string };
  accessToken: string;
}> {
  const email = normalizeEmail(input.email);
  const username = input.username.trim();
  const passwordHash = await hashPassword(input.password);

  try {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO app_users (email, username, password_hash)
       VALUES (?, ?, ?)`,
      [email, username, passwordHash],
    );

    const userId = result.insertId;

    return {
      user: { id: userId, email, username },
      accessToken: createAccessToken(userId, 0),
    };
  } catch (error) {
    const sqlError = error as { code?: string };
    if (sqlError.code === "ER_DUP_ENTRY") {
      throw new AuthError("Email or username is already registered", 409);
    }
    throw error;
  }
}

export async function loginUser(input: {
  email: string;
  password: string;
  ipAddress: string | null;
}): Promise<{
  user: { id: number; email: string; username: string };
  accessToken: string;
}> {
  const email = normalizeEmail(input.email);

  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, email, username, password_hash, is_active,
            failed_login_attempts, locked_until, token_version
       FROM app_users
      WHERE email = ?
      LIMIT 1`,
    [email],
  );

  const user = rows[0];

  if (!user) {
    await writeAudit(null, email, false, "invalid_credentials", input.ipAddress);
    throw new AuthError("Invalid email or password");
  }

  if (!user.is_active) {
    await writeAudit(user.id, email, false, "inactive", input.ipAddress);
    throw new AuthError("Invalid email or password");
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    await writeAudit(user.id, email, false, "locked", input.ipAddress);
    throw new AuthError("Invalid email or password");
  }

  const passwordMatches = await verifyPassword(
    user.password_hash,
    input.password,
  );

  if (!passwordMatches) {
    await db.execute(
      `UPDATE app_users
          SET failed_login_attempts = failed_login_attempts + 1,
              locked_until =
                CASE
                  WHEN failed_login_attempts + 1 >= ?
                    THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
                  ELSE locked_until
                END
        WHERE id = ?`,
      [MAX_FAILED_LOGINS, LOCK_MINUTES, user.id],
    );

    await writeAudit(
      user.id,
      email,
      false,
      "invalid_credentials",
      input.ipAddress,
    );
    throw new AuthError("Invalid email or password");
  }

  await db.execute(
    `UPDATE app_users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = NOW()
      WHERE id = ?`,
    [user.id],
  );

  await writeAudit(user.id, email, true, "success", input.ipAddress);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
    },
    accessToken: createAccessToken(user.id, user.token_version),
  };
}

export async function changePassword(input: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}): Promise<{ accessToken: string }> {
  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, email, username, password_hash, is_active,
            failed_login_attempts, locked_until, token_version
       FROM app_users
      WHERE id = ?
      LIMIT 1`,
    [input.userId],
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    throw new AuthError("Authentication required");
  }

  const matches = await verifyPassword(
    user.password_hash,
    input.currentPassword,
  );

  if (!matches) {
    throw new AuthError("Current password is incorrect");
  }

  const newHash = await hashPassword(input.newPassword);
  const newTokenVersion = user.token_version + 1;

  await db.execute(
    `UPDATE app_users
        SET password_hash = ?,
            token_version = ?,
            failed_login_attempts = 0,
            locked_until = NULL
      WHERE id = ?`,
    [newHash, newTokenVersion, user.id],
  );

  return {
    accessToken: createAccessToken(user.id, newTokenVersion),
  };
}

export async function getPublicUser(userId: number): Promise<{
  id: number;
  email: string;
  username: string;
} | null> {
  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, email, username, password_hash, is_active,
            failed_login_attempts, locked_until, token_version
       FROM app_users
      WHERE id = ?
      LIMIT 1`,
    [userId],
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
  };
}
