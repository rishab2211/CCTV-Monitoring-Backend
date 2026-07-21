/**
 * @file billing.routes.ts
 * @description Express Router for the Billing Module (Module 16).
 * Handles plans, subscriptions, payments, and invoices.
 */
import { Router } from "express";
import * as billingController from "../../controllers/billing.controller";
import { authenticate } from "../../middleware/auth";
import { permit } from "../../middleware/permit";
import { validate } from "../../middleware/validate";
import {
  createPlanSchema,
  updatePlanSchema,
  createSubscriptionSchema,
  createOrderSchema,
  verifyPaymentSchema,
  refundPaymentSchema,
  idParamSchema,
} from "../../validators/billing.validator";

const router = Router();

// ============================================================================
// 1. Plans (`/api/v1/plans`)
// ============================================================================
export const planRouter = Router();

// Publicly view active plans
planRouter.get("/", billingController.listPlans);

// Admin-only management
planRouter.use(authenticate);
planRouter.post("/", permit("payments:write"), validate(createPlanSchema, "body"), billingController.createPlan);
planRouter.put("/:id", permit("payments:write"), validate(idParamSchema, "params"), validate(updatePlanSchema, "body"), billingController.updatePlan);
planRouter.delete("/:id", permit("payments:write"), validate(idParamSchema, "params"), billingController.deletePlan);


// ============================================================================
// 2. Subscriptions (`/api/v1/subscriptions`)
// ============================================================================
export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate);

subscriptionRouter.post("/", validate(createSubscriptionSchema, "body"), billingController.createSubscription);
subscriptionRouter.get("/:id", validate(idParamSchema, "params"), billingController.getSubscription);
subscriptionRouter.patch("/:id/renew", validate(idParamSchema, "params"), billingController.renewSubscription);
subscriptionRouter.patch("/:id/cancel", validate(idParamSchema, "params"), billingController.cancelSubscription);


// ============================================================================
// 3. Payments (`/api/v1/payments`)
// ============================================================================
export const paymentRouter = Router();

// Webhook (no authentication, relies on signature verification inside controller)
paymentRouter.post("/verify", validate(verifyPaymentSchema, "body"), billingController.verifyPayment);

// Authenticated
paymentRouter.use(authenticate);
paymentRouter.post("/create-order", validate(createOrderSchema, "body"), billingController.createPaymentOrder);
paymentRouter.get("/", billingController.listPayments);
paymentRouter.get("/:id", validate(idParamSchema, "params"), billingController.getPayment);
paymentRouter.post("/:id/refund", permit("payments:write"), validate(idParamSchema, "params"), validate(refundPaymentSchema, "body"), billingController.refundPayment);


// ============================================================================
// 4. Invoices (`/api/v1/invoices`)
// ============================================================================
export const invoiceRouter = Router();
invoiceRouter.use(authenticate);

invoiceRouter.get("/", billingController.listInvoices);
invoiceRouter.get("/:id", validate(idParamSchema, "params"), billingController.getInvoice);
invoiceRouter.get("/:id/download", validate(idParamSchema, "params"), billingController.downloadInvoice);

export default router;
