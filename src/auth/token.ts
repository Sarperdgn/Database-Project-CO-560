import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  tv: number;
}

export function createAccessToken(userId: number, tokenVersion: number): string {
  return jwt.sign(
    { tv: tokenVersion },
    config.jwtSecret,
    {
      subject: String(userId),
      expiresIn: config.jwtExpiresInSeconds,
      issuer: "mariadb-auth-project",
      audience: "mariadb-auth-project-api",
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, {
    issuer: "mariadb-auth-project",
    audience: "mariadb-auth-project-api",
  });

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.tv !== "number"
  ) {
    throw new Error("Invalid token payload");
  }

  return decoded as AccessTokenPayload;
}
