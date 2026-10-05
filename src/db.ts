import mysql from "mysql2/promise";
import { config } from "./config.js";

export const db = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
  namedPlaceholders: false,
});

export async function assertDatabaseConnection(): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
