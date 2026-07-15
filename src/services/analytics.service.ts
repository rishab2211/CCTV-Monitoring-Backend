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

// Helper to check admin access
const ensureAdmin = (user: JwtAccessPayload) => {
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw ApiError.forbidden("Analytics are restricted to administrators");
  }
};

/**
 * 1. Main Dashboard Analytics
 */
export const getDashboardAnalytics = async (user: JwtAccessPayload) => {
  ensureAdmin(user);

  const [
    totalUsers,
    totalCameras,
    activeIncidents,
    recentPayments,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    Camera.countDocuments({ isDeleted: false }),
    Incident.countDocuments({ status: { $in: ["open", "investigating"] } }),
    Payment.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, totalRevenue: { $sum: "$amount" } } }
    ])
  ]);

  return {
    totalUsers,
    totalCameras,
    activeIncidents,
    totalRevenue: recentPayments[0]?.totalRevenue || 0,
    generatedAt: new Date()
  };
};

/**
 * 2. Alert Analytics
 */
export const getAlertAnalytics = async (user: JwtAccessPayload) => {
  ensureAdmin(user);

  const stats = await Alert.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const severityStats = await Alert.aggregate([
    {
      $group: {
        _id: "$severity",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    statusBreakdown: stats,
    severityBreakdown: severityStats,
    generatedAt: new Date()
  };
};

/**
 * 3. Camera Analytics
 */
export const getCameraAnalytics = async (user: JwtAccessPayload) => {
  ensureAdmin(user);

  const statusStats = await Camera.aggregate([
    { $match: { isDeleted: false } },
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
  ensureAdmin(user);

  const performance = await OperatorShift.aggregate([
    {
      $group: {
        _id: "$operatorId",
        totalShifts: { $sum: 1 },
        totalDurationMs: { $sum: { $subtract: ["$endTime", "$startTime"] } },
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
  ensureAdmin(user);

  // Group by month
  const revenueByMonth = await Payment.aggregate([
    { $match: { status: "paid" } },
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
  ensureAdmin(user);

  const stats = await Subscription.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const byPlan = await Subscription.aggregate([
    { $match: { status: "active" } },
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
  ensureAdmin(user);

  const stats = await Incident.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const typeStats = await Incident.aggregate([
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
  ensureAdmin(user);

  const stats = await Franchise.aggregate([
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
