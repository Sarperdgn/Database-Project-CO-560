import { Router } from "express";
import {
  getCurrentRole,
  getPermissionSummary,
  getRoleGrants,
  testRbacOperation,
  testReadonlyOperation,
} from "./rbac.service.js";

import {
  DB_ROLES,
  RBAC_TEST_OPERATIONS,
  type RbacTestOperation,
} from "./rbac.types.js";

export const rbacRouter = Router();

rbacRouter.get("/current-role", async (_req, res, next) => {
  try {
    const result = await getCurrentRole();

    res.json(result);
  } catch (error) {
    next(error);
  }
});

rbacRouter.get("/permissions", async (_req, res, next) => {
  try {
    const result = await getPermissionSummary();

    res.json(result);
  } catch (error) {
    next(error);
  }
});

rbacRouter.get("/roles/:role/grants", async (req, res, next) => {
  try {
    const role = req.params.role;

    const allowedRoles = Object.values(DB_ROLES);

    if (!allowedRoles.includes(role as (typeof allowedRoles)[number])) {
      res.status(400).json({
        error: "Unknown role",
      });
      return;
    }

    const result = await getRoleGrants(role);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

rbacRouter.post("/test", async (req, res, next) => {
  try {
    const operation = req.body.operation as RbacTestOperation;

    const allowedOperations = Object.values(RBAC_TEST_OPERATIONS);

    if (
      !allowedOperations.includes(
        operation as (typeof allowedOperations)[number],
      )
    ) {
      res.status(400).json({
        error: "Unknown test operation",
      });
      return;
    }

    const result = await testRbacOperation(operation);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

rbacRouter.post("/test-readonly", async (req, res, next) => {
  try {
    const operation = req.body.operation as RbacTestOperation | undefined;

    const allowedOperations: RbacTestOperation[] = [
      "select_app_users",
      "delete_app_users",
      "insert_login_audit",
      "update_login_audit",
    ];

    if (!operation || !allowedOperations.includes(operation)) {
      res.status(400).json({
        error: "Invalid RBAC test operation",
        allowedOperations,
      });
      return;
    }

    const result = await testReadonlyOperation(operation);

    res.json(result);
  } catch (error) {
    next(error);
  }
});