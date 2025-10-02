import redis from "@repo/redis";
import { randomInt } from "crypto";

import { AuthError, ValidationError } from "../lib/error-handler";
import { sendEmail } from "./send.mail";
import { sign } from "hono/jwt";

export const TOKEN_EXPIRY = {
  ACCESS: 15 * 60, // 15 minutes in seconds
  REFRESH: 7 * 24 * 60 * 60, // 7 days in seconds
  OTP_SESSION: 15 * 60, // 15 minutes
};

export const REDIS_KEYS = {
  pending: (email: string) => `pending:${email}`,
  otpCount: (email: string) => `otp_requests_count:${email}`,
  changePassword: (email: string) => `change_password:${email}`,
  loginAttempts: (email: string) => `login_attempts:${email}`,
};
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "your-secret-token";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "your-refresh-token";

export const checkOtpRestrictions = async (email: string) => {
  if (await redis.get(`otp_lock:${email}`)) throw new AuthError("OTP requests are temporarily locked");
  if (await redis.get(`otp_spam_lock:${email}`)) throw new AuthError("Too many OTP requests. 1 hour lock applied.");
  if (await redis.get(`otp_cooldown:${email}`)) throw new AuthError("Please wait before requesting another OTP.");
};

export const trackOtpRequest = async (email: string) => {
  const otpRequestKey = `otp_requests_count:${email}`;
  const OTP_REQUESTS = parseInt((await redis.get(otpRequestKey)) || "0", 10);

  if (OTP_REQUESTS >= 2) {
    await redis.set(`otp_spam_lock:${email}`, "1", { ex: 60 * 60 }); // 1H lock
    await redis.del(otpRequestKey);
  }
  await redis.incr(otpRequestKey);
  await redis.expire(otpRequestKey, 10 * 60); // 30 minutes
};

export const sendOtp = async (name: string, email: string, templateName: string) => {
  const otp = randomInt(1000, 9999).toString();

  await sendEmail(email, "Your OTP Code", templateName, { name, email, otp });
  await redis.set(`otp:${email}`, String(otp), { ex: 300 });
  await redis.set(`otp_cooldown:${email}`, "true", { ex: 60 });
};

export const verifyOtp = async (email: string, otp: string) => {
  const storedOtp = String(await redis.get(`otp:${email}`));
  if (!storedOtp) throw new AuthError("OTP expired or not found");

  const failedAttemptsKey = `otp_attempts:${email}`;
  const failedAttempts = parseInt((await redis.get(failedAttemptsKey)) ?? "0", 10);

  if (storedOtp !== otp) {
    if (failedAttempts >= 2) {
      await redis.set(`otp_lock:${email}`, "1", { ex: 15 * 60 }); // 15 minutes lock
      await redis.del(failedAttemptsKey);
      await redis.del(`otp:${email}`);
      throw new AuthError("Too many failed attempts. OTP requests are temporarily locked.");
    }
    await redis.incr(failedAttemptsKey);
    await redis.expire(failedAttemptsKey, 15 * 60); // 15 minutes
    throw new ValidationError(`incorrect OTP. ${2 - failedAttempts} attempts left`);
  }
  await redis.del(`otp:${email}`);
  await redis.del(failedAttemptsKey);
};

// Generate JWT tokens
export async function generateTokens(userId: string) {
  const now = Math.floor(Date.now() / 1000);

  const [accessToken, refreshToken] = await Promise.all([
    sign({ id: userId, role: "user", exp: now + TOKEN_EXPIRY.ACCESS }, ACCESS_TOKEN_SECRET),
    sign({ id: userId, role: "user", exp: now + TOKEN_EXPIRY.REFRESH }, REFRESH_TOKEN_SECRET),
  ]);

  return { accessToken, refreshToken };
}

// Check login rate limiting
export async function checkLoginRateLimit(email: string) {
  const attempts = await redis.get(REDIS_KEYS.loginAttempts(email));
  if (attempts && Number(attempts) >= 5) {
    throw new AuthError("Too many login attempts. Please try again later.");
  }
}

// Helper: Track failed login
export async function trackFailedLogin(email: string) {
  const key = REDIS_KEYS.loginAttempts(email);
  const current = await redis.get(key);
  const count = current ? Number(current) + 1 : 1;
  await redis.set(key, count, { ex: 15 * 60 }); // 15 min lockout
}

// Helper: Clear login attempts
export async function clearLoginAttempts(email: string) {
  await redis.del(REDIS_KEYS.loginAttempts(email));
}
