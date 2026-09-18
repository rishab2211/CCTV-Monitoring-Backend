/**
 * @file seed-demo-data.ts
 * @description Comprehensive demo data seeder for client pitch and live demonstrations.
 * Populates realistic accounts (Super Admin, Franchise Admin, Operator, Customer),
 * active franchise, pre-configured RTSP cameras, subscription plan, alerts, and SOS events.
 *
 * Usage:
 *   bun scripts/seed-demo-data.ts
 */

import mongoose from "mongoose";
import { connectDB } from "../src/config/database";
import { User } from "../src/models/User";
import { Franchise } from "../src/models/Franchise";
import { Camera } from "../src/models/Camera";
import { Plan } from "../src/models/Plan";
import { Subscription } from "../src/models/Subscription";
import { Alert } from "../src/models/Alert";
import { SosAlert } from "../src/models/SosAlert";
import { seedPermissionsAndRoles } from "../src/config/permissions.seed";
import { logger } from "../src/utils/logger";

async function seedDemoData() {
  console.log("🌱 Starting CCTV Monitoring Platform Demo Seeder...");
  await connectDB();

  // 1. Ensure Roles & Permissions are synced first
  console.log("🔐 Verifying System Roles & Permissions...");
  await seedPermissionsAndRoles();

  // 2. Clean up existing demo records if present
  console.log("🧹 Cleaning up old demo data...");
  const demoEmails = [
    "admin@cctv.com",
    "franchise@cctv.com",
    "operator@cctv.com",
    "customer@cctv.com",
  ];
  await User.deleteMany({ email: { $in: demoEmails } });
  await Franchise.deleteMany({ franchiseCode: "FR-METRO-01" });
  await Camera.deleteMany({ serialNumber: { $in: ["CAM-ENTRANCE-01", "CAM-WAREHOUSE-02", "CAM-PARKING-03"] } });
  await Plan.deleteMany({ name: "Commercial Ultra 24/7 Guardian" });

  // 3. Create Super Admin
  console.log("👤 Creating Super Admin (admin@cctv.com)...");
  const superAdmin = await User.create({
    name: "Alex Vance (Super Admin)",
    email: "admin@cctv.com",
    phone: "9876543210",
    password: "Admin@123",
    role: "super_admin",
    isActive: true,
  });

  // 4. Create Franchise Admin User
  console.log("🏢 Creating Franchise Partner Admin (franchise@cctv.com)...");
  const franchiseAdmin = await User.create({
    name: "Marcus Sterling (Franchise Owner)",
    email: "franchise@cctv.com",
    phone: "9876543211",
    password: "Franchise@123",
    role: "franchise_admin",
    isActive: true,
  });

  // 5. Create Franchise Document
  console.log("🏛️  Creating Franchise Document (Metro Surveillance Services)...");
  const demoFranchise = await Franchise.create({
    name: "Metro Security & Surveillance Services",
    franchiseCode: "FR-METRO-01",
    ownerId: franchiseAdmin._id,
    contactEmail: "franchise@cctv.com",
    contactPhone: "9876543211",
    address: "Tower 4, Bandra Kurla Complex, Mumbai, MH",
    status: "active",
    territory: {
      city: "Mumbai",
      state: "Maharashtra",
      zone: "Zone 1 - Central Business District",
      description: "Premier enterprise and commercial security territory.",
    },
    leads: [
      {
        name: "Apex Logistics Hub",
        phone: "9820011223",
        email: "security@apexlogistics.com",
        status: "qualified",
        notes: "Requires 12 high-definition cameras for cargo monitoring.",
      },
    ],
  });

  // Update franchiseAdmin with franchise details
  franchiseAdmin.franchiseDetails = {
    franchiseRef: demoFranchise._id as any,
    territory: {
      city: "Mumbai",
      state: "Maharashtra",
      zone: "Zone 1 - Central Business District",
    },
    commissionRate: 15,
    royaltyRate: 5,
    franchiseCode: "FR-METRO-01",
  };
  await franchiseAdmin.save();

  // 6. Create Dedicated Operator User
  console.log("🎧 Creating Monitoring Operator (operator@cctv.com)...");
  const operator = await User.create({
    name: "Rajesh Kumar (Command Operator)",
    email: "operator@cctv.com",
    phone: "9876543212",
    password: "Operator@123",
    role: "operator",
    isActive: true,
    operatorDetails: {
      assignedFranchise: demoFranchise._id as any,
      shift: "day",
      assignedCameras: [],
      isOnShift: true,
    },
  });

  // 7. Create Customer User
  console.log("📱 Creating Customer Account (customer@cctv.com)...");
  const customer = await User.create({
    name: "Vikram Malhotra (Property Owner)",
    email: "customer@cctv.com",
    phone: "9876543213",
    password: "Customer@123",
    role: "customer",
    isActive: true,
    customerDetails: {
      assignedFranchise: demoFranchise._id as any,
      billingAddress: {
        street: "702 Pinnacle Towers, Nariman Point",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400021",
        country: "India",
      },
      emergencyContact: {
        name: "Sunita Malhotra",
        phone: "9876543299",
        relation: "Spouse",
      },
    },
  });

  // 8. Create Commercial Subscription Plan
  console.log("💳 Creating Commercial Subscription Plan...");
  const demoPlan = await Plan.create({
    name: "Commercial Ultra 24/7 Guardian",
    description: "Full-tier 24/7 live monitoring, WebRTC sub-second feeds, cloud playback & emergency dispatch.",
    price: 4999,
    durationMonths: 12,
    cameraLimit: 8,
    features: [
      "24/7 Live Monitoring by Certified Operators",
      "Sub-second WebRTC Low Latency Video",
      "30-Day Cloud Playback Archive",
      "3-Second Emergency SOS Instant Dispatch",
      "Two-Way Audio Talkback Support",
    ],
    isActive: true,
  });

  // Create Active Customer Subscription
  await Subscription.create({
    customerId: customer._id,
    planId: demoPlan._id,
    franchiseId: demoFranchise._id,
    status: "active",
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    autoRenew: true,
    pricePaid: 4999,
  });

  // 9. Create 3 RTSP Demo Cameras
  console.log("📹 Creating 3 Demo Cameras linked to MediaMTX paths...");
  const camera1 = await Camera.create({
    name: "Main Entrance & Reception",
    serialNumber: "CAM-ENTRANCE-01",
    rtspUrl: "rtsp://localhost:8554/cam_entrance",
    status: "online",
    customerId: customer._id,
    operatorIds: [operator._id],
    franchiseId: demoFranchise._id,
    location: {
      address: "Pinnacle Towers, Nariman Point",
      city: "Mumbai",
      zone: "Main Gate",
    },
    recordingSettings: {
      continuous: true,
      retentionDays: 30,
    },
    aiCapabilities: {
      motionDetection: true,
      humanDetection: true,
      vehicleDetection: false,
    },
  });

  const camera2 = await Camera.create({
    name: "Warehouse Loading Bay",
    serialNumber: "CAM-WAREHOUSE-02",
    rtspUrl: "rtsp://localhost:8554/cam_warehouse",
    status: "online",
    customerId: customer._id,
    operatorIds: [operator._id],
    franchiseId: demoFranchise._id,
    location: {
      address: "Pinnacle Towers, Nariman Point",
      city: "Mumbai",
      zone: "Loading Dock 2",
    },
    recordingSettings: {
      continuous: true,
      retentionDays: 30,
    },
    aiCapabilities: {
      motionDetection: true,
      humanDetection: true,
      vehicleDetection: true,
    },
  });

  const camera3 = await Camera.create({
    name: "Perimeter Parking Area",
    serialNumber: "CAM-PARKING-03",
    rtspUrl: "rtsp://localhost:8554/cam_parking",
    status: "online",
    customerId: customer._id,
    operatorIds: [operator._id],
    franchiseId: demoFranchise._id,
    location: {
      address: "Pinnacle Towers, Nariman Point",
      city: "Mumbai",
      zone: "North Parking Lot",
    },
    recordingSettings: {
      continuous: true,
      retentionDays: 14,
    },
    aiCapabilities: {
      motionDetection: true,
      humanDetection: true,
      vehicleDetection: true,
    },
  });

  // Assign cameras to operator details
  await User.findByIdAndUpdate(operator._id, {
    $set: {
      "operatorDetails.assignedCameras": [camera1._id, camera2._id, camera3._id],
    },
  });

  // 10. Create Sample Alerts and Emergency SOS Record
  console.log("🚨 Creating Sample Alerts & SOS History...");
  await Alert.create({
    cameraId: camera1._id,
    franchiseId: demoFranchise._id,
    createdBy: customer._id,
    type: "motion",
    priority: "medium",
    status: "resolved",
    description: "After-hours movement detected at main reception foyer.",
    assignedTo: operator._id,
    resolvedAt: new Date(Date.now() - 3600000),
  });

  await Alert.create({
    cameraId: camera2._id,
    franchiseId: demoFranchise._id,
    createdBy: customer._id,
    type: "hazard",
    priority: "high",
    status: "acknowledged",
    description: "Unidentified vehicle parked across loading bay fire exit.",
    assignedTo: operator._id,
  });

  await SosAlert.create({
    triggeredBy: customer._id,
    cameraId: camera1._id,
    franchiseId: demoFranchise._id,
    location: "Main Entrance Foyer (Pinnacle Towers)",
    status: "resolved",
    acknowledgedBy: operator._id,
    acknowledgedAt: new Date(Date.now() - 7200000),
    resolvedBy: operator._id,
    resolvedAt: new Date(Date.now() - 6900000),
    resolutionNotes: "Operator confirmed security guard on duty neutralized threat.",
  });

  console.log("\n============================================================");
  console.log("🎉 DEMO SEEDING COMPLETED SUCCESSFULLY!");
  console.log("============================================================");
  console.log("Use these credentials to test or pitch each role:\n");
  console.log("1. 🛡️  Super Admin (Global Portal Access):");
  console.log("   Email:    admin@cctv.com");
  console.log("   Password: Admin@123\n");
  console.log("2. 🏢 Franchise Admin (Franchise Owner):");
  console.log("   Email:    franchise@cctv.com");
  console.log("   Password: Franchise@123\n");
  console.log("3. 🎧 Central Monitoring Operator (Operator Mobile App):");
  console.log("   Email:    operator@cctv.com");
  console.log("   Password: Operator@123\n");
  console.log("4. 📱 Customer / Property Owner (Customer Mobile App):");
  console.log("   Email:    customer@cctv.com");
  console.log("   Password: Customer@123\n");
  console.log("🎥 Active Demo Cameras:");
  console.log("   • CAM-ENTRANCE-01  -> rtsp://localhost:8554/cam_entrance");
  console.log("   • CAM-WAREHOUSE-02 -> rtsp://localhost:8554/cam_warehouse");
  console.log("   • CAM-PARKING-03   -> rtsp://localhost:8554/cam_parking");
  console.log("============================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

seedDemoData().catch((err) => {
  console.error("❌ Demo Seed Failed:", err);
  process.exit(1);
});
