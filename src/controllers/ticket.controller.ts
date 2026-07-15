/**
 * @file ticket.controller.ts
 * @description Express request handlers for Module 19 (Support Tickets).
 */
import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import * as ticketService from "../services/ticket.service";

/**
 * 1. Create Support Ticket
 * POST /api/v1/tickets
 */
export const createTicket = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.createTicket(req.body, req.user);
  res.status(201).json(new ApiResponse(201, { ticket }, "Ticket created successfully"));
});

/**
 * 2. List Tickets
 * GET /api/v1/tickets
 */
export const listTickets = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await ticketService.listTickets(req.query, req.user);
  res.status(200).json(new ApiResponse(200, result));
});

/**
 * 3. Get Ticket Details
 * GET /api/v1/tickets/:id
 */
export const getTicket = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.getTicket(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }));
});

/**
 * 4. Update Ticket
 * PUT /api/v1/tickets/:id
 */
export const updateTicket = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.updateTicket(req.params.id, req.body, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }, "Ticket updated successfully"));
});

/**
 * 5. Update Ticket Status
 * PATCH /api/v1/tickets/:id/status
 */
export const updateTicketStatus = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.updateTicketStatus(req.params.id, req.body.status, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }, "Ticket status updated"));
});

/**
 * 6. Add Comment
 * POST /api/v1/tickets/:id/comments
 */
export const addComment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.addComment(req.params.id, req.body.text, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }, "Comment added successfully"));
});

/**
 * 7. Assign Ticket
 * PATCH /api/v1/tickets/:id/assign
 */
export const assignTicket = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.assignTicket(req.params.id, req.body.assignedTo, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }, "Ticket assigned successfully"));
});

/**
 * 8. Close Ticket
 * PATCH /api/v1/tickets/:id/close
 */
export const closeTicket = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const ticket = await ticketService.closeTicket(req.params.id, req.user);
  res.status(200).json(new ApiResponse(200, { ticket }, "Ticket closed successfully"));
});
