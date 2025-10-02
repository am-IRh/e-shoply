import { prisma } from "@repo/db";
import redis from "@repo/redis";
import { Hono } from "hono";
import { sign } from "hono/jwt";

import { AppError, AuthError, ValidationError } from "../lib/error-handler";
import { validateRegister } from "../lib/zod-schema";
import {
  checkLoginRateLimit,
  checkOtpRestrictions,
  clearLoginAttempts,
  generateTokens,
  REDIS_KEYS,
  sendOtp,
  TOKEN_EXPIRY,
  trackFailedLogin,
  trackOtpRequest,
  verifyOtp,
} from "../utils/auth.helper";
import { setSecureCookie } from "../utils/cookies/setCookies";

const auth = new Hono();

// ============================================================================
// REGISTER
// ============================================================================
auth.post("/register", validateRegister, async c => {
  try {
    const { name, email, password } = c.req.valid("json");

    // Check if email already exists
    const existedUser = await prisma.users.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existedUser) throw new ValidationError("Email already exists", "EMAIL_EXISTS");

    // Check OTP restrictions
    await checkOtpRestrictions(email);

    // Hash password BEFORE storing in Redis
    const hashedPassword = await Bun.password.hash(password);

    // Parallel operations
    await Promise.all([
      trackOtpRequest(email),
      sendOtp(name, email, "user-activation-mail"),
      redis.set(REDIS_KEYS.pending(email), { name, password: hashedPassword }, { ex: TOKEN_EXPIRY.OTP_SESSION }),
    ]);

    return c.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AppError) {
      throw error;
    }
    throw new AppError("Registration failed", 500);
  }
});

// ============================================================================
// VERIFY USER
// ============================================================================
auth.post("/verify-user", async c => {
  try {
    const { otp, email } = await c.req.json();

    if (!email || !otp) throw new ValidationError("Missing required fields");

    // Verify OTP first (fail fast)
    await verifyOtp(email, otp);

    // Get user data from cache
    const userData = (await redis.get(REDIS_KEYS.pending(email))) as {
      name: string;
      password: string;
    } | null;

    if (!userData) throw new AppError("No pending registration found", 400, true, "INVALID_SESSION");

    const { name, password } = userData;

    // Create user (password already hashed)
    await prisma.users.create({
      data: { name, email, password },
    });

    // Cleanup Redis keys in parallel
    await Promise.all([redis.del(REDIS_KEYS.pending(email)), redis.del(REDIS_KEYS.otpCount(email))]);

    return c.json(
      {
        success: true,
        message: "User registered successfully",
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Verification failed", 500);
  }
});

// ============================================================================
// LOGIN
// ============================================================================
auth.post("/login", async c => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) throw new ValidationError("Missing required fields");

    // Check rate limiting
    await checkLoginRateLimit(email);

    // Find user
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true },
    });

    if (!user || !user.password) {
      await trackFailedLogin(email);
      throw new AuthError("Invalid email or password");
    }

    // Verify password
    const isPasswordValid = await Bun.password.verify(password, user.password);

    if (!isPasswordValid) {
      await trackFailedLogin(email);
      throw new AuthError("Invalid email or password");
    }

    // Clear failed attempts
    await clearLoginAttempts(email);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user.id);

    // Set cookies
    setSecureCookie(c, "accessToken", accessToken, "15m");
    setSecureCookie(c, "refreshToken", refreshToken);

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      message: "Logged in successfully",
    });
  } catch (error) {
    if (error instanceof AppError) throw error;

    throw new AppError("Login failed", 500);
  }
});

// ============================================================================
// FORGOT PASSWORD
// ============================================================================
auth.post("/forgot-password-user", async c => {
  try {
    const { email } = await c.req.json();
    if (!email) throw new ValidationError("Email is required");

    // Check if user exists
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    if (!user) {
      return c.json({
        message: "If the email exists, an OTP has been sent",
        success: true,
      });
    }

    // Check if already enabled
    const enableChangePassword = await redis.get(REDIS_KEYS.changePassword(email));

    if (enableChangePassword) {
      return c.json({
        message: "You can now change your password",
        details: "NO_NEED_ANOTHER_REQ",
      });
    }

    // OTP restrictions and send
    await checkOtpRestrictions(email);

    await Promise.all([trackOtpRequest(email), sendOtp(user.name, email, "forgot-password-mail")]);

    return c.json({
      message: "OTP sent to your email",
      success: true,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Failed to process request", 500);
  }
});

// ============================================================================
// VERIFY FORGOT PASSWORD OTP
// ============================================================================
auth.post("/verify-forgot-password-user", async c => {
  try {
    const { email, otp } = await c.req.json();
    if (!email || !otp) throw new ValidationError("Missing required fields");

    // Verify OTP
    await verifyOtp(email, otp);

    // Enable password change
    await redis.set(REDIS_KEYS.changePassword(email), true, { ex: TOKEN_EXPIRY.OTP_SESSION });

    return c.json({
      message: "OTP verified successfully",
      success: true,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Verification failed", 500);
  }
});

// ============================================================================
// RESET PASSWORD
// ============================================================================
auth.post("/reset-user-password", async c => {
  try {
    const { email, newPassword } = await c.req.json();

    if (!email || !newPassword) throw new ValidationError("Missing required fields");

    // Check if change password is enabled
    const enableChangePassword = await redis.get(REDIS_KEYS.changePassword(email));
    if (!enableChangePassword) throw new AuthError("Please request an OTP first");

    // Find user
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (!user || !user.password) throw new ValidationError("User not found");

    // Check if new password is same as old
    const isSamePassword = await Bun.password.verify(newPassword, user.password);

    if (isSamePassword) {
      throw new ValidationError("New password must be different from the old password");
    }

    // Hash and update password
    const hashedPassword = await Bun.password.hash(newPassword);

    await Promise.all([
      prisma.users.update({
        where: { email },
        data: { password: hashedPassword },
      }),
      redis.del(REDIS_KEYS.changePassword(email)),
    ]);

    return c.json({
      message: "Password reset successful",
      success: true,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Password reset failed", 500);
  }
});

export default auth;
