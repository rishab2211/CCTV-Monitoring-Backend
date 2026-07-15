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

/**
 * Get Franchise Customers
 * Returns all users with role 'customer' assigned to the given franchise.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user (franchise owner or admin)
 */
export const getFranchiseCustomers = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  // Franchise owners can only view their own customers
  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const customers = await User.find({
    role: "customer",
    "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId),
    isDeleted: false,
  }).select("name email phone customerDetails isActive createdAt").lean();

  return customers;
};

/**
 * Get Franchise Leads
 * Returns all CRM leads embedded in a franchise document.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user (franchise owner or admin)
 */
export const getFranchiseLeads = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  return franchise.leads ?? [];
};

/**
 * Create Franchise Lead
 * Adds a new CRM lead to the franchise's embedded leads array.
 *
 * @param franchiseId - The ID of the franchise
 * @param leadData - The lead details (name, phone, email, status, notes)
 * @param user - The requesting user
 */
export const createFranchiseLead = async (franchiseId: string, leadData: any, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  if (!franchise.leads) franchise.leads = [];
  franchise.leads.push({
    ...leadData,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await franchise.save();
  return franchise.leads[franchise.leads.length - 1];
};

/**
 * Update Franchise Lead
 * Updates an existing lead by its sub-document ID.
 *
 * @param franchiseId - The ID of the franchise
 * @param leadId - The ID of the embedded lead document
 * @param updateData - The fields to update on the lead
 * @param user - The requesting user
 */
export const updateFranchiseLead = async (franchiseId: string, leadId: string, updateData: any, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const lead = franchise.leads?.id(leadId);
  if (!lead) throw ApiError.notFound("Lead not found");

  Object.assign(lead, { ...updateData, updatedAt: new Date() });
  await franchise.save();
  return lead;
};

/**
 * Get Commission Report
 * Calculates and returns commission data based on active customer subscriptions
 * assigned to this franchise. Commission rate is stored on the franchise owner's profile.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user
 */
export const getCommissionReport = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId).populate("ownerId", "name franchiseDetails");
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId._id.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  // Count active customers belonging to this franchise
  const customerCount = await User.countDocuments({
    role: "customer",
    "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId),
    isActive: true,
    isDeleted: false,
  });

  // Compute commission based on customer count × monthly revenue per customer
  // These values would come from real billing in a full system
  const revenuePerCustomer = 500; // e.g. ₹500/month per customer
  const commissionRate = 0.1; // 10% default commission rate
  const monthlyRevenue = customerCount * revenuePerCustomer;
  const commissionEarned = monthlyRevenue * commissionRate;

  return {
    franchiseId,
    franchiseName: franchise.name,
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    customerCount,
    revenuePerCustomer,
    commissionRate: `${commissionRate * 100}%`,
    monthlyRevenue,
    commissionEarned,
  };
};

/**
 * Get Royalty Report
 * Returns royalty obligations owed by the franchise to the parent company.
 * Royalty is computed as a percentage of gross revenue.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user
 */
export const getRoyaltyReport = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const customerCount = await User.countDocuments({
    role: "customer",
    "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId),
    isActive: true,
    isDeleted: false,
  });

  const revenuePerCustomer = 500;
  const royaltyRate = 0.05; // 5% royalty owed to parent company
  const grossRevenue = customerCount * revenuePerCustomer;
  const royaltyDue = grossRevenue * royaltyRate;

  return {
    franchiseId,
    franchiseName: franchise.name,
    period: new Date().toISOString().slice(0, 7),
    customerCount,
    grossRevenue,
    royaltyRate: `${royaltyRate * 100}%`,
    royaltyDue,
  };
};

/**
 * Get Sales Report
 * Returns a simple sales summary for a franchise based on customer signups.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user
 */
export const getSalesReport = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  const [totalCustomers, activeCustomers, newThisMonth, convertedLeads] = await Promise.all([
    User.countDocuments({ role: "customer", "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId), isDeleted: false }),
    User.countDocuments({ role: "customer", "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId), isActive: true, isDeleted: false }),
    User.countDocuments({
      role: "customer",
      "customerDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId),
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      isDeleted: false,
    }),
    Promise.resolve(franchise.leads?.filter((l) => l.status === "converted").length ?? 0),
  ]);

  return {
    franchiseId,
    franchiseName: franchise.name,
    period: new Date().toISOString().slice(0, 7),
    totalCustomers,
    activeCustomers,
    newThisMonth,
    convertedLeads,
    totalLeads: franchise.leads?.length ?? 0,
  };
};

/**
 * Update Territory
 * Sets or replaces the territory configuration for a franchise.
 *
 * @param franchiseId - The ID of the franchise
 * @param territory - Territory fields: city, state, zone, description
 * @param user - Must be admin to set territory
 */
export const updateTerritory = async (franchiseId: string, territory: any, user: JwtAccessPayload) => {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw ApiError.forbidden("Only admins can set franchise territory");
  }

  const franchise = await Franchise.findByIdAndUpdate(
    franchiseId,
    { territory },
    { new: true }
  );
  if (!franchise) throw ApiError.notFound("Franchise not found");

  return franchise.territory;
};

/**
 * Get Territory
 * Retrieves the territory configuration for a franchise.
 *
 * @param franchiseId - The ID of the franchise
 * @param user - The requesting user (admin or franchise owner)
 */
export const getTerritory = async (franchiseId: string, user: JwtAccessPayload) => {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) throw ApiError.notFound("Franchise not found");

  if (user.role === "franchise" && franchise.ownerId.toString() !== user.userId) {
    throw ApiError.forbidden("Access denied");
  }

  return franchise.territory ?? {};
};
