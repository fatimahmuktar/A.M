import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id:        uuid("id").primaryKey().defaultRandom(),
  courseId:  text("course_id").notNull(),
  token:     text("token").notNull(),
  active:    boolean("active").notNull().default(true),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt:   timestamp("ended_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, startedAt: true, endedAt: true });
export const selectSessionSchema = createSelectSchema(sessionsTable);

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
