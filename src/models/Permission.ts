import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPermission {
  _id: mongoose.Types.ObjectId;
  name: string;       // "cameras:read" — unique identifier used everywhere
  resource: string;   // "cameras"
  action: string;     // "read"
  description: string;
  isSystem: boolean;  // system permissions cannot be deleted via API
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionDocument extends Omit<IPermission, "_id">, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const permissionSchema = new Schema<PermissionDocument>(
  {
    name: {
      type: String,
      required: [true, "Permission name is required"],
      unique: true,
      trim: true,
      lowercase: true,
      // Must follow "resource:action" format
      match: [/^[a-z_]+:[a-z_]+$/, "Permission name must follow 'resource:action' format"],
    },
    resource: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Permission description is required"],
      maxlength: 300,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

permissionSchema.index({ resource: 1 });          // group by resource for display
permissionSchema.index({ isSystem: 1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const Permission: Model<PermissionDocument> =
  mongoose.model<PermissionDocument>("Permission", permissionSchema);
