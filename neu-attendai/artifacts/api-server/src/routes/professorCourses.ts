import { Router } from "express";
import { db } from "@workspace/db";
import { professorCoursesTable, studentCoursesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

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

router.get("/professor/courses", requireAuth, requireRole("professor"), async (req, res) => {
  const professorId = req.user!.email;
  try {
    const rows = await db
      .select()
      .from(professorCoursesTable)
      .where(eq(professorCoursesTable.professorId, professorId))
      .orderBy(professorCoursesTable.createdAt);
    res.json({ courses: rows });
  } catch (err) {
    req.log.error(err, "Failed to fetch professor courses");
    res.status(500).json({ error: "Failed to fetch professor courses" });
  }
});

router.post("/professor/courses", requireAuth, requireRole("professor"), async (req, res) => {
  const professorId = req.user!.email;
  const parsed = CourseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues }); return; }
  const c = parsed.data;
  try {
    const existing = await db
      .select({ id: professorCoursesTable.id })
      .from(professorCoursesTable)
      .where(and(eq(professorCoursesTable.professorId, professorId), eq(professorCoursesTable.courseCode, c.courseCode)));
    if (existing.length > 0) { res.status(409).json({ error: "Course already added" }); return; }
    const [row] = await db
      .insert(professorCoursesTable)
      .values({ professorId, ...c })
      .returning();
    res.status(201).json({ course: row });
  } catch (err) {
    req.log.error(err, "Failed to add professor course");
    res.status(500).json({ error: "Failed to add professor course" });
  }
});

router.delete("/professor/courses/:courseCode", requireAuth, requireRole("professor"), async (req, res) => {
  const professorId = req.user!.email;
  const courseCode = req.params.courseCode as string;
  try {
    await db
      .delete(professorCoursesTable)
      .where(and(eq(professorCoursesTable.professorId, professorId), eq(professorCoursesTable.courseCode, courseCode)));
    res.json({ deleted: courseCode });
  } catch (err) {
    req.log.error(err, "Failed to remove professor course");
    res.status(500).json({ error: "Failed to remove professor course" });
  }
});

/* GET /professor/courses/:courseCode/students
   Returns all students enrolled in a given course (joined with users table) */
router.get("/professor/courses/:courseCode/students", requireAuth, requireRole("professor"), async (req, res) => {
  const courseCode = req.params.courseCode as string;
  try {
    const rows = await db
      .select({
        studentId:     studentCoursesTable.studentId,
        studentName:   usersTable.name,
        studentNumber: usersTable.studentNumber,
      })
      .from(studentCoursesTable)
      .innerJoin(usersTable, eq(usersTable.studentNumber, studentCoursesTable.studentId))
      .where(eq(studentCoursesTable.courseCode, courseCode));
    res.json({ students: rows });
  } catch (err) {
    req.log.error(err, "Failed to fetch course students");
    res.status(500).json({ error: "Failed to fetch course students" });
  }
});

export default router;
