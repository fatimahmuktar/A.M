import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { CheckCircle2, XCircle, Smartphone, User, BookOpen, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "@/context/lang-context";
import {
  apiGetStudentCourses, apiGetStudentAttendance, apiGetSessions,
  type ApiUserCourse, type ApiAttendanceRecord, type ApiSession,
} from "@/lib/api";

function getStudentAuth() {
  try {
    const raw = localStorage.getItem("neu_auth");
    if (!raw) return { name: "Student", id: "" };
    const auth = JSON.parse(raw) as { id?: string; name?: string };
    return { name: auth.name ?? auth.id ?? "Student", id: auth.id ?? "" };
  } catch {
    return { name: "Student", id: "" };
  }
}

/* ── Ring progress (like reference app) ──────────────────────────── */
function AttendanceRing({ pct }: { pct: number }) {
  const size = 52;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = ((pct / 100) * c).toFixed(1);
  const color = pct >= 75 ? "#22c55e" : pct >= 60 ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff15" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
          {pct}%
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">Attendance</span>
    </div>
  );
}

/* ── Types ───────────────────────────────────────────────────────── */
interface SessionRow {
  sessionId:  string;
  date:       string;      /* DD.MM.YY */
  time:       string;      /* HH:MM */
  attended:   boolean;
  method:     string | null;
  recordedDate: string | null;
  recordedTime: string | null;
  flagged:    boolean;
}

interface CourseStats {
  course:        ApiUserCourse;
  totalSessions: number;
  attendedCount: number;
  sessions:      SessionRow[];
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function StudentAttendance() {
  const { t } = useLang();
  const student = getStudentAuth();

  const [loading,     setLoading]     = useState(true);
  const [courseStats, setCourseStats] = useState<CourseStats[]>([]);
  const [selected,    setSelected]    = useState<CourseStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [coursesRes, attRes, sessionsRes] = await Promise.all([
        apiGetStudentCourses(),
        apiGetStudentAttendance(student.id),
        apiGetSessions(),
      ]);
      if (cancelled) return;

      const courses:  ApiUserCourse[]       = coursesRes.data?.courses  ?? [];
      const records:  ApiAttendanceRecord[] = attRes.data?.records       ?? [];
      const sessions: ApiSession[]          = sessionsRes.data?.sessions ?? [];

      /* index: courseCode → attendance records */
      const recsByCourse = new Map<string, ApiAttendanceRecord[]>();
      for (const r of records) {
        const k = r.courseId.toUpperCase();
        if (!recsByCourse.has(k)) recsByCourse.set(k, []);
        recsByCourse.get(k)!.push(r);
      }

      /* index: courseCode → ended sessions */
      const sessByCourse = new Map<string, ApiSession[]>();
      for (const s of sessions) {
        if (!s.endedAt) continue;
        const k = s.courseId.toUpperCase();
        if (!sessByCourse.has(k)) sessByCourse.set(k, []);
        sessByCourse.get(k)!.push(s);
      }

      const stats: CourseStats[] = courses.map((course) => {
        const key      = course.courseCode.toUpperCase();
        const courseRecs = recsByCourse.get(key) ?? [];
        const courseSess = sessByCourse.get(key)  ?? [];

        const attendedSet = new Map<string, ApiAttendanceRecord>();
        for (const r of courseRecs) attendedSet.set(r.sessionId, r);

        /* Build rows from ended sessions */
        const rows: SessionRow[] = courseSess
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          .map((s) => {
            const rec  = attendedSet.get(s.id);
            const dt   = new Date(s.startedAt);
            const rAt  = rec?.checkedInAt ? new Date(rec.checkedInAt) : null;
            return {
              sessionId:    s.id,
              date:         fmtDate(dt),
              time:         fmtTime(dt),
              attended:     !!rec,
              method:       rec?.method ?? null,
              recordedDate: rAt ? fmtDate(rAt) : null,
              recordedTime: rAt ? fmtTime(rAt) : null,
              flagged:      rec?.flagged ?? false,
            };
          });

        /* Fallback: if no sessions in DB yet, show check-in records only */
        const fallback: SessionRow[] = rows.length === 0
          ? courseRecs
              .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
              .map((r) => {
                const dt = new Date(r.checkedInAt);
                return {
                  sessionId:    r.sessionId,
                  date:         fmtDate(dt),
                  time:         fmtTime(dt),
                  attended:     true,
                  method:       r.method,
                  recordedDate: fmtDate(dt),
                  recordedTime: fmtTime(dt),
                  flagged:      r.flagged,
                };
              })
          : [];

        const finalRows     = rows.length > 0 ? rows : fallback;
        const attendedCount = finalRows.filter((r) => r.attended).length;

        return { course, totalSessions: finalRows.length, attendedCount, sessions: finalRows };
      });

      setCourseStats(stats);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [student.id]);

  return (
    <Layout role="student">
      <AnimatePresence mode="wait">

        {/* ══ Loading ══ */}
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Loading attendance data…</p>
          </motion.div>
        )}

        {/* ══ Course list ══ */}
        {!loading && !selected && (
          <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="mb-1">
              <h1 className="text-xl font-bold">{t("student.attReport")}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{t("student.attReportDesc")}</p>
            </div>

            {courseStats.length === 0 ? (
              <div className="py-16 text-center space-y-3 border border-dashed border-border rounded-2xl">
                <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">{t("student.noAttYet")}</p>
                <p className="text-xs text-muted-foreground/70">{t("student.goSelfAtt")}</p>
              </div>
            ) : (
              courseStats.map((cs, i) => {
                const pct = cs.totalSessions > 0
                  ? Math.round((cs.attendedCount / cs.totalSessions) * 100)
                  : 0;
                return (
                  <motion.button
                    key={cs.course.courseCode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelected(cs)}
                    className="w-full text-left bg-card border border-border hover:border-primary/40 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all"
                  >
                    {/* Left: code + name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground">
                        {cs.course.courseCode}
                        {cs.course.groupNo ? ` - ${cs.course.groupNo}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cs.course.courseName}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {cs.attendedCount} / {cs.totalSessions} sessions
                      </p>
                    </div>

                    {/* Right: ring */}
                    <AttendanceRing pct={pct} />
                  </motion.button>
                );
              })
            )}
          </motion.div>
        )}

        {/* ══ Course detail — attendance table ══ */}
        {!loading && selected && (
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            {/* Back header */}
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("student.attReport")}
            </button>

            {/* Course title */}
            <div className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-base">
                  {selected.course.courseCode}
                  {selected.course.groupNo ? ` — ${selected.course.groupNo}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.course.courseName}</p>
              </div>
              <AttendanceRing
                pct={selected.totalSessions > 0
                  ? Math.round((selected.attendedCount / selected.totalSessions) * 100)
                  : 0}
              />
            </div>

            {/* Attendance table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 px-4 py-3 bg-muted/40 border-b border-border">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Date</span>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide text-center">Attended</span>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide text-center">Type</span>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide text-right">Recorded-At</span>
              </div>

              {/* Rows */}
              {selected.sessions.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>{t("student.noSessionsYet")}</p>
                </div>
              ) : (
                selected.sessions.map((row, i) => {
                  const isQr = row.method === "qr" || row.method === "code";
                  return (
                    <motion.div
                      key={row.sessionId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className={`grid grid-cols-4 items-center px-4 py-3.5 border-b border-border/50 last:border-0 ${row.attended ? "bg-green-500/5" : "bg-destructive/5"}`}
                    >
                      {/* Date */}
                      <div>
                        <p className="text-xs font-mono font-semibold leading-tight">{row.date}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{row.time}</p>
                      </div>

                      {/* Attended icon */}
                      <div className="flex justify-center">
                        {row.attended
                          ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                          : <XCircle      className="w-5 h-5 text-destructive/70" />
                        }
                      </div>

                      {/* Type icon */}
                      <div className="flex justify-center">
                        {row.attended
                          ? (isQr
                            ? <Smartphone className="w-4 h-4 text-muted-foreground" />
                            : <User       className="w-4 h-4 text-muted-foreground" />)
                          : <span className="text-muted-foreground/30 text-sm font-bold">—</span>
                        }
                      </div>

                      {/* Recorded-At */}
                      <div className="text-right">
                        {row.attended && row.recordedDate ? (
                          <>
                            <p className="text-xs font-mono leading-tight">{row.recordedDate}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{row.recordedTime}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground/30 text-sm font-bold">—</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </Layout>
  );
}
