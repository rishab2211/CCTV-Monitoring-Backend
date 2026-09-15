import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";

// ─── Transporter ─────────────────────────────────────────────────────────────

const createTransporter = () => {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000,
  });
};

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
};

// ─── Send OTP Email ───────────────────────────────────────────────────────────

export const sendOTPEmail = async (
  to: string,
  otp: string,
  userName: string
): Promise<void> => {
  const expiryMinutes = env.OTP_EXPIRY_MINUTES;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
        .container { max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 36px 40px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
        .header p { color: #94a3b8; margin: 8px 0 0; font-size: 13px; }
        .body { padding: 40px; }
        .greeting { font-size: 16px; color: #1e293b; margin-bottom: 16px; }
        .message { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 32px; }
        .otp-container { background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 28px; }
        .otp-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        .otp-code { font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #0f3460; font-variant-numeric: tabular-nums; }
        .expiry { font-size: 13px; color: #f59e0b; font-weight: 500; margin-top: 12px; }
        .warning { background: #fff7ed; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 12px 16px; font-size: 13px; color: #92400e; margin-bottom: 24px; }
        .footer { background: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎥 CCTV Monitor</h1>
          <p>Security & Surveillance Platform</p>
        </div>
        <div class="body">
          <p class="greeting">Hello, <strong>${userName}</strong></p>
          <p class="message">
            We received a request to reset the password for your CCTV Monitor account. 
            Use the OTP below to verify your identity and proceed with resetting your password.
          </p>
          <div class="otp-container">
            <div class="otp-label">Your One-Time Password</div>
            <div class="otp-code">${otp}</div>
            <div class="expiry">⏱ Expires in ${expiryMinutes} minutes</div>
          </div>
          <div class="warning">
            🔒 <strong>Never share this OTP</strong> with anyone. Our team will never ask for it.
            If you did not request this, please ignore this email.
          </div>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.<br>
          © ${new Date().getFullYear()} CCTV Monitor. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: `${otp} — Your CCTV Monitor password reset OTP`,
      html,
      text: `Your password reset OTP is: ${otp}\nThis OTP expires in ${expiryMinutes} minutes.\nDo not share this with anyone.`,
    });

    logger.info(`📧 OTP email sent to ${to}`);
  } catch (error) {
    logger.error(`❌ Failed to send OTP email to ${to}:`, error);
    throw new Error("Failed to send OTP email. Please try again.");
  }
};

// ─── Verify SMTP Connection ───────────────────────────────────────────────────

export const verifyEmailConnection = async (): Promise<void> => {
  try {
    const verifyPromise = getTransporter().verify();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP verification timed out (3s)")), 3000)
    );
    await Promise.race([verifyPromise, timeoutPromise]);
    logger.info("✅ SMTP connection verified");
  } catch (error) {
    logger.warn(
      `⚠️  SMTP connection failed or timed out (${error instanceof Error ? error.message : error}). Email features will be unavailable:`
    );
  }
};
