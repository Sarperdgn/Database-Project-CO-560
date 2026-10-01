import { Router } from "express";
import {
  AuthError,
  changePassword,
  getPublicUser,
  loginUser,
  registerUser,
} from "./auth.service.js";
import { requireAuth, type AuthenticatedRequest } from "./auth.middleware.js";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "./schemas.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser({
      ...input,
      ipAddress: req.ip ?? null,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/change-password",
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const input = changePasswordSchema.parse(req.body);
      const result = await changePassword({
        userId: req.auth!.userId,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      res.json({
        message: "Password changed",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/me",
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getPublicUser(req.auth!.userId);
      if (!user) {
        throw new AuthError("Authentication required");
      }
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },
);
