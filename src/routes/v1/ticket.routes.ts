/**
 * @file ticket.routes.ts
 * @description Express Router for Module 19 (Support Tickets).
 */
import { Router } from "express";
import * as ticketController from "../../controllers/ticket.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  createTicketSchema,
  updateTicketSchema,
  updateTicketStatusSchema,
  assignTicketSchema,
  addCommentSchema,
  idParamSchema,
  listTicketSchema
} from "../../validators/ticket.validator";

const router = Router();

// All ticket routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/tickets
 * Create support ticket
 */
router.post("/", validate(createTicketSchema, "body"), ticketController.createTicket);

/**
 * GET /api/v1/tickets
 * List tickets
 */
router.get("/", validate(listTicketSchema, "query"), ticketController.listTickets);

/**
 * GET /api/v1/tickets/:id
 * Get ticket details
 */
router.get("/:id", validate(idParamSchema, "params"), ticketController.getTicket);

/**
 * PUT /api/v1/tickets/:id
 * Update ticket
 */
router.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateTicketSchema, "body"),
  ticketController.updateTicket
);

/**
 * PATCH /api/v1/tickets/:id/status
 * Update ticket status
 */
router.patch(
  "/:id/status",
  validate(idParamSchema, "params"),
  validate(updateTicketStatusSchema, "body"),
  ticketController.updateTicketStatus
);

/**
 * POST /api/v1/tickets/:id/comments
 * Add comment
 */
router.post(
  "/:id/comments",
  validate(idParamSchema, "params"),
  validate(addCommentSchema, "body"),
  ticketController.addComment
);

/**
 * PATCH /api/v1/tickets/:id/assign
 * Assign ticket
 */
router.patch(
  "/:id/assign",
  validate(idParamSchema, "params"),
  validate(assignTicketSchema, "body"),
  ticketController.assignTicket
);

/**
 * PATCH /api/v1/tickets/:id/close
 * Close ticket
 */
router.patch(
  "/:id/close",
  validate(idParamSchema, "params"),
  ticketController.closeTicket
);

export default router;
