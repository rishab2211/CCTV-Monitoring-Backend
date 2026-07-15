import { z } from "zod";

export const createTicketSchema = z.object({
  body: z.object({
    title: z.string().min(5).max(200),
    description: z.string().min(10),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    category: z.enum(["billing", "technical", "account", "general"]).optional(),
  }),
});

export const updateTicketSchema = z.object({
  body: z.object({
    title: z.string().min(5).max(200).optional(),
    description: z.string().min(10).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    category: z.enum(["billing", "technical", "account", "general"]).optional(),
  }),
});

export const updateTicketStatusSchema = z.object({
  body: z.object({
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
  }),
});

export const assignTicketSchema = z.object({
  body: z.object({
    assignedTo: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
  }),
});

export const addCommentSchema = z.object({
  body: z.object({
    text: z.string().min(1),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Ticket ID"),
  }),
});
