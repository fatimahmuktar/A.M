import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const verificationCodesTable = pgTable("verification_codes", {
  id:        uuid("id").defaultRandom().primaryKey(),
  email:     text("email").notNull(),
  code:      text("code").notNull(),
  type:      text("type").notNull(), // "email_verify" | "password_reset"
  expiresAt: timestamp("expires_at").notNull(),
  used:      boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type VerificationCode = typeof verificationCodesTable.$inferSelect;
