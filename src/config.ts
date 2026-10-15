import "dotenv/config";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${name}`);
  return value;
}
export const config = {
  registrationPassword: required("REGISTRATION_DB_PASSWORD"),
  port: port("PORT", 3000),
  db: { host: required("DB_HOST"), port: port("DB_PORT", 3306), name: required("DB_NAME") },
};
