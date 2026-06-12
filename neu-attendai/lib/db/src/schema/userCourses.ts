import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const studentCoursesTable = pgTable("student_courses", {
  id:         serial("id").primaryKey(),
  studentId:  text("student_id").notNull(),
  courseCode: text("course_code").notNull(),
  courseName: text("course_name").notNull().default(""),
  groupNo:    text("group_no").notNull().default(""),
  room:       text("room").notNull().default(""),
  days:       text("days").notNull().default(""),
  startTime:  text("start_time").notNull().default(""),
  endTime:    text("end_time").notNull().default(""),
  instructor: text("instructor").notNull().default(""),
  semester:   text("semester").notNull().default(""),
  source:     text("source").notNull().default("imported"),
  createdAt:  timestamp("created_at").defaultNow(),
});

export const professorCoursesTable = pgTable("professor_courses", {
  id:          serial("id").primaryKey(),
  professorId: text("professor_id").notNull(),
  courseCode:  text("course_code").notNull(),
  courseName:  text("course_name").notNull().default(""),
  groupNo:     text("group_no").notNull().default(""),
  room:        text("room").notNull().default(""),
  days:        text("days").notNull().default(""),
  startTime:   text("start_time").notNull().default(""),
  endTime:     text("end_time").notNull().default(""),
  instructor:  text("instructor").notNull().default(""),
  semester:    text("semester").notNull().default(""),
  source:      text("source").notNull().default("imported"),
  createdAt:   timestamp("created_at").defaultNow(),
});
