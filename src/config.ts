import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? "3000");
const dbPort = Number(process.env.DB_PORT ?? "3306");
const jwtSecret = required("JWT_SECRET");

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

if (!Number.isInteger(dbPort) || dbPort <= 0) {
  throw new Error("DB_PORT must be a positive integer");
}

if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}

export const config = {
  port,
  db: {
    host: required("DB_HOST"),
    port: dbPort,
    name: required("DB_NAME"),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
  },
  jwtSecret,
  jwtExpiresInSeconds: 60 * 60,
};
