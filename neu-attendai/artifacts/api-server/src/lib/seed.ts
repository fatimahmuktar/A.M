import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, attendanceTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

interface DemoUser {
  email:         string;
  name:          string;
  password:      string;
  role:          string;
  studentNumber: string | null;
}

export const DEMO_USERS: DemoUser[] = [
  { email: "admin@neu.edu.tr", name: "Admin User",       password: "123456789", role: "admin",     studentNumber: null },
  { email: "prof@neu.edu.tr",  name: "Demo Professor",   password: "123456789", role: "professor", studentNumber: null },
  { email: "s20225507@neu.edu.tr", name: "Fatumo Mukhtar", password: "123456789", role: "student",   studentNumber: "20225507" },
];

/* Demo sessions for COM382-FRI-1330 — fixed UUIDs so seed is idempotent */
const DEMO_SESSIONS = [
  { id: "aaaaaaaa-0001-0000-0000-000000000001", courseId: "COM382-FRI-1330", token: "101010", active: false, startedAt: new Date("2026-05-13T11:30:00Z"), endedAt: new Date("2026-05-13T13:00:00Z") },
  { id: "aaaaaaaa-0001-0000-0000-000000000002", courseId: "COM382-FRI-1330", token: "202020", active: false, startedAt: new Date("2026-05-06T11:30:00Z"), endedAt: new Date("2026-05-06T13:00:00Z") },
  { id: "aaaaaaaa-0001-0000-0000-000000000003", courseId: "COM382-FRI-1330", token: "303030", active: false, startedAt: new Date("2026-04-29T11:30:00Z"), endedAt: new Date("2026-04-29T13:00:00Z") },
  { id: "aaaaaaaa-0001-0000-0000-000000000004", courseId: "COM382-FRI-1330", token: "404040", active: false, startedAt: new Date("2026-04-22T11:30:00Z"), endedAt: new Date("2026-04-22T13:00:00Z") },
  { id: "aaaaaaaa-0001-0000-0000-000000000005", courseId: "COM382-FRI-1330", token: "505050", active: false, startedAt: new Date("2026-04-15T11:30:00Z"), endedAt: new Date("2026-04-15T13:00:00Z") },
];

/* Demo attendance for student 20225507 — present for first 3, absent for last 2 */
const DEMO_ATTENDANCE = [
  { id: "bbbbbbbb-0001-0000-0000-000000000001", sessionId: "aaaaaaaa-0001-0000-0000-000000000001", courseId: "COM382-FRI-1330", studentId: "20225507", studentName: "Fatumo Mukhtar", method: "qr",     flagged: false, checkedInAt: new Date("2026-05-13T11:45:00Z") },
  { id: "bbbbbbbb-0001-0000-0000-000000000002", sessionId: "aaaaaaaa-0001-0000-0000-000000000002", courseId: "COM382-FRI-1330", studentId: "20225507", studentName: "Fatumo Mukhtar", method: "manual", flagged: false, checkedInAt: new Date("2026-05-06T11:35:00Z") },
  { id: "bbbbbbbb-0001-0000-0000-000000000003", sessionId: "aaaaaaaa-0001-0000-0000-000000000003", courseId: "COM382-FRI-1330", studentId: "20225507", studentName: "Fatumo Mukhtar", method: "qr",     flagged: false, checkedInAt: new Date("2026-04-29T11:40:00Z") },
];

export async function seedDemoAccounts(): Promise<void> {
  logger.info("Running demo account seed check...");
  let seeded = 0;
  for (const u of DEMO_USERS) {
    try {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const result = await db
        .insert(usersTable)
        .values({
          email:          u.email,
          name:           u.name,
          passwordHash,
          role:           u.role,
          emailVerified:  true,
          failedAttempts: 0,
          studentNumber:  u.studentNumber ?? undefined,
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: {
            passwordHash,
            emailVerified:  true,
            failedAttempts: 0,
            lockedUntil:    null,
          },
        })
        .returning({ id: usersTable.id });

      if (result.length > 0) {
        logger.info({ email: u.email }, "Demo account password reset");
        seeded++;
      }
    } catch (err) {
      logger.error({ err, email: u.email }, "Failed to seed demo account");
    }
  }

  // Remove old demo accounts if they exist
  for (const oldEmail of ["demo@neu.edu.tr", "demo.professor@neu.edu.tr"]) {
    try {
      await db.delete(usersTable).where(eq(usersTable.email, oldEmail));
    } catch (err) {
      logger.error({ err, oldEmail }, "Failed to remove old demo account");
    }
  }

  // Seed demo sessions for COM382-FRI-1330
  try {
    for (const s of DEMO_SESSIONS) {
      await db
        .insert(sessionsTable)
        .values(s)
        .onConflictDoNothing();
    }
    logger.info("Demo sessions seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed demo sessions");
  }

  // Seed demo attendance records for student 20225507
  try {
    for (const a of DEMO_ATTENDANCE) {
      await db
        .insert(attendanceTable)
        .values(a)
        .onConflictDoNothing();
    }
    logger.info("Demo attendance records seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed demo attendance records");
  }

  logger.info({ seeded }, "Seed complete");
}
