import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const ACTIVE_SEMESTER_KEY = "active_semester";

function currentSemesterDefault(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 2 && m <= 7 ? `Spring${y}` : `Fall${y}`;
}

router.get("/settings/active-semester", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, ACTIVE_SEMESTER_KEY));
    const value = rows[0]?.value ?? currentSemesterDefault();
    res.json({ semester: value });
  } catch (err) {
    req.log.error(err, "Failed to fetch active semester");
    res.status(500).json({ error: "Failed to fetch active semester" });
  }
});

router.post("/settings/active-semester", async (req, res) => {
  const parsed = z.object({ semester: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const { semester } = parsed.data;
  try {
    await db
      .insert(settingsTable)
      .values({ key: ACTIVE_SEMESTER_KEY, value: semester })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: semester, updatedAt: new Date() },
      });
    res.json({ semester });
  } catch (err) {
    req.log.error(err, "Failed to update active semester");
    res.status(500).json({ error: "Failed to update active semester" });
  }
});

export default router;
