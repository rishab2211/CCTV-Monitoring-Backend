/**
 * @file audit.routes.ts
 * @description Express Router for Module 18 (Audit & Activity Logs).
 */
import { Router } from "express";
import * as auditController from "../../controllers/audit.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  paginationSchema,
  idParamSchema,
  userIdParamSchema,
} from "../../validators/audit.validator";

export const auditRouter = Router();
export const activityRouter = Router();

// Both routers require authentication and admin access
auditRouter.use(authenticate);
auditRouter.use(permit("audit:view")); // Assuming there's an audit view permission

activityRouter.use(authenticate);
activityRouter.use(permit("audit:view"));

// ─── Audit Logs ──────────────────────────────────────────────────────────────

auditRouter.get("/", validate(paginationSchema, "query"), auditController.listAuditLogs);
auditRouter.get("/:id", validate(idParamSchema, "params"), auditController.getAuditLogDetail);

// ─── Activity Logs ───────────────────────────────────────────────────────────

activityRouter.get("/", validate(paginationSchema, "query"), auditController.listActivityLogs);
activityRouter.get("/user/:userId", validate(userIdParamSchema, "params"), validate(paginationSchema, "query"), auditController.getUserActivityLogs);
