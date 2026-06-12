import { Router } from "express";
import { db } from "@workspace/db";
import { studentCoursesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const CourseSchema = z.object({
  courseCode: z.string().min(1),
  courseName: z.string().default(""),
  groupNo:    z.string().default(""),
  room:       z.string().default(""),
  days:       z.string().default(""),
  startTime:  z.string().default(""),
  endTime:    z.string().default(""),
  instructor: z.string().default(""),
  semester:   z.string().default(""),
  source:     z.enum(["imported", "manual"]).default("imported"),
});

function getUserId(req: Parameters<Parameters<ReturnType<typeof Router>["get"]>[1]>[0]): string | null {
  const id = req.headers["x-user-id"];
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

router.get("/student/courses", async (req, res) => {
  const studentId = getUserId(req);
  if (!studentId) { res.status(401).json({ error: "Missing x-user-id header" }); return; }
  try {
    const rows = await db
      .select()
      .from(studentCoursesTable)
      .where(eq(studentCoursesTable.studentId, studentId))
      .orderBy(studentCoursesTable.createdAt);
    res.json({ courses: rows });
  } catch (err) {
    req.log.error(err, "Failed to fetch student courses");
    res.status(500).json({ error: "Failed to fetch student courses" });
  }
});

router.post("/student/courses", async (req, res) => {
  const studentId = getUserId(req);
  if (!studentId) { res.status(401).json({ error: "Missing x-user-id header" }); return; }
  const parsed = CourseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues }); return; }
  const c = parsed.data;
  try {
    const existing = await db
      .select({ id: studentCoursesTable.id })
      .from(studentCoursesTable)
      .where(and(eq(studentCoursesTable.studentId, studentId), eq(studentCoursesTable.courseCode, c.courseCode)));
    if (existing.length > 0) { res.status(409).json({ error: "Course already added" }); return; }
    const [row] = await db
      .insert(studentCoursesTable)
      .values({ studentId, ...c })
      .returning();
    res.status(201).json({ course: row });
  } catch (err) {
    req.log.error(err, "Failed to add student course");
    res.status(500).json({ error: "Failed to add student course" });
  }
});

router.delete("/student/courses/:courseCode", async (req, res) => {
  const studentId = getUserId(req);
  const { courseCode } = req.params;
  if (!studentId) { res.status(401).json({ error: "Missing x-user-id header" }); return; }
  try {
    await db
      .delete(studentCoursesTable)
      .where(and(eq(studentCoursesTable.studentId, studentId), eq(studentCoursesTable.courseCode, courseCode)));
    res.json({ deleted: courseCode });
  } catch (err) {
    req.log.error(err, "Failed to remove student course");
    res.status(500).json({ error: "Failed to remove student course" });
  }
});

export default router;
