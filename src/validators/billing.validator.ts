import { z } from "zod";

// ─── Plans ───────────────────────────────────────────────────────────────────

export const createPlanSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(50),
    description: z.string().min(10),
    price: z.number().min(0),
    durationMonths: z.number().int().min(1),
    cameraLimit: z.number().int().min(1),
    features: z.array(z.string()).optional(),
  }),
});

export const updatePlanSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(50).optional(),
    description: z.string().min(10).optional(),
    price: z.number().min(0).optional(),
    durationMonths: z.number().int().min(1).optional(),
    cameraLimit: z.number().int().min(1).optional(),
    features: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const createSubscriptionSchema = z.object({
  body: z.object({
    planId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Plan ID"),
    customerId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Customer ID").optional(), // Admins can specify, customers get from token
  }),
});

// ─── Payments ────────────────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  body: z.object({
    subscriptionId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Subscription ID"),
  }),
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  }),
});

export const refundPaymentSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

// ─── Generic Params ──────────────────────────────────────────────────────────

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID"),
  }),
});
