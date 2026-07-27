/**
 * @file billing.controller.ts
 * @description Express request handlers for the Billing Module.
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as billingService from "../services/billing.service";

// ─── Plans ───────────────────────────────────────────────────────────────────

export const listPlans = catchAsync(async (req: Request, res: Response) => {
  const plans = await billingService.listPlans(req.user); // user is optional here
  res.status(200).json(new ApiResponse(200, { plans, count: plans.length }));
});

export const createPlan = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const plan = await billingService.createPlan(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { plan }, "Plan created successfully"));
});

export const updatePlan = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const plan = await billingService.updatePlan(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { plan }, "Plan updated successfully"));
});

export const deletePlan = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await billingService.deletePlan(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, null, "Plan deleted successfully"));
});

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const listSubscriptions = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await billingService.listSubscriptions(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const createSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await billingService.createSubscription(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { subscription }, "Subscription created successfully"));
});

export const getSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await billingService.getSubscription(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { subscription }));
});

export const renewSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await billingService.renewSubscription(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { subscription }, "Subscription renewed successfully"));
});

export const cancelSubscription = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const subscription = await billingService.cancelSubscription(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { subscription }, "Subscription canceled successfully"));
});

// ─── Payments ────────────────────────────────────────────────────────────────

export const createPaymentOrder = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await billingService.createPaymentOrder(req.body.subscriptionId, req.user);
  res.status(201).json(new ApiResponse(201, order, "Payment order created"));
});

export const verifyPayment = catchAsync(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const payment = await billingService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  res.status(200).json(new ApiResponse(200, { payment }, "Payment verified successfully"));
});

export const listPayments = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await billingService.listPayments(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const getPayment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const payment = await billingService.getPayment(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { payment }));
});

export const refundPayment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const payment = await billingService.refundPayment(req.params.id, req.body.reason, req.user);
  res.status(200).json(new ApiResponse(200, { payment }, "Refund initiated successfully"));
});

// ─── Invoices ────────────────────────────────────────────────────────────────

export const listInvoices = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await billingService.listInvoices(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

export const getInvoice = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const invoice = await billingService.getInvoice(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { invoice }));
});

export const downloadInvoice = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const invoice = await billingService.getInvoice(req.params.id, req.user);
  
  // Mock PDF download response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice._id}.pdf`);
  
  // Create a simple text buffer to simulate PDF for MVP
  const content = `INVOICE\nID: ${invoice._id}\nAmount: ${invoice.amount}\nStatus: ${invoice.status}\nDate: ${invoice.billingDate}`;
  res.send(Buffer.from(content));
});
