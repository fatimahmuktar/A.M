import { pgTable, text, integer, boolean, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id:            uuid("id").defaultRandom().primaryKey(),
  email:         text("email").unique().notNull(),
  studentNumber: varchar("student_number", { length: 30 }).unique(),
  passwordHash:  text("password_hash").notNull(),
  name:          text("name").notNull(),
  role:          text("role").notNull(), // "student" | "professor" | "admin"
  emailVerified: boolean("email_verified").default(false).notNull(),
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil:   timestamp("locked_until"),
  createdAt:     timestamp("created_at").defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
