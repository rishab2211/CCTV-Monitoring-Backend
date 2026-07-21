/**
 * @file ticket.service.ts
 * @description Business logic for Support Tickets (Module 19).
 */
import mongoose from "mongoose";
import { Ticket } from "../models/Ticket";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";

/**
 * 1. Create Support Ticket
 */
export const createTicket = async (data: any, user: JwtAccessPayload) => {
  const ticket = await Ticket.create({
    ...data,
    franchiseId: user.franchiseId,
    createdBy: user.userId,
    status: "open"
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_CREATED",
    description: `Created support ticket: ${ticket.title}`,
    metadata: { ticketId: ticket._id }
  });

  // Notify admins
  const admins = await User.find({ role: { $in: ["admin", "super_admin"] }, isDeleted: false });
  for (const admin of admins) {
    await notificationService.sendNotification(
      admin._id.toString(),
      "New Support Ticket",
      `A new ticket "${ticket.title}" was submitted.`,
      "system"
    );
  }

  return ticket;
};

/**
 * 2. List Tickets
 */
export const listTickets = async (query: any, user: JwtAccessPayload) => {
  const { page = 1, limit = 20, status, category, priority } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: any = {};
  
  // Franchise admins see tickets for their franchise
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No franchise associated with your account");
    filter.franchiseId = user.franchiseId;
  } else if (user.role !== "admin" && user.role !== "super_admin") {
    // Customers/Operators only see their own tickets
    filter.createdBy = user.userId;
  }

  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email role")
      .populate("assignedTo", "name email")
      .lean(),
    Ticket.countDocuments(filter)
  ]);

  return { tickets, total, page: Number(page), limit: Number(limit) };
};

/**
 * 3. Get Ticket Details
 */
export const getTicket = async (id: string, user: JwtAccessPayload) => {
  const ticket = await Ticket.findById(id)
    .populate("createdBy", "name email role")
    .populate("assignedTo", "name email")
    .populate("comments.createdBy", "name email role")
    .lean();

  if (!ticket) throw ApiError.notFound("Ticket not found");

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || ticket.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden();
    }
  } else if (user.role !== "admin" && user.role !== "super_admin" && ticket.createdBy._id.toString() !== user.userId) {
    throw ApiError.forbidden();
  }

  return ticket;
};

/**
 * 4. Update Ticket
 */
export const updateTicket = async (id: string, data: any, user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden("Only admins or franchise managers can update ticket details directly");
  }

  // If franchise admin, ensure they own the ticket
  if (user.role === "franchise" || user.role === "franchise_admin") {
    const existingTicket = await Ticket.findById(id);
    if (!existingTicket || existingTicket.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden("You do not have access to this ticket");
    }
  }

  const ticket = await Ticket.findByIdAndUpdate(id, data, { new: true });
  if (!ticket) throw ApiError.notFound("Ticket not found");

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_UPDATED",
    description: `Updated details for ticket ${ticket._id}`,
    metadata: { ticketId: ticket._id }
  });

  return ticket;
};

/**
 * 5. Update Ticket Status
 */
export const updateTicketStatus = async (id: string, status: string, user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden("Only admins or franchise managers can change ticket status");
  }

  // If franchise admin, ensure they own the ticket
  if (user.role === "franchise" || user.role === "franchise_admin") {
    const existingTicket = await Ticket.findById(id);
    if (!existingTicket || existingTicket.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden("You do not have access to this ticket");
    }
  }

  const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true });
  if (!ticket) throw ApiError.notFound("Ticket not found");

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_UPDATED",
    description: `Changed ticket status to ${status}`,
    metadata: { ticketId: ticket._id }
  });

  await notificationService.sendNotification(
    ticket.createdBy.toString(),
    "Ticket Status Updated",
    `Your ticket "${ticket.title}" status is now: ${status}`,
    "system"
  );

  return ticket;
};

/**
 * 6. Add Comment
 */
export const addComment = async (id: string, text: string, user: JwtAccessPayload) => {
  const ticket = await Ticket.findById(id);
  if (!ticket) throw ApiError.notFound("Ticket not found");

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || ticket.franchiseId?.toString() !== user.franchiseId) {
      throw ApiError.forbidden();
    }
  } else if (user.role !== "admin" && user.role !== "super_admin" && ticket.createdBy.toString() !== user.userId) {
    throw ApiError.forbidden();
  }

  ticket.comments.push({
    text,
    createdBy: new mongoose.Types.ObjectId(user.userId),
    createdAt: new Date()
  });

  // Re-open closed tickets if a customer comments
  if (user.role !== "admin" && user.role !== "super_admin" && ticket.status === "closed") {
    ticket.status = "open";
  }

  await ticket.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_COMMENTED",
    description: `Added comment to ticket ${ticket._id}`,
    metadata: { ticketId: ticket._id }
  });

  // Notify the other party
  const targetId = user.role === "customer" || user.role === "operator" || user.role === "franchise"
    ? ticket.assignedTo?.toString() // Notify assigned admin if exists
    : ticket.createdBy.toString(); // Notify creator

  if (targetId) {
    await notificationService.sendNotification(
      targetId,
      "New Ticket Comment",
      `A new comment was added to "${ticket.title}"`,
      "system"
    );
  }

  return ticket;
};

/**
 * 7. Assign Ticket
 */
export const assignTicket = async (id: string, assignedTo: string, user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw ApiError.forbidden();
  }

  const assignee = await User.findById(assignedTo);
  if (!assignee) throw ApiError.notFound("Assignee not found");

  const ticket = await Ticket.findByIdAndUpdate(id, { assignedTo }, { new: true });
  if (!ticket) throw ApiError.notFound("Ticket not found");

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_ASSIGNED",
    description: `Assigned ticket ${ticket._id} to ${assignee.name}`,
    metadata: { ticketId: ticket._id }
  });

  await notificationService.sendNotification(
    assignedTo,
    "Ticket Assigned",
    `You have been assigned to ticket "${ticket.title}"`,
    "system"
  );

  return ticket;
};

/**
 * 8. Close Ticket
 */
export const closeTicket = async (id: string, user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw ApiError.forbidden();
  }

  const ticket = await Ticket.findByIdAndUpdate(id, { status: "closed" }, { new: true });
  if (!ticket) throw ApiError.notFound("Ticket not found");

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "TICKET_CLOSED",
    description: `Closed ticket ${ticket._id}`,
    metadata: { ticketId: ticket._id }
  });

  await notificationService.sendNotification(
    ticket.createdBy.toString(),
    "Ticket Closed",
    `Your ticket "${ticket.title}" has been closed.`,
    "system"
  );

  return ticket;
};
