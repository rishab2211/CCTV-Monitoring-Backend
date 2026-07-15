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
  if (user.role !== "super_admin" && user.role !== "admin" && user.role !== "franchise") {
    throw ApiError.forbidden("You do not have permission to create jobs");
  }

  const { title, description, type, assignedTechnician, franchiseId, cameraId, scheduledAt } = input;

  // Validate Technician
  const tech = await User.findOne({ _id: assignedTechnician, role: "technician", isDeleted: false });
  if (!tech) {
    throw ApiError.badRequest("Invalid technician assigned. User must have the 'technician' role.");
  }

  // If Franchise Manager is creating the job, automatically lock to their franchise
  let actualFranchiseId = franchiseId;
  if (user.role === "franchise") {
    const ownedFranchise = await Franchise.findOne({ ownerId: user.userId });
    if (!ownedFranchise) throw ApiError.forbidden("No active franchise found for this user");
    actualFranchiseId = ownedFranchise._id.toString();
  }

  // Validate Camera if provided
  if (cameraId) {
    const camera = await Camera.findOne({ _id: cameraId, isDeleted: false });
    if (!camera) throw ApiError.notFound("Camera not found");
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
  } else if (user.role === "franchise") {
    const ownedFranchise = await Franchise.findOne({ ownerId: user.userId });
    if (!ownedFranchise) throw ApiError.forbidden("No active franchise found for this user");
    filter.franchiseId = ownedFranchise._id;
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

  if (user.role === "franchise") {
    const ownedFranchise = await Franchise.findOne({ ownerId: user.userId });
    if (!ownedFranchise || job.franchiseId?._id.toString() !== ownedFranchise._id.toString()) {
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

  if (user.role === "franchise") {
    const ownedFranchise = await Franchise.findOne({ ownerId: user.userId });
    if (!ownedFranchise || job.franchiseId?.toString() !== ownedFranchise._id.toString()) {
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
