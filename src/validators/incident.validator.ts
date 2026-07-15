import { z } from "zod";

export const createIncidentSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters").max(100),
    description: z.string().min(10, "Description must be at least 10 characters"),
    type: z.enum(["theft", "vandalism", "technical_issue", "other"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    cameraId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID").optional(),
  }),
});

export const updateIncidentStatusSchema = z.object({
  body: z.object({
    status: z.enum(["open", "investigating", "resolved", "closed"]),
    resolutionNotes: z.string().optional(),
  }).refine((data) => {
    if ((data.status === "resolved" || data.status === "closed") && !data.resolutionNotes) {
      return false;
    }
    return true;
  }, {
    message: "Resolution notes are required when resolving or closing an incident",
    path: ["resolutionNotes"],
  }),
});

export const assignIncidentSchema = z.object({
  body: z.object({
    assignedTo: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
  }),
});

export const listIncidentsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    cameraId: z.string().optional(),
  }),
});

export const incidentIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Incident ID"),
  }),
});
