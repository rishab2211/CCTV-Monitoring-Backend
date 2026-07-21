/**
 * @file analytics.routes.ts
 * @description Express Router for Analytics & Reports (Module 17).
 */
import { Router } from "express";
import * as analyticsController from "../../controllers/analytics.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";

const router = Router();

// All analytics routes require authentication and admin access
// The controller/service already enforces admin access, but we can also use permit middleware here.
router.use(authenticate);
router.use(permit("analytics:read"));

/**
 * GET /api/v1/analytics/dashboard
 * Main dashboard analytics
 */
router.get("/dashboard", analyticsController.getDashboardAnalytics);

/**
 * GET /api/v1/analytics/alerts
 * Alert analytics
 */
router.get("/alerts", analyticsController.getAlertAnalytics);

/**
 * GET /api/v1/analytics/cameras
 * Camera analytics
 */
router.get("/cameras", analyticsController.getCameraAnalytics);

/**
 * GET /api/v1/analytics/operators
 * Operator performance
 */
router.get("/operators", analyticsController.getOperatorAnalytics);

/**
 * GET /api/v1/analytics/revenue
 * Revenue analytics
 */
router.get("/revenue", analyticsController.getRevenueAnalytics);

/**
 * GET /api/v1/analytics/subscriptions
 * Subscription growth
 */
router.get("/subscriptions", analyticsController.getSubscriptionAnalytics);

/**
 * GET /api/v1/analytics/incidents
 * Incident resolution stats
 */
router.get("/incidents", analyticsController.getIncidentAnalytics);

/**
 * GET /api/v1/analytics/franchises
 * Franchise performance
 */
router.get("/franchises", analyticsController.getFranchiseAnalytics);

export default router;
