import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, attendanceTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const StartSessionSchema = z.object({
  courseId: z.string().min(1),
  token:    z.string().min(1),
});

router.post("/sessions", async (req, res) => {
  const parsed = StartSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  try {
    const [session] = await db.insert(sessionsTable).values({
      courseId: parsed.data.courseId,
      token:    parsed.data.token,
      active:   true,
    }).returning();
    res.status(201).json({ session });
  } catch (err) {
    req.log.error(err, "Failed to start session");
    res.status(500).json({ error: "Failed to start session" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ session });
  } catch (err) {
    req.log.error(err, "Failed to get session");
    res.status(500).json({ error: "Failed to get session" });
  }
});

router.patch("/sessions/:id/end", async (req, res) => {
  const { id } = req.params;
  try {
    const [session] = await db.update(sessionsTable)
      .set({ active: false, endedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json({ session });
  } catch (err) {
    req.log.error(err, "Failed to end session");
    res.status(500).json({ error: "Failed to end session" });
  }
});

router.get("/sessions/:id/attendance", async (req, res) => {
  const { id } = req.params;
  try {
    const records = await db.select().from(attendanceTable)
      .where(eq(attendanceTable.sessionId, id))
      .orderBy(desc(attendanceTable.checkedInAt));
    res.json({ records });
  } catch (err) {
    req.log.error(err, "Failed to fetch session attendance");
    res.status(500).json({ error: "Failed to fetch session attendance" });
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(sessionsTable).orderBy(desc(sessionsTable.startedAt));
    res.json({ sessions });
  } catch (err) {
    req.log.error(err, "Failed to list sessions");
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

export default router;
