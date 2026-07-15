import { z } from "zod";

/**
 * Schema for creating a new Incident.
 * Validates title, description, type, severity, and optional camera ID.
 */
export const createIncidentSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters").max(100),
    description: z.string().min(10, "Description must be at least 10 characters"),
    type: z.enum(["theft", "vandalism", "technical_issue", "other"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    cameraId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID").optional(),
  }),
});

/**
 * Schema for updating an Incident's status.
 * Requires resolutionNotes if the status is being set to 'resolved' or 'closed'.
 */
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

/**
 * Schema for assigning an Incident to a user.
 * Validates the assignedTo field as a MongoDB ObjectId.
 */
export const assignIncidentSchema = z.object({
  body: z.object({
    assignedTo: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
  }),
});

/**
 * Schema for listing Incidents.
 * Validates pagination params and filters (status, severity, cameraId).
 */
export const listIncidentsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    cameraId: z.string().optional(),
  }),
});

/**
 * Schema for validating an Incident ID in route parameters.
 */
export const incidentIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Incident ID"),
  }),
});

/**
 * Schema for adding a note to an Incident.
 */
export const addIncidentNoteSchema = z.object({
  body: z.object({
    text: z.string().min(1, "Note text is required").max(2000, "Note is too long"),
  }),
});

/**
 * Schema for explicitly closing an Incident with resolution notes.
 */
export const closeIncidentSchema = z.object({
  body: z.object({
    resolutionNotes: z.string().min(5, "Resolution notes are required to close an incident"),
  }),
});

/**
 * Schema for verifying an Incident.
 */
export const verifyIncidentSchema = z.object({
  body: z.object({
    notes: z.string().max(2000).optional(),
  }),
});
