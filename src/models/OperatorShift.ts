import mongoose, { Schema, Document, Model } from "mongoose";
import { IOperatorShift } from "../types";

/**
 * Interface mapping the IOperatorShift definition to a Mongoose Document.
 */
export interface OperatorShiftDocument extends Omit<IOperatorShift, "_id">, Document {}

/**
 * OperatorShift Schema
 * 
 * Tracks the lifecycle of an operator's shift, from the moment they clock in
 * to the moment they clock out. Calculates performance metrics (incidents resolved,
 * SOS acknowledged) for that specific shift block.
 */
const operatorShiftSchema = new Schema<OperatorShiftDocument>(
  {
    operatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    handoverNotes: {
      type: String,
      trim: true,
    },
    metrics: {
      incidentsResolved: { type: Number, default: 0 },
      sosAcknowledged: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
operatorShiftSchema.index({ operatorId: 1, startTime: -1 });

export const OperatorShift: Model<OperatorShiftDocument> = mongoose.model<OperatorShiftDocument>(
  "OperatorShift",
  operatorShiftSchema
);
