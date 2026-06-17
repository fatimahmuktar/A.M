import app from "./app";
import { logger } from "./lib/logger";
import { seedDemoAccounts } from "./lib/seed";
import { pool } from "@workspace/db";

const MIGRATIONS = `
DROP TABLE IF EXISTS "invitation_codes" CASCADE;
DROP TABLE IF EXISTS "verification_codes" CASCADE;
DROP TABLE IF EXISTS "attendance_records" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "student_courses" CASCADE;
DROP TABLE IF EXISTS "professor_courses" CASCADE;
DROP TABLE IF EXISTS "courses" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "student_number" varchar(30) UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "courses" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "instructor" text DEFAULT '' NOT NULL,
  "room" text DEFAULT '' NOT NULL,
  "days" text DEFAULT '' NOT NULL,
  "start_time" text DEFAULT '' NOT NULL,
  "end_time" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "semester" text DEFAULT '' NOT NULL,
  "lat" numeric,
  "lng" numeric,
  "enrollment" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "professor_courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "professor_id" text NOT NULL,
  "course_code" text NOT NULL,
  "course_name" text DEFAULT '' NOT NULL,
  "group_no" text DEFAULT '' NOT NULL,
  "room" text DEFAULT '' NOT NULL,
  "days" text DEFAULT '' NOT NULL,
  "start_time" text DEFAULT '' NOT NULL,
  "end_time" text DEFAULT '' NOT NULL,
  "instructor" text DEFAULT '' NOT NULL,
  "semester" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'imported' NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "student_courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "student_id" text NOT NULL,
  "course_code" text NOT NULL,
  "course_name" text DEFAULT '' NOT NULL,
  "group_no" text DEFAULT '' NOT NULL,
  "room" text DEFAULT '' NOT NULL,
  "days" text DEFAULT '' NOT NULL,
  "start_time" text DEFAULT '' NOT NULL,
  "end_time" text DEFAULT '' NOT NULL,
  "instructor" text DEFAULT '' NOT NULL,
  "semester" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'imported' NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL,
  "token" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "started_at" timestamp DEFAULT now(),
  "ended_at" timestamp
);
CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "course_id" text NOT NULL,
  "student_id" text NOT NULL,
  "student_name" text DEFAULT '' NOT NULL,
  "lat" numeric,
  "lng" numeric,
  "distance_m" integer,
  "flagged" boolean DEFAULT false NOT NULL,
  "flag_reason" text,
  "method" text DEFAULT 'qr' NOT NULL,
  "checked_in_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "verification_codes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "code" text NOT NULL,
  "type" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "invitation_codes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "created_by" text NOT NULL,
  "role" text DEFAULT 'professor' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used" boolean DEFAULT false NOT NULL,
  "used_by" text,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
`;

if (!process.env["SESSION_SECRET"]) {
  throw new Error("SESSION_SECRET environment variable is required but was not provided.");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const dbUrl = process.env.DATABASE_URL || "not set";
  logger.info({ dbUrl: dbUrl.substring(0, 20) + "..." }, "Starting migration");

  pool.connect()
    .then((client) => {
      logger.info({}, "Database connected");
      client.release();
      return pool.query(MIGRATIONS);
    })
    .then(() => logger.info({}, "Migration complete"))
    .then(() => seedDemoAccounts().catch((e) => logger.error({ err: e }, "Seed failed")))
    .catch((e) => logger.error({ err: e }, "Database error"));
});
