import mysql from "mysql2/promise";

const host = process.env.DB_HOST ?? "db";
const port = Number(process.env.DB_PORT ?? "3306");
const database = process.env.MARIADB_DATABASE;

const user = process.env.READONLY_DB_USER;
const password = process.env.READONLY_DB_PASSWORD;

if (!database) {
  throw new Error("Missing MARIADB_DATABASE");
}

if (!user) {
  throw new Error("Missing READONLY_DB_USER");
}

if (!password) {
  throw new Error("Missing READONLY_DB_PASSWORD");
}

export const readonlyDb = mysql.createPool({
  host,
  port,
  database,
  user,
  password,
  connectionLimit: 5,
  waitForConnections: true,
  enableKeepAlive: true,
});