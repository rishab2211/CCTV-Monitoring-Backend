import crypto from "crypto";

/**
 * Generates a cryptographically secure numeric OTP.
 * @param length Number of digits (default: 6)
 */
export const generateOTP = (length: number = 6): string => {
  const digits = "0123456789";
  let otp = "";

  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[randomBytes[i] % digits.length];
  }

  return otp;
};

/**
 * Hashes an OTP or token using SHA-256.
 * Used for storing OTPs and refresh tokens securely in DB.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generates a cryptographically secure random token (hex string).
 * @param bytes Number of random bytes (default: 32 → 64 char hex string)
 */
export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

/**
 * Safely compare two strings in constant time.
 * Prevents timing attacks when comparing tokens/OTPs.
 */
export const safeCompare = (a?: string | null, b?: string | null): boolean => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};


/**
 * Formats a Date object as a human-readable string.
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
};

/**
 * Adds minutes to the current date and returns the resulting Date.
 */
export const addMinutes = (minutes: number): Date => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Adds days to the current date and returns the resulting Date.
 */
export const addDays = (days: number): Date => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

/**
 * Masks an email for display (e.g. "j***@gmail.com")
 */
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const masked =
    local.length <= 2
      ? local[0] + "*".repeat(local.length - 1)
      : local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
};

/**
 * Masks a phone number for display (e.g. "98****0123")
 */
export const maskPhone = (phone: string): string => {
  if (phone.length < 4) return phone;
  return phone.slice(0, 2) + "*".repeat(phone.length - 4) + phone.slice(-2);
};
