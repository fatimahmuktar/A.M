import { Router } from "express";
import { db, pool } from "@workspace/db";
import { coursesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const CourseBodySchema = z.object({
  id:         z.string().min(1),
  name:       z.string().min(1),
  instructor: z.string().default(""),
  room:       z.string().default(""),
  days:       z.string().default(""),
  startTime:  z.string().default(""),
  endTime:    z.string().default(""),
  source:     z.enum(["imported", "manual"]).default("manual"),
  semester:   z.string().default(""),
  lat:        z.number().optional(),
  lng:        z.number().optional(),
  enrollment: z.number().int().default(0),
});

const ImportBodySchema = z.object({
  courses:  z.array(CourseBodySchema),
  semester: z.string().default(""),
});

router.get("/courses", requireAuth, async (req, res) => {
  try {
    const semester = typeof req.query.semester === "string" ? req.query.semester.trim() : "";
    const rows = semester
      ? await db.select().from(coursesTable).where(eq(coursesTable.semester, semester)).orderBy(coursesTable.id)
      : await db.select().from(coursesTable).orderBy(coursesTable.id);
    res.json({ courses: rows });
  } catch (err) {
    req.log.error(err, "Failed to fetch courses");
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

router.get("/courses/search", requireAuth, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const rows = await db.select().from(coursesTable).orderBy(coursesTable.id);
    const filtered = q
      ? rows.filter(
          (r) =>
            r.id.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            r.instructor.toLowerCase().includes(q),
        )
      : rows;
    res.json({ courses: filtered });
  } catch (err) {
    req.log.error(err, "Failed to search courses");
    res.status(500).json({ error: "Failed to search courses" });
  }
});

router.get("/courses/semesters", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ semester: coursesTable.semester })
      .from(coursesTable)
      .orderBy(coursesTable.semester);
    const semesters = rows.map((r) => r.semester).filter(Boolean);
    res.json({ semesters });
  } catch (err) {
    req.log.error(err, "Failed to fetch semesters");
    res.status(500).json({ error: "Failed to fetch semesters" });
  }
});

router.post("/courses/import", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = ImportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const { courses, semester: bodySemester } = parsed.data;
  try {
    const sem = bodySemester || "";
    const valueTuples = courses.map((_, i) => {
      const off = i * 12;
      return `($${off + 1},$${off + 2},$${off + 3},$${off + 4},$${off + 5},$${off + 6},$${off + 7},$${off + 8},$${off + 9},$${off + 10},$${off + 11},$${off + 12})`;
    }).join(",");
    const params: any[] = [];
    for (const c of courses) {
      const s = c.semester || sem;
      params.push(c.id, c.name, c.instructor, c.room, c.days, c.startTime, c.endTime, c.source, s, c.enrollment ?? 0, c.lat != null ? String(c.lat) : null, c.lng != null ? String(c.lng) : null);
    }
    await pool.query(
      `INSERT INTO courses (id,name,instructor,room,days,start_time,end_time,source,semester,enrollment,lat,lng) VALUES ${valueTuples} ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,instructor=EXCLUDED.instructor,room=EXCLUDED.room,days=EXCLUDED.days,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,source=EXCLUDED.source,semester=EXCLUDED.semester,enrollment=EXCLUDED.enrollment,lat=COALESCE(EXCLUDED.lat,courses.lat),lng=COALESCE(EXCLUDED.lng,courses.lng)`,
      params
    );
    res.json({ inserted: courses.length, updated: 0, total: courses.length, semester: bodySemester });
  } catch (err) {
    req.log.error(err, "Failed to import courses");
    res.status(500).json({ error: "Failed to import courses" });
  }
});

router.post("/courses", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = CourseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const c = parsed.data;
  try {
    const existing = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, c.id));
    if (existing.length > 0) {
      res.status(409).json({ error: "Course already exists" });
      return;
    }
    const [row] = await db.insert(coursesTable).values({
      id:         c.id,
      name:       c.name,
      instructor: c.instructor,
      room:       c.room,
      days:       c.days,
      startTime:  c.startTime,
      endTime:    c.endTime,
      source:     c.source,
      semester:   c.semester,
      enrollment: c.enrollment,
      ...(c.lat != null ? { lat: String(c.lat) } : {}),
      ...(c.lng != null ? { lng: String(c.lng) } : {}),
    }).returning();
    res.status(201).json({ course: row });
  } catch (err) {
    req.log.error(err, "Failed to create course");
    res.status(500).json({ error: "Failed to create course" });
  }
});

router.delete("/courses", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await db.delete(coursesTable);
    res.json({ deleted: "all" });
  } catch (err) {
    req.log.error(err, "Failed to delete all courses");
    res.status(500).json({ error: "Failed to delete all courses" });
  }
});

router.delete("/courses/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.delete(coursesTable).where(eq(coursesTable.id, id));
    res.json({ deleted: id });
  } catch (err) {
    req.log.error(err, "Failed to delete course");
    res.status(500).json({ error: "Failed to delete course" });
  }
});

export default router;
