import { pgTable, text, boolean, integer, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attendanceTable = pgTable("attendance_records", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   text("session_id").notNull(),
  courseId:    text("course_id").notNull(),
  studentId:   text("student_id").notNull(),
  studentName: text("student_name").notNull().default(""),
  lat:         numeric("lat"),
  lng:         numeric("lng"),
  distanceM:   integer("distance_m"),
  flagged:     boolean("flagged").notNull().default(false),
  flagReason:  text("flag_reason"),
  method:      text("method").notNull().default("qr"),
  checkedInAt: timestamp("checked_in_at").defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, checkedInAt: true });
export const selectAttendanceSchema = createSelectSchema(attendanceTable);

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceTable.$inferSelect;
