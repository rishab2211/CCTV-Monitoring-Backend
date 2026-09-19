/**
 * @file demo-seed.ts
 * @description Safe, idempotent demo seeder for Render/production demo environments.
 * Ensures the standard pitch demo accounts (Super Admin, Operator, Customer, Franchise)
 * and the 3 live synthetic RTSP cameras exist and are linked to MediaMTX feeds.
 */
import mongoose from "mongoose";
import { User } from "../models/User";
import { Franchise } from "../models/Franchise";
import { Camera } from "../models/Camera";
import { Plan } from "../models/Plan";
import { Subscription } from "../models/Subscription";
import { Alert } from "../models/Alert";
import { logger } from "../utils/logger";

export const ensureDemoDataSeeded = async (): Promise<void> => {
  try {
    logger.info("🌱 [Demo Sync] Verifying demo cameras and accounts for live pitch...");

    // 1. Ensure Super Admin exists
    let superAdmin = await User.findOne({ email: "admin@cctv.com" });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: "Alex Vance (Super Admin)",
        email: "admin@cctv.com",
        phone: "9876543210",
        password: "Admin@123",
        role: "super_admin",
        isActive: true,
      });
      logger.info("👤 [Demo Sync] Created demo Super Admin (admin@cctv.com)");
    }

    // 2. Ensure Franchise Admin & Franchise Document exist
    let franchiseAdmin = await User.findOne({ email: "franchise@cctv.com" });
    if (!franchiseAdmin) {
      franchiseAdmin = await User.create({
        name: "Marcus Sterling (Franchise Owner)",
        email: "franchise@cctv.com",
        phone: "9876543288",
        password: "Franchise@123",
        role: "franchise_admin",
        isActive: true,
      });
    }

    let franchise = await Franchise.findOne({ franchiseCode: "FR-METRO-01" });
    if (!franchise) {
      franchise = await Franchise.create({
        name: "Metro Security & Surveillance Services",
        franchiseCode: "FR-METRO-01",
        ownerId: franchiseAdmin._id,
        contactEmail: "franchise@cctv.com",
        contactPhone: "9876543288",
        address: "Tower 4, Bandra Kurla Complex, Mumbai, MH",
        status: "active",
        territory: {
          city: "Mumbai",
          state: "Maharashtra",
          zone: "Zone 1 - Central Business District",
          description: "Premier enterprise and commercial security territory.",
        },
      });

      franchiseAdmin.franchiseDetails = {
        franchiseRef: franchise._id as any,
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
    }

    // 3. Ensure Operator User exists
    let operator = await User.findOne({ email: "operator@cctv.com" });
    if (!operator) {
      operator = await User.create({
        name: "Rajesh Kumar (Command Operator)",
        email: "operator@cctv.com",
        phone: "9876543289",
        password: "Operator@123",
        role: "operator",
        isActive: true,
        operatorDetails: {
          assignedFranchise: franchise._id as any,
          shift: "day",
          assignedCameras: [],
          isOnShift: true,
        },
      });
    }

    // 4. Ensure Customer User exists
    let customer = await User.findOne({ email: "customer@cctv.com" });
    if (!customer) {
      customer = await User.create({
        name: "Vikram Malhotra (Property Owner)",
        email: "customer@cctv.com",
        phone: "9876543290",
        password: "Customer@123",
        role: "customer",
        isActive: true,
        customerDetails: {
          assignedFranchise: franchise._id as any,
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
    }

    // 5. Ensure Subscription Plan & Active Subscription exist
    let plan = await Plan.findOne({ name: "Commercial Ultra 24/7 Guardian" });
    if (!plan) {
      plan = await Plan.create({
        name: "Commercial Ultra 24/7 Guardian",
        description: "Full-tier 24/7 live monitoring, WebRTC & Low-Latency HLS feeds, cloud playback & emergency dispatch.",
        price: 4999,
        durationMonths: 12,
        cameraLimit: 8,
        features: [
          "24/7 Live Monitoring by Certified Operators",
          "Sub-second Low-Latency Video",
          "30-Day Cloud Playback Archive",
          "3-Second Emergency SOS Instant Dispatch",
          "Two-Way Audio Talkback Support",
        ],
        isActive: true,
      });
    }

    const activeSub = await Subscription.findOne({ customerId: customer._id, status: "active" });
    if (!activeSub) {
      await Subscription.create({
        customerId: customer._id,
        planId: plan._id,
        planName: plan.name,
        franchiseId: franchise._id,
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        autoRenew: true,
        price: 4999,
      });
    }

    // 6. Ensure the 3 Demo Cameras exist
    const demoCamerasConfig = [
      {
        name: "Main Entrance & Reception",
        serialNumber: "CAM-ENTRANCE-01",
        rtspUrl: "rtsp://localhost:8554/cam_entrance",
        location: { address: "Pinnacle Towers, Nariman Point", city: "Mumbai", zone: "Main Gate" },
      },
      {
        name: "Warehouse Loading Bay",
        serialNumber: "CAM-WAREHOUSE-02",
        rtspUrl: "rtsp://localhost:8554/cam_warehouse",
        location: { address: "Pinnacle Towers, Nariman Point", city: "Mumbai", zone: "Loading Dock 2" },
      },
      {
        name: "Perimeter Parking Area",
        serialNumber: "CAM-PARKING-03",
        rtspUrl: "rtsp://localhost:8554/cam_parking",
        location: { address: "Pinnacle Towers, Nariman Point", city: "Mumbai", zone: "North Parking Lot" },
      },
    ];

    const cameraIds: mongoose.Types.ObjectId[] = [];

    for (const camCfg of demoCamerasConfig) {
      let cam = await Camera.findOne({ serialNumber: camCfg.serialNumber });
      if (!cam) {
        cam = await Camera.create({
          name: camCfg.name,
          serialNumber: camCfg.serialNumber,
          rtspUrl: camCfg.rtspUrl,
          status: "online",
          customerId: customer._id,
          operatorIds: [operator._id],
          franchiseId: franchise._id,
          location: camCfg.location,
          settings: {
            talkbackEnabled: true,
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
        logger.info(`📹 [Demo Sync] Created demo camera: ${cam.name} (${cam.serialNumber})`);
      } else {
        // Ensure status is online and settings enable talkback
        cam.status = "online";
        cam.rtspUrl = camCfg.rtspUrl;
        cam.settings = { ...cam.settings, talkbackEnabled: true };
        await cam.save();
      }
      cameraIds.push(cam._id as mongoose.Types.ObjectId);
    }

    // Assign cameras to operator
    if (operator) {
      await User.findByIdAndUpdate(operator._id, {
        $set: { "operatorDetails.assignedCameras": cameraIds },
      });
    }

    logger.info("✅ [Demo Sync] Demo accounts & 3 live synthetic CCTV cameras verified and ready!");
  } catch (err: any) {
    logger.warn(`⚠️ [Demo Sync] Non-fatal demo sync error: ${err.message}`);
  }
};
