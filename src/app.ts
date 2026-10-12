import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import type { Connection } from "mysql2/promise";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { connectAs } from "./db.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: "draft-8", legacyHeaders: false }));

function databaseRoute(run: (db: Connection, req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let db: Connection | undefined;
    try {
      const header = req.header("authorization");
      if (!header?.startsWith("Basic ")) {
        res.setHeader("WWW-Authenticate", 'Basic realm="MariaDB tutorial"');
        res.status(401).json({ error: "MariaDB credentials required" });
        return;
      }
      const credentials = Buffer.from(header.slice(6), "base64").toString("utf8");
      const separator = credentials.indexOf(":");
      if (separator < 1 || separator === credentials.length - 1) {
        res.status(401).json({ error: "MariaDB credentials required" });
        return;
      }
      db = await connectAs(credentials.slice(0, separator), credentials.slice(separator + 1));
      await run(db, req, res);
    } catch (error) {
      next(error);
    } finally {
      // Never reuse a connection authenticated as another caller.
      if (db) db.destroy();
    }
  };
}

app.get("/api/me", databaseRoute(async (db, _req, res) => {
  const [rows] = await db.query("SELECT CURRENT_USER() AS account, CURRENT_ROLE() AS role");
  res.json(rows);
}));
app.get("/api/users", databaseRoute(async (db, _req, res) => {
  const [rows] = await db.query("SELECT id, email, username FROM user_directory ORDER BY id LIMIT 100");
  res.json(rows);
}));
app.get("/api/audit", databaseRoute(async (db, _req, res) => {
  const [rows] = await db.query("SELECT * FROM login_audit ORDER BY id DESC LIMIT 100");
  res.json(rows);
}));
app.patch("/api/users/:id", databaseRoute(async (db, req, res) => {
  const id = z.string().regex(/^[1-9][0-9]*$/).parse(req.params.id);
  const { username } = z.object({ username: z.string().min(3).max(50).regex(/^[A-Za-z0-9_.-]+$/) }).parse(req.body);
  await db.execute("UPDATE app_users SET username = ? WHERE id = ?", [username, id]);
  res.json({ message: "Update executed" });
}));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError || error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const errno = (error as { errno?: number }).errno;
  if (errno === 1045 || errno === 1044 || errno === 1698) {
    res.status(401).json({ error: "MariaDB authentication failed" });
  } else if (errno === 1142 || errno === 1143 || errno === 1227 || errno === 1370) {
    res.status(403).json({ error: "MariaDB denied this operation" });
  } else if (errno === 1062) {
    res.status(409).json({ error: "Username already exists" });
  } else {
    // Do not log driver error objects: they can contain query/connection data.
    res.status(500).json({ error: "Database operation failed" });
  }
};
app.use(errorHandler);
