import { Router } from "express";
import { db } from "@workspace/db";
import { invitationCodesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const CreateInviteSchema = z.object({
  role: z.enum(["professor", "student"]).default("professor"),
  expiresInHours: z.number().int().min(1).max(720).default(72),
});

router.post("/invitations", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = CreateInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    return;
  }
  const { role, expiresInHours } = parsed.data;
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
  try {
    const [invite] = await db.insert(invitationCodesTable).values({
      code,
      createdBy: req.user!.sub,
      role,
      expiresAt,
      used: false,
    }).returning();
    res.status(201).json({
      invitation: {
        id: invite.id,
        code: invite.code,
        role: invite.role,
        expiresAt: invite.expiresAt,
        used: invite.used,
        createdAt: invite.createdAt,
      },
    });
  } catch (err) {
    req.log.error(err, "Failed to create invitation code");
    res.status(500).json({ error: "Failed to create invitation code" });
  }
});

router.get("/invitations", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const rows = await db.select().from(invitationCodesTable).orderBy(desc(invitationCodesTable.createdAt));
    res.json({ invitations: rows });
  } catch (err) {
    req.log.error(err, "Failed to list invitation codes");
    res.status(500).json({ error: "Failed to list invitation codes" });
  }
});

export default router;
