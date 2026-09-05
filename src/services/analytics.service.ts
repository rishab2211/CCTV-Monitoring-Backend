/**
 * @file analytics.service.ts
 * @description Aggregation logic for Analytics & Reports (Module 17).
 */
import { User } from "../models/User";
import { Camera } from "../models/Camera";
import { Alert } from "../models/Alert";
import { Incident } from "../models/Incident";
import { Subscription } from "../models/Subscription";
import { Payment } from "../models/Payment";
import { OperatorShift } from "../models/OperatorShift";
import { Franchise } from "../models/Franchise";
import { JwtAccessPayload } from "../types";
import { ApiError } from "../utils/ApiError";
import mongoose from "mongoose";

const ensureAdminOrFranchise = (user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "franchise" && user.role !== "franchise_admin") {
    throw ApiError.forbidden("Analytics are restricted to administrators and franchise managers");
  }
  return (user.role === "franchise" || user.role === "franchise_admin") ? user.franchiseId : null;
};

/**
 * 1. Main Dashboard Analytics
 */
export const getDashboardAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  
  const userMatch: Record<string, unknown> = { isDeleted: false };
  const cameraMatch: Record<string, unknown> = { isDeleted: false };
  const incidentMatch: Record<string, unknown> = { status: { $in: ["open", "investigating"] } };
  const paymentMatch: Record<string, unknown> = { status: "paid" };

  if (franchiseId) {
    const fId = new mongoose.Types.ObjectId(franchiseId);
    userMatch["$or"] = [
      { "customerDetails.assignedFranchise": fId },
      { "operatorDetails.assignedFranchise": fId },
      { "technicianDetails.assignedFranchise": fId }
    ];
    cameraMatch.franchiseId = fId;
    incidentMatch.franchiseId = fId;
    paymentMatch.franchiseId = fId;
  }

  const [
    totalUsers,
    totalCameras,
    activeIncidents,
    recentPayments,
  ] = await Promise.all([
    User.countDocuments(userMatch),
    Camera.countDocuments(cameraMatch),
    Incident.countDocuments(incidentMatch),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, totalRevenue: { $sum: "$amount" } } }
    ])
  ]);

  return {
    totalUsers,
    totalCameras,
    activeIncidents,
    totalRevenue: (recentPayments[0]?.totalRevenue || 0) / 100,
    generatedAt: new Date()
  };

};

/**
 * 2. Alert Analytics
 */
export const getAlertAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage = franchiseId ? { $match: { franchiseId: new mongoose.Types.ObjectId(franchiseId) } } : { $match: {} };

  const stats = await Alert.aggregate([
    matchStage,
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const priorityStats = await Alert.aggregate([
    matchStage,
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    statusBreakdown: stats,
    priorityBreakdown: priorityStats,
    generatedAt: new Date()
  };
};

/**
 * 3. Camera Analytics
 */
export const getCameraAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage: Record<string, unknown> = { isDeleted: false };
  if (franchiseId) matchStage.franchiseId = new mongoose.Types.ObjectId(franchiseId);

  const statusStats = await Camera.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    statusBreakdown: statusStats,
    generatedAt: new Date()
  };
};

/**
 * 4. Operator Performance
 */
export const getOperatorAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);

  let initialMatch: Record<string, any> = {};
  if (franchiseId) {
    const operatorUsers = await User.find({
      "operatorDetails.assignedFranchise": new mongoose.Types.ObjectId(franchiseId),
      isDeleted: false,
    }).select("_id");
    const operatorIds = operatorUsers.map((u) => u._id);
    initialMatch = { operatorId: { $in: operatorIds } };
  }

  const performance = await OperatorShift.aggregate([
    { $match: initialMatch },
    {
      $group: {
        _id: "$operatorId",
        totalShifts: { $sum: 1 },
        totalDurationMs: { $sum: { $subtract: [{ $ifNull: ["$endTime", "$$NOW"] }, "$startTime"] } },

        incidentsResolved: { $sum: "$metrics.incidentsResolved" }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "operator"
      }
    },
    { $unwind: "$operator" },
    {
      $project: {
        operatorName: "$operator.name",
        operatorEmail: "$operator.email",
        totalShifts: 1,
        totalDurationMs: 1,
        incidentsResolved: 1
      }
    },
    { $sort: { incidentsResolved: -1 } }
  ]);

  return {
    operatorPerformance: performance,
    generatedAt: new Date()
  };
};

/**
 * 5. Revenue Analytics
 */
export const getRevenueAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage: Record<string, unknown> = { status: "paid", paidAt: { $ne: null } };
  if (franchiseId) matchStage.franchiseId = new mongoose.Types.ObjectId(franchiseId);

  // Group by month
  const revenueByMonth = await Payment.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { 
          year: { $year: "$paidAt" }, 
          month: { $month: "$paidAt" } 
        },
        monthlyRevenue: { $sum: "$amount" },
        transactionCount: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ]);

  return {
    revenueByMonth,
    generatedAt: new Date()
  };
};

/**
 * 6. Subscription Growth
 */
export const getSubscriptionAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage = franchiseId ? { $match: { franchiseId: new mongoose.Types.ObjectId(franchiseId) } } : { $match: {} };

  const stats = await Subscription.aggregate([
    matchStage,
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const matchStage2: Record<string, unknown> = { status: "active" };
  if (franchiseId) matchStage2.franchiseId = new mongoose.Types.ObjectId(franchiseId);

  const byPlan = await Subscription.aggregate([
    { $match: matchStage2 },
    {
      $group: {
        _id: "$planName",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    statusBreakdown: stats,
    activeByPlan: byPlan,
    generatedAt: new Date()
  };
};

/**
 * 7. Incident Resolution Stats
 */
export const getIncidentAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage = franchiseId ? { $match: { franchiseId: new mongoose.Types.ObjectId(franchiseId) } } : { $match: {} };

  const stats = await Incident.aggregate([
    matchStage,
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const typeStats = await Incident.aggregate([
    matchStage,
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    statusBreakdown: stats,
    typeBreakdown: typeStats,
    generatedAt: new Date()
  };
};

/**
 * 8. Franchise Performance
 */
export const getFranchiseAnalytics = async (user: JwtAccessPayload) => {
  const franchiseId = ensureAdminOrFranchise(user);
  const matchStage = franchiseId ? { $match: { _id: new mongoose.Types.ObjectId(franchiseId) } } : { $match: {} };

  const stats = await Franchise.aggregate([
    matchStage,
    {
      $lookup: {
        from: "users",
        let: { franchiseId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerDetails.assignedFranchise", "$$franchiseId"] } } }
        ],
        as: "customers"
      }
    },
    {
      $project: {
        name: 1,
        status: 1,
        customerCount: { $size: "$customers" }
      }
    },
    { $sort: { customerCount: -1 } }
  ]);

  return {
    franchises: stats,
    generatedAt: new Date()
  };
};
