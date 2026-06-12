import { pgTable, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  instructor:  text("instructor").notNull().default(""),
  room:        text("room").notNull().default(""),
  days:        text("days").notNull().default(""),
  startTime:   text("start_time").notNull().default(""),
  endTime:     text("end_time").notNull().default(""),
  source:      text("source").notNull().default("manual"),
  semester:    text("semester").notNull().default(""),
  lat:         numeric("lat"),
  lng:         numeric("lng"),
  enrollment:  integer("enrollment").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ createdAt: true });
export const selectCourseSchema = createSelectSchema(coursesTable);

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;
