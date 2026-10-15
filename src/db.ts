import mysql, { type Connection } from "mysql2/promise";
import { config } from "./config.js";

// Protected requests authenticate with MariaDB as the caller. No shared privileged
// pool, role switching, JWT role claims, or server-side account mapping.
export async function connectAs(user: string, password: string): Promise<Connection> {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user,
    password,
    connectTimeout: 5000,
    multipleStatements: false,
  });
}
