import { z } from "zod";

/**
 * Schema for creating a new Installation/Maintenance Job.
 */
export const createJobSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters").max(100),
    description: z.string().min(5, "Description must be at least 5 characters"),
    type: z.enum(["installation", "repair", "maintenance"]),
    assignedTechnician: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
    franchiseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Franchise ID").optional(),
    cameraId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Camera ID").optional(),
    scheduledAt: z.string().datetime("Must be a valid ISO datetime string"),
  }),
});

/**
 * Schema for listing Jobs.
 */
export const listJobsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number).default("1"),
    limit: z.string().regex(/^\d+$/).optional().transform(Number).default("20"),
    status: z.enum(["scheduled", "in-progress", "completed", "cancelled"]).optional(),
    type: z.enum(["installation", "repair", "maintenance"]).optional(),
    assignedTechnician: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID").optional(),
    franchiseId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Franchise ID").optional(),
  }),
});

/**
 * Schema for validating Job ID in route parameters.
 */
export const jobIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Job ID"),
  }),
});

/**
 * Schema for updating a Job's status.
 */
export const updateJobStatusSchema = z.object({
  body: z.object({
    status: z.enum(["in-progress", "completed", "cancelled"]),
    notes: z.string().optional(),
    // Attachments will be handled by multer and verified in the controller/service
  }),
});

/**
 * Schema for reassigning a Job to another technician.
 */
export const reassignJobSchema = z.object({
  body: z.object({
    assignedTechnician: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID"),
  }),
});

/**
 * Schema for submitting/updating a job checklist.
 * Each entry is a string description of the checklist item.
 */
export const submitChecklistSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        item: z.string().min(1),
        checked: z.boolean(),
      })
    ).min(1, "At least one checklist item is required"),
  }),
});

/**
 * Schema for updating a technician's GPS location.
 */
export const updateGpsSchema = z.object({
  body: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

/**
 * Schema for technician ID param (for schedule and GPS endpoints).
 */
export const technicianIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Technician User ID"),
  }),
});
