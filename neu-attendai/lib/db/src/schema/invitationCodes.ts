import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const invitationCodesTable = pgTable("invitation_codes", {
  id:        uuid("id").defaultRandom().primaryKey(),
  code:      text("code").unique().notNull(),
  createdBy: text("created_by").notNull(),
  role:      text("role").notNull().default("professor"),
  expiresAt: timestamp("expires_at").notNull(),
  used:      boolean("used").default(false).notNull(),
  usedBy:    text("used_by"),
  usedAt:    timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
