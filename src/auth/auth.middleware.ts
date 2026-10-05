import type { NextFunction, Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { db } from "../db.js";
import { verifyAccessToken } from "./token.js";

interface AuthStateRow extends RowDataPacket {
  id: number;
  is_active: number;
  token_version: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: number;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const token = header.slice("Bearer ".length);
    const payload = verifyAccessToken(token);
    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const [rows] = await db.execute<AuthStateRow[]>(
      `SELECT id, is_active, token_version
         FROM app_users
        WHERE id = ?
        LIMIT 1`,
      [userId],
    );

    const user = rows[0];

    if (
      !user ||
      !user.is_active ||
      user.token_version !== payload.tv
    ) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.auth = { userId };
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}
