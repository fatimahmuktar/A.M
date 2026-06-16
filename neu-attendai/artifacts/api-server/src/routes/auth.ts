import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, verificationCodesTable, invitationCodesTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { DEMO_USERS, seedDemoAccounts } from "../lib/seed";
import { requireAuth, requireRole, JWT_SECRET } from "../middlewares/auth";

const router = Router();

const JWT_EXPIRES = "24h";
const BCRYPT_ROUNDS = 12;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/* ── Helpers ── */

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signToken(user: { id: string; role: string; email: string; name: string; studentNumber?: string | null }) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name, studentNumber: user.studentNumber ?? null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

async function sendVerificationEmail(email: string, code: string, type: "email_verify" | "password_reset") {
  const resendKey = process.env["RESEND_API_KEY"];
  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);
      const subject = type === "email_verify" ? "Verify your NEU AttendAI account" : "Reset your NEU AttendAI password";
      const body = type === "email_verify"
        ? `Your verification code is: <strong>${code}</strong><br/>This code expires in 10 minutes.`
        : `Your password reset code is: <strong>${code}</strong><br/>This code expires in 10 minutes.`;
      await resend.emails.send({
        from: "NEU AttendAI <noreply@neu.edu.tr>",
        to: email,
        subject,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#cc0000">Near East University</h2><p>${body}</p><p style="color:#888;font-size:12px">If you did not request this, ignore this email.</p></div>`,
      });
      return null; // no inline code — email was sent
    } catch {
      // fall through to demo mode
    }
  }
  // Demo mode: return code inline so the UI can display it
  return code;
}

function validateStudentEmail(email: string) {
  return email.toLowerCase().endsWith("@std.neu.edu.tr");
}

function validateProfessorEmail(email: string) {
  return email.toLowerCase().endsWith("@neu.edu.tr") && !email.toLowerCase().endsWith("@std.neu.edu.tr");
}

/* ── POST /api/auth/register ── */
router.post("/auth/register", async (req, res) => {
  const { role, email, password, name, studentNumber, invitationCode } = req.body as {
    role: string; email: string; password: string; name: string; studentNumber?: string; invitationCode?: string;
  };

  if (!role || !email || !password || !name) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (role === "student") {
    if (!validateStudentEmail(normalizedEmail)) {
      res.status(400).json({ error: "Student email must end with @std.neu.edu.tr" });
      return;
    }
    if (!studentNumber?.trim()) {
      res.status(400).json({ error: "University ID is required for students" });
      return;
    }
  } else if (role === "professor") {
    if (!validateProfessorEmail(normalizedEmail)) {
      res.status(400).json({ error: "Professor email must end with @neu.edu.tr" });
      return;
    }
    if (!invitationCode?.trim()) {
      res.status(400).json({ error: "Invitation code is required for professors" });
      return;
    }
  } else {
    res.status(400).json({ error: "Invalid role. Must be student or professor" });
    return;
  }

  // Check if email already registered
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Check if student number taken
  if (role === "student" && studentNumber) {
    const existingNum = await db.select().from(usersTable)
      .where(eq(usersTable.studentNumber, studentNumber.trim())).limit(1);
    if (existingNum.length > 0) {
      res.status(409).json({ error: "This University ID is already registered" });
      return;
    }
  }

  // Validate invitation code for professor registration
  let inviteId: string | null = null;
  if (role === "professor") {
    const invite = await db.select({ id: invitationCodesTable.id }).from(invitationCodesTable)
      .where(and(
        eq(invitationCodesTable.code, invitationCode!.trim().toUpperCase()),
        eq(invitationCodesTable.role, "professor"),
        eq(invitationCodesTable.used, false),
        gt(invitationCodesTable.expiresAt, new Date())
      )).limit(1);
    if (invite.length === 0) {
      res.status(400).json({ error: "Invalid or expired invitation code" });
      return;
    }
    inviteId = invite[0]!.id;
  }

  // Store pending data in verification code record (as JSON in email field prefix)
  // We encode the registration payload temporarily in the code type field
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Store hashed password alongside verification code via a prefixed entry
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Store as a special pending-registration code (type = "email_verify")
  // We embed the full payload in a JSON string stored as the code value
  const payload = JSON.stringify({ code, passwordHash, name, role, studentNumber: studentNumber?.trim() ?? null, invitationCodeId: inviteId });
  await db.insert(verificationCodesTable).values({
    email: normalizedEmail,
    code: payload,
    type: "email_verify",
    expiresAt,
    used: false,
  });

  const inlineCode = await sendVerificationEmail(normalizedEmail, code, "email_verify");

  res.status(200).json({
    message: "Verification code sent",
    email: normalizedEmail,
    ...(inlineCode ? { demoCode: inlineCode } : {}),
  });
});

/* ── POST /api/auth/verify-email ── */
router.post("/auth/verify-email", async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };

  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  // Find the most recent unused email_verify record for this email
  const records = await db.select().from(verificationCodesTable).where(
    and(
      eq(verificationCodesTable.email, normalizedEmail),
      eq(verificationCodesTable.type, "email_verify"),
      eq(verificationCodesTable.used, false),
      gt(verificationCodesTable.expiresAt, now)
    )
  ).orderBy(verificationCodesTable.createdAt);

  if (records.length === 0) {
    res.status(400).json({ error: "No valid verification code found. Please register again." });
    return;
  }

  // Check the most recent one
  const record = records[records.length - 1]!;
  let payload: { code: string; passwordHash: string; name: string; role: string; studentNumber: string | null; invitationCodeId?: string | null };
  try {
    payload = JSON.parse(record.code) as typeof payload;
  } catch {
    res.status(400).json({ error: "Invalid verification record" });
    return;
  }

  if (payload.code !== code.trim()) {
    res.status(400).json({ error: "Incorrect code. Please try again." });
    return;
  }

  // Mark verification code as used
  await db.update(verificationCodesTable)
    .set({ used: true })
    .where(eq(verificationCodesTable.id, record.id));

  // If professor registration, mark invitation code as used
  if (payload.invitationCodeId) {
    await db.update(invitationCodesTable)
      .set({ used: true, usedBy: normalizedEmail, usedAt: new Date() })
      .where(eq(invitationCodesTable.id, payload.invitationCodeId));
  }

  // Create the user
  const [user] = await db.insert(usersTable).values({
    email: normalizedEmail,
    studentNumber: payload.studentNumber,
    passwordHash: payload.passwordHash,
    name: payload.name,
    role: payload.role,
    emailVerified: true,
    failedAttempts: 0,
  }).returning();

  if (!user) {
    res.status(500).json({ error: "Failed to create account" });
    return;
  }

  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, studentNumber: user.studentNumber },
  });
});

/* ── POST /api/auth/login ── */
router.post("/auth/login", async (req, res) => {
  const { identifier, password } = req.body as { identifier: string; password: string };

  if (!identifier || !password) {
    res.status(400).json({ error: "ID/email and password are required" });
    return;
  }

  const normalizedId = identifier.trim();

  // Find user — try email first, then student number
  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, normalizedId.toLowerCase())).limit(1);
  const byStudentNum = byEmail.length === 0
    ? await db.select().from(usersTable).where(eq(usersTable.studentNumber, normalizedId)).limit(1)
    : [];

  const user = byEmail[0] ?? byStudentNum[0];

  if (!user) {
    res.status(401).json({ error: "Incorrect ID or password" });
    return;
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(423).json({ error: `Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.` });
    return;
  }

  // Admin must be email-verified
  if (!user.emailVerified && user.role !== "admin") {
    res.status(403).json({ error: "Email not verified. Please complete registration first." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const newAttempts = (user.failedAttempts ?? 0) + 1;
    const lockedUntil = newAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
    await db.update(usersTable)
      .set({ failedAttempts: newAttempts, lockedUntil })
      .where(eq(usersTable.id, user.id));

    if (lockedUntil) {
      res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
    } else {
      res.status(401).json({ error: `Incorrect ID or password. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining.` });
    }
    return;
  }

  // Reset failed attempts on success
  await db.update(usersTable)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(usersTable.id, user.id));

  const token = signToken(user);
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, studentNumber: user.studentNumber },
  });
});

/* ── POST /api/auth/forgot-password ── */
router.post("/auth/forgot-password", async (req, res) => {
  const { identifier } = req.body as { identifier: string };

  if (!identifier?.trim()) {
    res.status(400).json({ error: "University ID or email is required" });
    return;
  }

  const normalizedId = identifier.trim();
  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, normalizedId.toLowerCase())).limit(1);
  const byNum = byEmail.length === 0
    ? await db.select().from(usersTable).where(eq(usersTable.studentNumber, normalizedId)).limit(1)
    : [];
  const user = byEmail[0] ?? byNum[0];

  // Always return 200 to prevent account enumeration
  if (!user) {
    res.status(200).json({ message: "If an account exists, a reset code was sent." });
    return;
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.insert(verificationCodesTable).values({
    email: user.email,
    code,
    type: "password_reset",
    expiresAt,
    used: false,
  });

  const inlineCode = await sendVerificationEmail(user.email, code, "password_reset");

  res.status(200).json({
    message: "If an account exists, a reset code was sent.",
    email: user.email,
    ...(inlineCode ? { demoCode: inlineCode } : {}),
  });
});

/* ── POST /api/auth/reset-password ── */
router.post("/auth/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };

  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "Email, code, and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  const records = await db.select().from(verificationCodesTable).where(
    and(
      eq(verificationCodesTable.email, normalizedEmail),
      eq(verificationCodesTable.type, "password_reset"),
      eq(verificationCodesTable.used, false),
      gt(verificationCodesTable.expiresAt, now)
    )
  ).orderBy(verificationCodesTable.createdAt);

  const record = records[records.length - 1];
  if (!record || record.code !== code.trim()) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  await db.update(verificationCodesTable).set({ used: true }).where(eq(verificationCodesTable.id, record.id));

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(usersTable)
    .set({ passwordHash, failedAttempts: 0, lockedUntil: null })
    .where(eq(usersTable.email, normalizedEmail));

  res.status(200).json({ message: "Password reset successfully" });
});

/* ── POST /api/auth/validate-invitation ── checks if an invitation code is valid ── */
router.post("/auth/validate-invitation", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: "Invitation code is required" });
    return;
  }
  try {
    const invites = await db.select({ id: invitationCodesTable.id, role: invitationCodesTable.role, expiresAt: invitationCodesTable.expiresAt })
      .from(invitationCodesTable)
      .where(and(
        eq(invitationCodesTable.code, code.trim().toUpperCase()),
        eq(invitationCodesTable.used, false),
        gt(invitationCodesTable.expiresAt, new Date())
      )).limit(1);
    if (invites.length === 0) {
      res.status(400).json({ error: "Invalid or expired invitation code" });
      return;
    }
    res.status(200).json({ valid: true, role: invites[0]!.role });
  } catch (err) {
    req.log.error(err, "Failed to validate invitation code");
    res.status(500).json({ error: "Failed to validate invitation code" });
  }
});

/* ── GET /api/auth/me ── */
router.get("/auth/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

/* ── POST /api/auth/init-demo ── creates all demo accounts (idempotent, admin only) ── */
router.post("/auth/init-demo", requireAuth, requireRole("admin"), async (_req, res) => {
  await seedDemoAccounts();
  res.status(200).json({
    message: "Demo accounts seeded",
    accounts: DEMO_USERS.map((u) => ({ email: u.email, role: u.role })),
  });
});

export default router;
