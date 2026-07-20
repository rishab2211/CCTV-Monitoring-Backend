import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITicketComment {
  text: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory = "billing" | "technical" | "account" | "general";

export interface ITicket {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  franchiseId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  comments: ITicketComment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketDocument extends Omit<ITicket, "_id">, Document {}

const ticketCommentSchema = new Schema<ITicketComment>(
  {
    text: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new Schema<TicketDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      required: true,
    },
    category: {
      type: String,
      enum: ["billing", "technical", "account", "general"],
      default: "general",
      required: true,
    },
    franchiseId: {
      type: Schema.Types.ObjectId,
      ref: "Franchise",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    comments: [ticketCommentSchema],
  },
  { timestamps: true }
);

ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ createdAt: -1 });

export const Ticket: Model<TicketDocument> = mongoose.model<TicketDocument>("Ticket", ticketSchema);
