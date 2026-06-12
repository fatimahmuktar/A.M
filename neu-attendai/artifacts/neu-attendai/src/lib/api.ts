/**
 * Typed API client for NEU AttendAI backend.
 * All functions return { data, error } — callers decide how to handle errors.
 * Falls back gracefully when the server is unreachable.
 *
 * Auth: every request includes x-user-id header from localStorage "neu_auth".
 */

export interface ApiCourse {
  id: string;
  name: string;
  instructor: string;
  room: string;
  days: string;
  startTime: string;
  endTime: string;
  source: "imported" | "manual";
  semester: string;
  lat?: string | null;
  lng?: string | null;
  enrollment: number;
}

export interface ApiSession {
  id: string;
  courseId: string;
  token: string;
  active: boolean;
  startedAt: string;
  endedAt: string | null;
}

export interface ApiAttendanceRecord {
  id: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  lat?: string | null;
  lng?: string | null;
  distanceM?: number | null;
  flagged: boolean;
  flagReason?: string | null;
  method: string;
  checkedInAt: string;
}

export interface ApiUserCourse {
  id: number;
  courseCode: string;
  courseName: string;
  groupNo: string;
  room: string;
  days: string;
  startTime: string;
  endTime: string;
  instructor: string;
  semester: string;
  source: string;
  createdAt: string;
}

type ApiResult<T> = { data: T; error: null } | { data: null; error: string };

/* ── Auth helper ──────────────────────────────────────────────── */

function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem("neu_auth");
    if (!raw) return {};
    const auth = JSON.parse(raw) as { id?: string };
    return auth.id ? { "x-user-id": auth.id } : {};
  } catch {
    return {};
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? `HTTP ${res.status}` };
    return { data: json as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

/* ── Courses ─────────────────────────────────────────────────── */

export async function apiGetCourses(semester?: string) {
  const qs = semester ? `?semester=${encodeURIComponent(semester)}` : "";
  return apiFetch<{ courses: ApiCourse[] }>(`/courses${qs}`);
}

export async function apiSearchCourses(q: string) {
  return apiFetch<{ courses: ApiCourse[] }>(`/courses/search?q=${encodeURIComponent(q)}`);
}

export async function apiGetSemesters() {
  return apiFetch<{ semesters: string[] }>("/courses/semesters");
}

export async function apiImportCourses(courses: ApiCourse[], semester: string) {
  return apiFetch<{ inserted: number; updated: number; total: number; semester: string }>(
    "/courses/import",
    {
      method: "POST",
      body: JSON.stringify({ courses, semester }),
    }
  );
}

export async function apiCreateCourse(course: ApiCourse) {
  return apiFetch<{ course: ApiCourse }>("/courses", {
    method: "POST",
    body: JSON.stringify(course),
  });
}

export async function apiDeleteCourse(id: string) {
  return apiFetch<{ deleted: string }>(`/courses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function apiDeleteAllCourses() {
  return apiFetch<{ deleted: string }>("/courses", { method: "DELETE" });
}

/* ── Settings ────────────────────────────────────────────────── */

export async function apiGetActiveSemester() {
  return apiFetch<{ semester: string }>("/settings/active-semester");
}

export async function apiSetActiveSemester(semester: string) {
  return apiFetch<{ semester: string }>("/settings/active-semester", {
    method: "POST",
    body: JSON.stringify({ semester }),
  });
}

/* ── Sessions ────────────────────────────────────────────────── */

export async function apiStartSession(courseId: string, token: string) {
  return apiFetch<{ session: ApiSession }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ courseId, token }),
  });
}

export async function apiEndSession(sessionId: string) {
  return apiFetch<{ session: ApiSession }>(`/sessions/${sessionId}/end`, {
    method: "PATCH",
  });
}

export async function apiGetSessions() {
  return apiFetch<{ sessions: ApiSession[] }>("/sessions");
}

export async function apiGetSessionAttendance(sessionId: string) {
  return apiFetch<{ records: ApiAttendanceRecord[] }>(`/sessions/${sessionId}/attendance`);
}

/* ── Attendance ──────────────────────────────────────────────── */

export interface CheckInPayload {
  sessionId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
  flagged: boolean;
  flagReason?: string;
  method: "qr" | "code";
}

export async function apiCheckIn(payload: CheckInPayload) {
  return apiFetch<{ record: ApiAttendanceRecord }>("/attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiGetStudentAttendance(studentId: string) {
  return apiFetch<{ records: ApiAttendanceRecord[] }>(`/attendance/student/${encodeURIComponent(studentId)}`);
}

export async function apiManualCheckIn(payload: {
  sessionId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  reason?: string;
}) {
  return apiFetch<{ record: ApiAttendanceRecord }>("/attendance/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ── Student courses ─────────────────────────────────────────── */

export async function apiGetStudentCourses() {
  return apiFetch<{ courses: ApiUserCourse[] }>("/student/courses");
}

export async function apiAddStudentCourse(course: {
  courseCode: string; courseName: string; groupNo?: string;
  room: string; days: string; startTime: string; endTime: string;
  instructor: string; semester: string; source: "imported" | "manual";
}) {
  return apiFetch<{ course: ApiUserCourse }>("/student/courses", {
    method: "POST",
    body: JSON.stringify(course),
  });
}

export async function apiRemoveStudentCourse(courseCode: string) {
  return apiFetch<{ deleted: string }>(`/student/courses/${encodeURIComponent(courseCode)}`, {
    method: "DELETE",
  });
}

/* ── Professor: enrolled students per course ─────────────────── */

export interface ApiEnrolledStudent {
  studentId:     string;
  studentName:   string;
  studentNumber: string | null;
}

export async function apiGetCourseStudents(courseCode: string) {
  return apiFetch<{ students: ApiEnrolledStudent[] }>(
    `/professor/courses/${encodeURIComponent(courseCode)}/students`
  );
}

/* ── Professor courses ───────────────────────────────────────── */

export async function apiGetProfessorCourses() {
  return apiFetch<{ courses: ApiUserCourse[] }>("/professor/courses");
}

export async function apiAddProfessorCourse(course: {
  courseCode: string; courseName: string; groupNo?: string;
  room: string; days: string; startTime: string; endTime: string;
  instructor: string; semester: string; source: "imported" | "manual";
}) {
  return apiFetch<{ course: ApiUserCourse }>("/professor/courses", {
    method: "POST",
    body: JSON.stringify(course),
  });
}

export async function apiRemoveProfessorCourse(courseCode: string) {
  return apiFetch<{ deleted: string }>(`/professor/courses/${encodeURIComponent(courseCode)}`, {
    method: "DELETE",
  });
}
