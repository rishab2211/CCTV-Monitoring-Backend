import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import {
  IUser,
  UserRole,
  IAddress,
  IFranchiseDetails,
  IOperatorDetails,
  ITechnicianDetails,
  ICustomerDetails,
} from "../types";

// ─── Document interface ───────────────────────────────────────────────────────

export interface UserDocument extends Omit<IUser, "_id">, Document {}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addressSchema = new Schema<IAddress>(
  {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: "India" },
  },
  { _id: false }
);

const franchiseDetailsSchema = new Schema<IFranchiseDetails>(
  {
    territory: {
      city: String,
      state: String,
      zone: String,
    },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    royaltyRate: { type: Number, default: 0, min: 0, max: 100 },
    franchiseCode: String,
  },
  { _id: false }
);

const operatorDetailsSchema = new Schema<IOperatorDetails>(
  {
    shiftStart: { type: String, default: "09:00" },
    shiftEnd: { type: String, default: "21:00" },
    isOnShift: { type: Boolean, default: false },
    assignedCameras: [{ type: Schema.Types.ObjectId, ref: "Camera" }],
  },
  { _id: false }
);

const technicianDetailsSchema = new Schema<ITechnicianDetails>(
  {
    skills: [String],
    certifications: [String],
    assignedFranchise: { type: Schema.Types.ObjectId, ref: "Franchise" },
  },
  { _id: false }
);

const customerDetailsSchema = new Schema<ICustomerDetails>(
  {
    billingAddress: addressSchema,
    assignedFranchise: { type: Schema.Types.ObjectId, ref: "Franchise" },
    emergencyContact: {
      name: String,
      phone: String,
      relation: String,
    },
  },
  { _id: false }
);

// ─── Main User Schema ─────────────────────────────────────────────────────────

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Please provide a valid 10-digit Indian phone number"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: {
        values: [
          "super_admin",
          "admin",
          "franchise",
          "operator",
          "technician",
          "customer",
        ] as UserRole[],
        message: "Invalid role: {VALUE}",
      },
      required: [true, "Role is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    address: addressSchema,

    // Role-specific sub-documents
    franchiseDetails: franchiseDetailsSchema,
    operatorDetails: operatorDetailsSchema,
    technicianDetails: technicianDetailsSchema,
    customerDetails: customerDetailsSchema,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ "operatorDetails.isOnShift": 1 });

// ─── Pre-save Hook: Hash Password ─────────────────────────────────────────────

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err as Error);
  }
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string);
};

userSchema.methods.generateAccessToken = function (sessionId: string): string {
  return jwt.sign(
    {
      userId: this._id.toString(),
      role: this.role,
      sessionId,
      email: this.email,
    },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRY }
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  return jwt.sign(
    { userId: this._id.toString() },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY }
  );
};

// ─── Model ───────────────────────────────────────────────────────────────────

export const User: Model<UserDocument> = mongoose.model<UserDocument>(
  "User",
  userSchema
);
