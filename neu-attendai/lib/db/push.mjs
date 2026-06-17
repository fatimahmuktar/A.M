import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./src/schema/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// Drop all tables first (for fresh push)
const tables = Object.values(schema)
  .filter((t) => t?.dbName)
  .reverse();

for (const table of tables) {
  await pool.query(`DROP TABLE IF EXISTS "${table.dbName}" CASCADE`);
}

// Create all tables
const tableEntries = Object.values(schema).filter((t) => t?.dbName);
for (const table of tableEntries) {
  await pool.query(`CREATE TABLE IF NOT EXISTS "${table.dbName}" ()`);
  // Drizzle generates the full CREATE TABLE via its internal methods
}

// Let drizzle handle it via the ORM
await pool.query(/* sql */ `
  CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "password" text NOT NULL,
    "role" text NOT NULL,
    "full_name" text NOT NULL,
    "department" text,
    "gender" text,
    "avatar" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp
  );
  CREATE TABLE IF NOT EXISTS "courses" (
    "code" text PRIMARY KEY NOT NULL,
    "name" text,
    "credits" integer NOT NULL,
    "department" text,
    "semester" text,
    "created_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "professor_courses" (
    "id" serial PRIMARY KEY NOT NULL,
    "professor_id" text NOT NULL,
    "course_code" text NOT NULL,
    "created_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "student_courses" (
    "id" serial PRIMARY KEY NOT NULL,
    "student_id" text NOT NULL,
    "course_code" text NOT NULL,
    "created_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "course_id" text NOT NULL,
    "professor_id" text NOT NULL,
    "started_at" timestamp DEFAULT now(),
    "ended_at" timestamp,
    "active" boolean DEFAULT true,
    "qr_data" text,
    "latitude" double precision,
    "longitude" double precision,
    "location_enabled" boolean DEFAULT false,
    "session_code" text
  );
  CREATE TABLE IF NOT EXISTS "attendance" (
    "id" serial PRIMARY KEY NOT NULL,
    "session_id" integer NOT NULL,
    "student_id" text NOT NULL,
    "checked_in_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "updated_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "verification_codes" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "code" text NOT NULL,
    "type" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "invitation_codes" (
    "code" text PRIMARY KEY NOT NULL,
    "role" text NOT NULL,
    "created_by" text NOT NULL,
    "used_by" text,
    "created_at" timestamp DEFAULT now(),
    "expires_at" timestamp NOT NULL
  );
`);

console.log("Tables created successfully");
await pool.end();
