/**
 * @file RecordingSchedule.ts
 * @description Mongoose model mapping a Camera to an array of Cron-like schedule rules.
 * Determines when a camera should automatically be recorded (e.g. 24/7 or custom hours).
 */
import mongoose, { Schema, Document, Model } from "mongoose";
import { IRecordingSchedule } from "../types";

export interface RecordingScheduleDocument
  extends Omit<IRecordingSchedule, "_id">,
    Document {}

/**
 * Sub-schema for individual schedule blocks (e.g., "Mondays from 09:00 to 17:00").
 */
const scheduleRuleSchema = new Schema(
  {
    daysOfWeek: {
      type: [Number],
      required: true,
      validate: {
        validator: function (arr: number[]) {
          return arr.every((day) => day >= 0 && day <= 6);
        },
        message: "Days of week must be between 0 (Sunday) and 6 (Saturday).",
      },
    },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):?([0-5]\d)$/, // HH:mm format
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):?([0-5]\d)$/, // HH:mm format
    },
    type: {
      type: String,
      enum: ["continuous", "motion"],
      required: true,
    },
  }
);

/**
 * Main Recording Schedule Schema
 * Enforces a one-to-one relationship with a Camera, containing an array of rules.
 */
const recordingScheduleSchema = new Schema<RecordingScheduleDocument>(
  {
    cameraId: {
      type: Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      unique: true, // One schedule document per camera
    },
    rules: [
      {
        daysOfWeek: {
          type: [Number],
          required: true,
          validate: {
            validator: function (arr: number[]) {
              return arr.every((day) => day >= 0 && day <= 6);
            },
            message: "Days of week must be between 0 (Sunday) and 6 (Saturday).",
          },
        },
        startTime: {
          type: String,
          required: true,
          match: /^([01]\d|2[0-3]):?([0-5]\d)$/, // HH:mm format
        },
        endTime: {
          type: String,
          required: true,
          match: /^([01]\d|2[0-3]):?([0-5]\d)$/, // HH:mm format
        },
        type: {
          type: String,
          enum: ["continuous", "motion"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

export const RecordingSchedule: Model<RecordingScheduleDocument> =
  mongoose.model<RecordingScheduleDocument>(
    "RecordingSchedule",
    recordingScheduleSchema
  );
