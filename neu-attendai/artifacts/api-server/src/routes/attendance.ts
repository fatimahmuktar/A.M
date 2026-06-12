import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceTable, sessionsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

/* ── NEU Campus geofence ──────────────────────────────────────────────── */
const NEU_LAT           = 35.228731;   // real campus centre
const NEU_LNG           = 33.319781;
const NEU_CAMPUS_RADIUS = 800;         // metres — covers full 98-hectare campus

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CheckInSchema = z.object({
  sessionId:   z.string().min(1),
  courseId:    z.string().min(1),
  studentId:   z.string().min(1),
  studentName: z.string().default(""),
  lat:         z.number().optional(),
  lng:         z.number().optional(),
  distanceM:   z.number().int().optional(),
  flagged:     z.boolean().default(false),
  flagReason:  z.string().optional(),
  method:      z.enum(["qr", "code"]).default("qr"),
});

router.post("/attendance", async (req, res) => {
  const parsed = CheckInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const d = parsed.data;

  /* ── Campus geofence — server-side enforcement ── */
  if (d.lat != null && d.lng != null) {
    const distFromCampus = Math.round(haversineMeters(d.lat, d.lng, NEU_LAT, NEU_LNG));
    if (distFromCampus > NEU_CAMPUS_RADIUS) {
      res.status(403).json({
        error:         "You are not on campus",
        distanceM:     distFromCampus,
        campusRadiusM: NEU_CAMPUS_RADIUS,
        campusLat:     NEU_LAT,
        campusLng:     NEU_LNG,
      });
      return;
    }
  }

  try {
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, d.sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!session.active) { res.status(409).json({ error: "Session has ended" }); return; }

    const existing = await db.select({ id: attendanceTable.id })
      .from(attendanceTable)
      .where(and(eq(attendanceTable.sessionId, d.sessionId), eq(attendanceTable.studentId, d.studentId)));
    if (existing.length > 0) {
      res.status(409).json({ error: "Already checked in for this session" });
      return;
    }

    const [record] = await db.insert(attendanceTable).values({
      sessionId:   d.sessionId,
      courseId:    d.courseId,
      studentId:   d.studentId,
      studentName: d.studentName,
      distanceM:   d.distanceM,
      flagged:     d.flagged,
      flagReason:  d.flagReason,
      method:      d.method,
      ...(d.lat != null ? { lat: String(d.lat) } : {}),
      ...(d.lng != null ? { lng: String(d.lng) } : {}),
    }).returning();

    res.status(201).json({ record });
  } catch (err) {
    req.log.error(err, "Failed to record attendance");
    res.status(500).json({ error: "Failed to record attendance" });
  }
});

/* ── Professor manual check-in (bypasses QR / geofence) ────────────── */
const ManualCheckInSchema = z.object({
  sessionId:   z.string().min(1),
  courseId:    z.string().min(1),
  studentId:   z.string().min(1),
  studentName: z.string().default(""),
  reason:      z.string().optional(),
});

router.post("/attendance/manual", async (req, res) => {
  const parsed = ManualCheckInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const d = parsed.data;
  try {
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, d.sessionId));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (!session.active) { res.status(409).json({ error: "Session has ended" }); return; }

    /* Upsert: if already checked in just update to not-flagged; otherwise insert */
    const existing = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.sessionId, d.sessionId), eq(attendanceTable.studentId, d.studentId)));

    if (existing.length > 0) {
      const [updated] = await db.update(attendanceTable)
        .set({ flagged: false, flagReason: null, method: "manual" })
        .where(and(eq(attendanceTable.sessionId, d.sessionId), eq(attendanceTable.studentId, d.studentId)))
        .returning();
      res.status(200).json({ record: updated });
    } else {
      const [record] = await db.insert(attendanceTable).values({
        sessionId:   d.sessionId,
        courseId:    d.courseId,
        studentId:   d.studentId,
        studentName: d.studentName,
        flagged:     false,
        flagReason:  d.reason ? `Manual override: ${d.reason}` : "Manual override by professor",
        method:      "manual",
      }).returning();
      res.status(201).json({ record });
    }
  } catch (err) {
    req.log.error(err, "Failed to record manual attendance");
    res.status(500).json({ error: "Failed to record manual attendance" });
  }
});

router.get("/attendance/student/:studentId", async (req, res) => {
  const { studentId } = req.params;
  try {
    const records = await db.select().from(attendanceTable)
      .where(eq(attendanceTable.studentId, studentId))
      .orderBy(desc(attendanceTable.checkedInAt));
    res.json({ records });
  } catch (err) {
    req.log.error(err, "Failed to fetch student attendance");
    res.status(500).json({ error: "Failed to fetch student attendance" });
  }
});

export default router;
