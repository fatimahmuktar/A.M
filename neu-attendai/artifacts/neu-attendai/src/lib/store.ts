/**
 * Shared in-browser data store (localStorage).
 * Admin imports the timetable Excel → saves to IMPORTED_COURSES_KEY.
 * Students/professors search it and register their own courses.
 */

export interface CourseRecord {
  id: string;
  name: string;
  instructor: string;
  room: string;
  days?: string;
  startTime?: string;
  endTime?: string;
  enrollment?: number;
  semester?: string;
  source: "imported" | "manual";
}

const KEYS = {
  imported:        "neu_imported_courses",
  student:         "neu_student_courses",
  professor:       "neu_professor_courses",
  activeSemester:  "neu_active_semester",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors in demo
  }
}

/* ── Active Semester ─────────────────────────────────────────── */

function defaultSemester(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 2 && m <= 7 ? `Spring${y}` : `Fall${y}`;
}

export function getActiveSemester(): string {
  return load<string>(KEYS.activeSemester, defaultSemester());
}

export function setActiveSemester(semester: string): void {
  save(KEYS.activeSemester, semester);
}

/* ── Admin: imported courses (source of truth) ───────────────── */

export function getImportedCourses(): CourseRecord[] {
  return load<CourseRecord[]>(KEYS.imported, []);
}

export function saveImportedCourses(courses: CourseRecord[]): void {
  save(KEYS.imported, courses);
}

export function findCourseById(id: string): CourseRecord | null {
  const courses = getImportedCourses();
  return courses.find((c) => c.id.toUpperCase() === id.trim().toUpperCase()) ?? null;
}

/* ── Student registered courses ─────────────────────────────── */

export function getStudentCourses(): CourseRecord[] {
  return load<CourseRecord[]>(KEYS.student, []);
}

export function addStudentCourse(course: CourseRecord): void {
  const list = getStudentCourses();
  if (!list.find((c) => c.id === course.id)) {
    save(KEYS.student, [...list, course]);
  }
}

export function removeStudentCourse(id: string): void {
  save(KEYS.student, getStudentCourses().filter((c) => c.id !== id));
}

/* ── Professor registered courses ─────────────────────────────── */

export function getProfessorCourses(): CourseRecord[] {
  return load<CourseRecord[]>(KEYS.professor, []);
}

export function addProfessorCourse(course: CourseRecord): void {
  const list = getProfessorCourses();
  if (!list.find((c) => c.id === course.id)) {
    save(KEYS.professor, [...list, course]);
  }
}

export function removeProfessorCourse(id: string): void {
  save(KEYS.professor, getProfessorCourses().filter((c) => c.id !== id));
}
