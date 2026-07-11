import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IRole {
  _id: mongoose.Types.ObjectId;
  name: string;          // "admin" | "franchise" | "my_custom_role" — unique slug
  displayName: string;   // "System Administrator"
  description: string;
  isSystem: boolean;     // true for the 6 built-in roles — cannot be deleted
  permissions: string[]; // array of permission names: ["cameras:read", "alerts:write"]
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDocument extends Omit<IRole, "_id">, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const roleSchema = new Schema<RoleDocument>(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      unique: true,
      trim: true,
      lowercase: true,
      // slug format: lowercase letters, numbers, underscores
      match: [/^[a-z0-9_]+$/, "Role name must be lowercase letters, numbers, or underscores"],
      maxlength: 50,
    },
    displayName: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    permissions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

roleSchema.index({ isSystem: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const Role: Model<RoleDocument> =
  mongoose.model<RoleDocument>("Role", roleSchema);
