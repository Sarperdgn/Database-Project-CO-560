import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { authRouter } from "./auth/auth.routes.js";
import { AuthError } from "./auth/auth.service.js";
import { rbacRouter } from "./rbac/rbac.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/rbac", rbacRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof AuthError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);
