/**
 * @file job.service.ts
 * @description Business logic for the Technician / Installation Module.
 */
import mongoose from "mongoose";
import { InstallationJob } from "../models/InstallationJob";
import { User } from "../models/User";
import { Franchise } from "../models/Franchise";
import { Camera } from "../models/Camera";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";
import { logger } from "../utils/logger";

/**
 * Create an Installation/Maintenance Job
 * 
 * @param input - Job details including assignedTechnician and scheduledAt
 * @param user - Requesting user (Admin/Franchise)
 * @returns The created Job document
 */
export const createJob = async (input: any, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden("You do not have permission to create jobs");
  }

  const { title, description, type, assignedTechnician, franchiseId, cameraId, scheduledAt } = input;

  // Validate Technician
  const techFilter: any = { _id: assignedTechnician, role: "technician", isDeleted: false };
  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No active franchise found for this user");
    techFilter["technicianDetails.assignedFranchise"] = new mongoose.Types.ObjectId(user.franchiseId);
  }

  const tech = await User.findOne(techFilter);
  if (!tech) {
    throw ApiError.badRequest("Invalid technician assigned, or technician does not belong to your franchise.");
  }

  // If Franchise Manager is creating the job, automatically lock to their franchise
  let actualFranchiseId = franchiseId;
  if (user.role === "franchise" || user.role === "franchise_admin") {
    actualFranchiseId = user.franchiseId;
  }

  // Validate Camera if provided
  if (cameraId) {
    const cameraFilter: any = { _id: cameraId, isDeleted: false };
    if (actualFranchiseId) {
      cameraFilter.franchiseId = new mongoose.Types.ObjectId(actualFranchiseId);
    }
    const camera = await Camera.findOne(cameraFilter);
    if (!camera) throw ApiError.notFound("Camera not found or does not belong to your franchise");
  }

  const job = await InstallationJob.create({
    title,
    description,
    type,
    status: "scheduled",
    assignedTechnician,
    franchiseId: actualFranchiseId,
    cameraId,
    scheduledAt,
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_CREATED",
    description: `Created a new ${type} job for technician ${tech.name}`,
    metadata: { jobId: job._id, assignedTechnician },
  });

  // Notify Technician
  await notificationService.sendNotification(
    assignedTechnician,
    "New Job Assigned",
    `You have a new ${type} job scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
    "system",
    job._id.toString()
  ).catch(err => logger.error(`Failed to notify technician ${assignedTechnician}`, err));

  return job;
};

/**
 * List Jobs
 * Technicians only see their own jobs. Admins/Franchise managers see all relevant jobs.
 * 
 * @param query - Pagination and filters
 * @param user - Requesting user
 */
export const listJobs = async (query: any, user: JwtAccessPayload) => {
  const { page, limit, status, type, assignedTechnician, franchiseId } = query;
  const filter: any = {};

  if (status) filter.status = status;
  if (type) filter.type = type;

  // RBAC Filtering
  if (user.role === "technician") {
    filter.assignedTechnician = user.userId;
  } else if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId) throw ApiError.forbidden("No active franchise found for this user");
    filter.franchiseId = user.franchiseId;
  } else {
    // Admins can filter by whatever they want
    if (assignedTechnician) filter.assignedTechnician = assignedTechnician;
    if (franchiseId) filter.franchiseId = franchiseId;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [jobs, total] = await Promise.all([
    InstallationJob.find(filter)
      .populate("assignedTechnician", "name email phone")
      .populate("franchiseId", "name franchiseCode contactPhone")
      .populate("cameraId", "name serialNumber location status")
      .skip(skip)
      .limit(Number(limit))
      .sort({ scheduledAt: 1 })
      .lean(),
    InstallationJob.countDocuments(filter),
  ]);

  return { jobs, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
};

/**
 * Get Job Details
 */
export const getJobDetails = async (id: string, user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id)
    .populate("assignedTechnician", "name email phone")
    .populate("franchiseId", "name franchiseCode contactPhone")
    .populate("cameraId", "name serialNumber location status");

  if (!job) throw ApiError.notFound("Job not found");

  // Verify Access
  if (user.role === "technician" && job.assignedTechnician._id.toString() !== user.userId) {
    throw ApiError.forbidden("You do not have access to this job");
  }

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || job.franchiseId?._id.toString() !== user.franchiseId) {
      throw ApiError.forbidden("You do not have access to this job");
    }
  }

  return job;
};

/**
 * Update Job Status
 * Technicians use this to mark jobs as in-progress or completed.
 */
export const updateJobStatus = async (id: string, updateData: any, user: JwtAccessPayload) => {
  const { status, notes, attachments = [] } = updateData;

  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  // RBAC Verify
  if (user.role === "technician" && job.assignedTechnician.toString() !== user.userId) {
    throw ApiError.forbidden("You do not have access to this job");
  }

  if (user.role === "franchise" || user.role === "franchise_admin") {
    if (!user.franchiseId || job.franchiseId?.toString() !== user.franchiseId.toString()) {
      throw ApiError.forbidden("You do not have access to this job");
    }
  }

  job.status = status;
  if (notes) job.notes = notes;
  if (attachments.length > 0) {
    job.attachments = [...job.attachments, ...attachments];
  }

  if (status === "completed") {
    job.completedAt = new Date();
  }

  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: status === "completed" ? "JOB_COMPLETED" : "JOB_UPDATED",
    description: `Job ${job._id} marked as ${status}`,
    metadata: { jobId: job._id, status },
  });

  // If completed and tied to a franchise, notify the Franchise Owner
  if (status === "completed" && job.franchiseId) {
    const franchise = await Franchise.findById(job.franchiseId);
    if (franchise && franchise.ownerId) {
      await notificationService.sendNotification(
        franchise.ownerId.toString(),
        "Installation Job Completed",
        `Technician has completed the ${job.type} job: ${job.title}.`,
        "system",
        job._id.toString()
      ).catch(() => {});
    }
  }

  return job;
};

/**
 * Reassign Job
 * Admins/Franchise Managers can move a job to a different technician.
 */
export const reassignJob = async (id: string, newTechnicianId: string, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise") {
    throw ApiError.forbidden("You do not have permission to reassign jobs");
  }

  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  if (user.role === "franchise") {
    const ownedFranchise = await Franchise.findOne({ ownerId: user.userId });
    if (!ownedFranchise || job.franchiseId?.toString() !== ownedFranchise._id.toString()) {
      throw ApiError.forbidden("You do not have access to this job");
    }
  }

  const newTech = await User.findOne({ _id: newTechnicianId, role: "technician", isDeleted: false });
  if (!newTech) throw ApiError.badRequest("Invalid technician provided");

  const oldTechId = job.assignedTechnician;
  job.assignedTechnician = new mongoose.Types.ObjectId(newTechnicianId);
  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_UPDATED",
    description: `Job reassigned to ${newTech.name}`,
    metadata: { jobId: job._id, newTechnicianId },
  });

  // Notify new tech
  await notificationService.sendNotification(
    newTechnicianId,
    "Job Reassigned to You",
    `You have been assigned to the ${job.type} job: ${job.title}.`,
    "system",
    job._id.toString()
  ).catch(() => {});

  return job;
};

/**
 * Get Assigned Jobs (Technician's Own)
 * Returns only the jobs assigned to the currently authenticated technician.
 * Serves the `GET /installations/assigned` endpoint.
 *
 * @param user - The authenticated technician
 * @returns Array of jobs assigned to this technician
 */
export const getAssignedJobs = async (user: JwtAccessPayload) => {
  const jobs = await InstallationJob.find({ assignedTechnician: user.userId })
    .populate("franchiseId", "name franchiseCode")
    .populate("cameraId", "name serialNumber location")
    .sort({ scheduledAt: 1 })
    .lean();

  return jobs;
};

/**
 * Submit Installation Checklist
 * Replaces the checklist array on a job with the submitted items.
 * Technicians fill this out on-site before marking completion.
 *
 * @param id - The job ID
 * @param items - Array of `{ item: string, checked: boolean }` objects
 * @param user - The technician submitting the checklist
 * @returns The updated job document
 * @throws ApiError if not found or access denied
 */
export const submitChecklist = async (id: string, items: { item: string; checked: boolean }[], user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  // Only the assigned technician or admins can submit a checklist
  if (user.role === "technician" && job.assignedTechnician.toString() !== user.userId) {
    throw ApiError.forbidden("You are not assigned to this job");
  }

  // Map items adding checkedAt timestamps for any checked items
  job.checklist = items.map((entry) => ({
    item: entry.item,
    checked: entry.checked,
    checkedAt: entry.checked ? new Date() : undefined,
  }));

  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_UPDATED",
    description: `Submitted checklist for job ${job._id}`,
    metadata: { jobId: id, checklistCount: items.length },
  });

  return job;
};

/**
 * Upload Installation Photos
 * Appends photo file paths to the job's attachments array.
 * Files are processed by multer before this service function is called.
 *
 * @param id - The job ID
 * @param filePaths - Array of server-relative file paths from multer
 * @param user - The technician uploading photos
 * @returns The updated job document
 * @throws ApiError if not found or access denied
 */
export const uploadJobPhotos = async (id: string, filePaths: string[], user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  if (user.role === "technician" && job.assignedTechnician.toString() !== user.userId) {
    throw ApiError.forbidden("You are not assigned to this job");
  }

  // Append new photos, preserving existing ones
  job.attachments = [...job.attachments, ...filePaths];
  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_UPDATED",
    description: `Uploaded ${filePaths.length} photo(s) to job ${job._id}`,
    metadata: { jobId: id, photos: filePaths },
  });

  return job;
};

/**
 * Upload Customer Signature
 * Stores the path to the customer's digital signature image captured at the end of installation.
 *
 * @param id - The job ID
 * @param signaturePath - Server-relative path to the signature image file
 * @param user - The technician uploading the signature
 * @returns The updated job document
 * @throws ApiError if not found or access denied
 */
export const uploadCustomerSignature = async (id: string, signaturePath: string, user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  if (user.role === "technician" && job.assignedTechnician.toString() !== user.userId) {
    throw ApiError.forbidden("You are not assigned to this job");
  }

  job.customerSignature = signaturePath;
  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_UPDATED",
    description: `Customer signature uploaded for job ${job._id}`,
    metadata: { jobId: id },
  });

  return job;
};

/**
 * Mark Job Complete
 * Explicitly marks a job as 'completed', setting the completedAt timestamp.
 * This is separate from updateJobStatus to allow a clean PATCH endpoint.
 *
 * @param id - The job ID
 * @param notes - Optional completion notes from the technician
 * @param user - The technician or admin completing the job
 * @returns The updated job document
 * @throws ApiError if already completed or not found
 */
export const completeJob = async (id: string, notes: string | undefined, user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id);
  if (!job) throw ApiError.notFound("Job not found");

  if (job.status === "completed") throw ApiError.badRequest("Job is already marked as completed");

  if (user.role === "technician" && job.assignedTechnician.toString() !== user.userId) {
    throw ApiError.forbidden("You are not assigned to this job");
  }

  job.status = "completed";
  job.completedAt = new Date();
  if (notes) job.notes = notes;

  await job.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "JOB_COMPLETED",
    description: `Job ${job._id} marked as completed`,
    metadata: { jobId: id },
  });

  // Notify the franchise owner if the job is tied to a franchise
  if (job.franchiseId) {
    const franchise = await Franchise.findById(job.franchiseId);
    if (franchise?.ownerId) {
      await notificationService.sendNotification(
        franchise.ownerId.toString(),
        "Installation Completed",
        `The ${job.type} job "${job.title}" has been marked as completed.`,
        "system",
        job._id.toString()
      ).catch(() => {});
    }
  }

  return job;
};

/**
 * Get Job Completion Report
 * Returns a comprehensive completion summary for an installation job.
 * Includes job details, checklist items, photo attachments, signature, and technician info.
 *
 * @param id - The job ID
 * @param user - The requesting user (admin or assigned technician)
 * @returns A structured report object
 * @throws ApiError if not found or access denied
 */
export const getJobReport = async (id: string, user: JwtAccessPayload) => {
  const job = await InstallationJob.findById(id)
    .populate("assignedTechnician", "name email phone")
    .populate("franchiseId", "name franchiseCode contactPhone")
    .populate("cameraId", "name serialNumber location status")
    .lean();

  if (!job) throw ApiError.notFound("Job not found");

  // Technicians can only view their own job reports
  if (user.role === "technician" && (job.assignedTechnician as any)._id.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  return {
    generatedAt: new Date().toISOString(),
    job,
    summary: {
      status: job.status,
      type: job.type,
      scheduledAt: job.scheduledAt,
      completedAt: job.completedAt,
      totalPhotos: job.attachments?.length ?? 0,
      checklistTotal: job.checklist?.length ?? 0,
      checklistCompleted: job.checklist?.filter((c) => c.checked).length ?? 0,
      hasSignature: !!job.customerSignature,
    },
  };
};

/**
 * Get Technician Schedule
 * Returns upcoming and recent jobs for a specific technician, sorted by scheduled date.
 * Admins and franchise managers can view any technician's schedule.
 * Technicians can only view their own.
 *
 * @param technicianId - The User ID of the technician
 * @param user - The requesting user
 * @returns Array of upcoming jobs for the technician
 * @throws ApiError if access is denied
 */
export const getTechnicianSchedule = async (technicianId: string, user: JwtAccessPayload) => {
  // Technicians can only view their own schedule
  if (user.role === "technician" && technicianId !== user.userId) {
    throw ApiError.forbidden("You can only view your own schedule");
  }

  const jobs = await InstallationJob.find({
    assignedTechnician: technicianId,
    status: { $in: ["scheduled", "in-progress"] }, // Only active/upcoming jobs
  })
    .populate("franchiseId", "name franchiseCode")
    .populate("cameraId", "name serialNumber location")
    .sort({ scheduledAt: 1 })
    .lean();

  return jobs;
};

/**
 * Update GPS Location
 * Technicians push their live GPS coordinates during an active job.
 * Stored on the job document as `gpsLocation`.
 *
 * @param technicianId - The User ID of the technician
 * @param lat - Current latitude
 * @param lng - Current longitude
 * @param user - The requesting technician
 * @returns The updated job document with new GPS data
 * @throws ApiError if no active job is found or access is denied
 */
export const updateGpsLocation = async (technicianId: string, lat: number, lng: number, user: JwtAccessPayload) => {
  // Only the technician themselves can update their GPS
  if (technicianId !== user.userId) {
    throw ApiError.forbidden("You can only update your own GPS location");
  }

  // Find the technician's active in-progress job
  const activeJob = await InstallationJob.findOneAndUpdate(
    { assignedTechnician: technicianId, status: "in-progress" },
    { gpsLocation: { lat, lng, updatedAt: new Date() } },
    { new: true, sort: { scheduledAt: -1 } }
  );

  // If no in-progress job, store GPS on the next scheduled job
  if (!activeJob) {
    const scheduledJob = await InstallationJob.findOneAndUpdate(
      { assignedTechnician: technicianId, status: "scheduled" },
      { gpsLocation: { lat, lng, updatedAt: new Date() } },
      { new: true, sort: { scheduledAt: 1 } }
    );
    if (!scheduledJob) throw ApiError.notFound("No active or scheduled job found for this technician");
    return { job: scheduledJob, gpsLocation: scheduledJob.gpsLocation };
  }

  return { job: activeJob, gpsLocation: activeJob.gpsLocation };
};
