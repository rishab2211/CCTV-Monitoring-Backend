/**
 * @file franchise.service.ts
 * @description Business logic for the Franchise Management Module.
 */
import mongoose from "mongoose";
import { Franchise } from "../models/Franchise";
import { User } from "../models/User";
import { Camera } from "../models/Camera";
import { ApiError } from "../utils/ApiError";
import { JwtAccessPayload } from "../types";
import { logActivity } from "../models/ActivityLog";
import * as notificationService from "./notification.service";

/**
 * Create a new Franchise
 * Provisions a new franchise entity in the database.
 * 
 * @param input - The franchise details including name, code, owner, and contact info
 * @param user - The requesting user (must be super_admin or admin)
 * @returns The newly created Franchise document
 * @throws ApiError if the user lacks permissions, owner is invalid, or code is a duplicate
 */
export const createFranchise = async (input: any, user: JwtAccessPayload) => {
  // Only super_admin or admin can create a franchise
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Only admins can create a franchise");
  }

  const { name, franchiseCode, ownerId, contactEmail, contactPhone, address } = input;

  // Check if owner exists and has role 'franchise'
  const owner = await User.findById(ownerId);
  if (!owner) throw ApiError.notFound("Owner User not found");
  if (owner.role !== "franchise") {
    throw ApiError.badRequest("Owner User must have the 'franchise' role");
  }

  // Check if code exists
  const existing = await Franchise.findOne({ franchiseCode });
  if (existing) throw ApiError.conflict("Franchise code already in use");

  const franchise = await Franchise.create({
    name,
    franchiseCode,
    ownerId,
    contactEmail,
    contactPhone,
    address,
  });

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "FRANCHISE_CREATED",
    description: `Created Franchise: ${name} (${franchiseCode})`,
    metadata: { franchiseId: franchise._id },
  });

  return franchise;
};

/**
 * List Franchises
 * Retrieves a paginated list of all franchises along with aggregated statistics 
 * (number of cameras, customers, and operators assigned to each).
 * 
 * @param query - Pagination and filtering parameters (page, limit, status)
 * @param user - The requesting user (must be super_admin or admin)
 * @returns An object containing the populated franchises and pagination metadata
 * @throws ApiError if the user lacks permissions
 */
export const listFranchises = async (query: any, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Only admins can list all franchises");
  }

  const { page = 1, limit = 20, status } = query;
  const filter: any = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [franchises, total] = await Promise.all([
    Franchise.find(filter)
      .populate("ownerId", "name email")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Franchise.countDocuments(filter),
  ]);

  // Aggregate stats (users/cameras count) per franchise
  const populatedFranchises = await Promise.all(
    franchises.map(async (f) => {
      const [cameraCount, customerCount, operatorCount] = await Promise.all([
        Camera.countDocuments({ franchiseId: f._id, isDeleted: false }),
        User.countDocuments({ "customerDetails.assignedFranchise": f._id, isDeleted: false }),
        User.countDocuments({ "operatorDetails.assignedFranchise": f._id, isDeleted: false }),
      ]);
      return {
        ...f,
        stats: {
          cameraCount,
          customerCount,
          operatorCount,
        },
      };
    })
  );

  return { franchises: populatedFranchises, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
};

/**
 * Get Franchise Details
 * Retrieves detailed information about a specific franchise, including owner data.
 * 
 * @param id - The ID of the franchise to fetch
 * @param user - The requesting user
 * @returns The Franchise document with populated owner details
 * @throws ApiError if the franchise is not found or the user lacks access
 */
export const getFranchiseDetails = async (id: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(id).populate("ownerId", "name email phone");
  if (!franchise) throw ApiError.notFound("Franchise not found");

  // Admins can see any. Franchise owners can see their own.
  if (user.role === "franchise" && franchise.ownerId._id.toString() !== user.userId) {
    throw ApiError.forbidden("You do not have access to this franchise");
  }

  return franchise;
};

/**
 * Update Franchise (including suspend)
 * Modifies franchise details or changes its status (e.g., to 'suspended').
 * If a franchise is suspended, its owner is notified and all child users are blocked from logging in.
 * 
 * @param id - The ID of the franchise to update
 * @param updateData - The fields to update
 * @param user - The requesting user (must be super_admin or admin)
 * @returns The updated Franchise document
 * @throws ApiError if the franchise is not found or the user lacks permissions
 */
export const updateFranchise = async (id: string, updateData: any, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Only admins can update franchises");
  }

  const franchise = await Franchise.findById(id);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  const originalStatus = franchise.status;

  Object.assign(franchise, updateData);
  await franchise.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: updateData.status && updateData.status !== originalStatus ? "FRANCHISE_SUSPENDED" : "FRANCHISE_UPDATED",
    description: `Updated Franchise: ${franchise.name}`,
    metadata: { franchiseId: id },
  });

  // If suspended, notify the owner
  if (updateData.status === "suspended" && originalStatus === "active") {
    await notificationService.sendNotification(
      franchise.ownerId.toString(),
      "Franchise Suspended",
      `Your franchise ${franchise.name} has been suspended. Customers and operators under this franchise cannot log in.`,
      "system"
    ).catch(() => {});
  }

  return franchise;
};

/**
 * Assign User to Franchise
 * Re-assigns a customer or operator to a specific franchise by updating their `assignedFranchise` field.
 * 
 * @param franchiseId - The ID of the target franchise
 * @param targetUserId - The ID of the user (customer or operator) being assigned
 * @param user - The requesting admin user
 * @returns The updated User document
 * @throws ApiError if either entity is not found, or if trying to assign a non-applicable role
 */
export const assignUserToFranchise = async (franchiseId: string, targetUserId: string, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Only admins can assign users to franchises");
  }

  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) throw ApiError.notFound("Target User not found");

  if (targetUser.role === "customer" && targetUser.customerDetails) {
    targetUser.customerDetails.assignedFranchise = new mongoose.Types.ObjectId(franchiseId);
  } else if (targetUser.role === "operator" && targetUser.operatorDetails) {
    targetUser.operatorDetails.assignedFranchise = new mongoose.Types.ObjectId(franchiseId);
  } else {
    throw ApiError.badRequest("Only customers and operators can be assigned to a franchise");
  }

  await targetUser.save();

  logActivity({
    userId: new mongoose.Types.ObjectId(user.userId),
    action: "USER_UPDATED",
    description: `Assigned ${targetUser.role} ${targetUser.name} to franchise ${franchise.name}`,
    metadata: { targetUserId, franchiseId },
  });

  return targetUser;
};
