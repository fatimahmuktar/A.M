import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { QRCodeDisplay } from "@/components/qr-code";
import { GeoFenceMap } from "@/components/geo-fence-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Square, Play, MapPin, AlertTriangle, UserCheck, UserX,
  Clock, RefreshCw, Search, Plus, BookOpen, X, Trash2,
  Brain, ShieldAlert, TrendingDown, TrendingUp, Minus,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type CourseRecord } from "@/lib/store";
import {
  apiStartSession, apiEndSession, apiGetCourses,
  apiGetProfessorCourses, apiAddProfessorCourse, apiRemoveProfessorCourse,
  apiManualCheckIn, apiGetCourseStudents, apiGetSessionAttendance,
  type ApiUserCourse,
} from "@/lib/api";
import { getActiveSemester } from "@/lib/store";
import { generateSessionToken } from "@/lib/session-token";
import { useLang } from "@/context/lang-context";
import { generateCourseStudentRisks, type StudentRisk } from "@/lib/ai-analytics";
import { AIInsightCard, RiskBadge, TrendIcon } from "@/components/ai-insight-card";

function mapUserCourse(c: ApiUserCourse): CourseRecord {
  return {
    id:         c.courseCode,
    name:       c.courseName,
    instructor: c.instructor,
    room:       c.room,
    days:       c.days,
    startTime:  c.startTime,
    endTime:    c.endTime,
    semester:   c.semester,
    source:     c.source as "imported" | "manual",
  };
}

type ProfessorScreen = "my_courses" | "add_course" | "live_session";
type AttendStatus    = "present" | "late" | "absent" | "flagged";

interface StudentRow {
  id: string; name: string; studentNumber?: string;
  checkIn: string | null; status: AttendStatus; geoVerified: boolean;
  fraudFlag?: string;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatElapsed(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: AttendStatus }) {
  switch (status) {
    case "present":  return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Present</Badge>;
    case "late":     return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Late</Badge>;
    case "flagged":  return <Badge variant="destructive" className="animate-pulse">Flagged</Badge>;
    default:         return <Badge variant="outline" className="text-muted-foreground">Absent</Badge>;
  }
}

/* ── AI session insights ─────────────────────────────────────────── */
function buildSessionInsights(
  students: StudentRow[],
  elapsed: number,
  course: CourseRecord,
): string[] {
  const insights: string[] = [];
  const present = students.filter((s) => s.status === "present" || s.status === "late").length;
  const flagged = students.filter((s) => s.status === "flagged").length;
  const late    = students.filter((s) => s.status === "late").length;
  const rate    = students.length ? Math.round((present / students.length) * 100) : 0;

  if (students.length === 0) {
    insights.push("Session is live — waiting for students to check in");
  } else {
    if (rate < 70) insights.push(`Attendance rate ${rate}% is below the 70% minimum threshold`);
    if (flagged > 0) insights.push(`${flagged} suspicious check-in${flagged > 1 ? "s" : ""} detected — review flagged students`);
    if (late > 0)    insights.push(`${late} student${late > 1 ? "s" : ""} checked in late`);
    if (elapsed > 900 && present < (students.length * 0.5)) insights.push("Low attendance after 15 min — consider sending a reminder");
    if (rate >= 90)  insights.push("Excellent attendance rate — above 90% so far");
    if (course.startTime) {
      const hour = parseInt(course.startTime.split(":")[0] ?? "10");
      if (hour < 9) insights.push("Early morning session — historically lower attendance");
    }
  }
  return insights;
}

export default function ProfessorDashboard() {
  const { t } = useLang();

  const [screen,        setScreen]        = useState<ProfessorScreen>("my_courses");
  const [myCourses,     setMyCourses]     = useState<CourseRecord[]>([]);
  const [dbCourses,     setDbCourses]     = useState<CourseRecord[]>([]);
  const [dbLoading,     setDbLoading]     = useState(false);
  const [activeCourse,    setActiveCourse]    = useState<CourseRecord | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionActive,   setSessionActive]   = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [students,      setStudents]      = useState<StudentRow[]>([]);
  const [justMarked,    setJustMarked]    = useState<string | null>(null);
  const [studentRisks,  setStudentRisks]  = useState<StudentRisk[]>([]);
  const [showRiskPanel, setShowRiskPanel] = useState(true);
  const [fraudLog,      setFraudLog]      = useState<{ name: string; reason: string; ts: string }[]>([]);

  const [searchCode,    setSearchCode]    = useState("");
  const [searchResults, setSearchResults] = useState<CourseRecord[] | "not_found" | null>(null);
  const [manualMode,    setManualMode]    = useState(false);
  const [manualForm,   setManualForm]   = useState({
    id: "", name: "", instructor: "", room: "", days: "", startTime: "", endTime: "",
  });

  /* ── Load professor's saved courses from DB on mount ── */
  useEffect(() => {
    apiGetProfessorCourses().then((r) => {
      if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
    });
  }, []);

  /* ── Load timetable courses when add_course opens (for search) ── */
  useEffect(() => {
    if (screen !== "add_course") return;
    setDbLoading(true);
    const activeSem = getActiveSemester();
    apiGetCourses(activeSem).then((r) => {
      if (r.data) {
        setDbCourses(r.data.courses.map((c) => ({
          id: c.id, name: c.name, instructor: c.instructor,
          room: c.room, days: c.days, startTime: c.startTime,
          endTime: c.endTime, enrollment: c.enrollment,
          semester: c.semester, source: c.source as "imported" | "manual",
        })));
      }
      setDbLoading(false);
    });
  }, [screen]);

  useEffect(() => {
    if (!sessionActive) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sessionActive]);

  /* Poll session attendance every 5 s so QR / code check-ins appear automatically */
  useEffect(() => {
    if (!sessionActive || !activeSessionId) return;
    const poll = async () => {
      const { data } = await apiGetSessionAttendance(activeSessionId);
      if (!data?.records) return;
      setStudents((prev) => {
        const next = [...prev];
        for (const rec of data.records) {
          const idx = next.findIndex((s) => s.id === rec.studentId);
          const checkedAt = rec.checkedInAt
            ? new Date(rec.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
            : nowTime();
          const status: AttendStatus = rec.flagged ? "flagged" : "present";
          if (idx >= 0) {
            if (next[idx]!.status === "absent") {
              next[idx] = { ...next[idx]!, status, checkIn: checkedAt, geoVerified: !rec.flagged };
            }
          } else {
            next.push({
              id: rec.studentId, name: rec.studentName,
              checkIn: checkedAt, status, geoVerified: !rec.flagged,
              fraudFlag: rec.flagReason ?? undefined,
            });
          }
        }
        return next;
      });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [sessionActive, activeSessionId]);

  const handleCodeChange = useCallback(() => {}, []);

  const markStudent = (id: string, status: AttendStatus, name?: string) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status, checkIn: status !== "absent" ? nowTime() : null, geoVerified: status === "present" }
          : s
      )
    );
    setJustMarked(id);
    setTimeout(() => setJustMarked(null), 1500);
    /* Persist to DB when marking present (manual override) */
    if (status === "present" && activeSessionId && activeCourse) {
      const studentName = name ?? students.find((s) => s.id === id)?.name ?? "";
      apiManualCheckIn({
        sessionId:   activeSessionId,
        courseId:    activeCourse.id,
        studentId:   id,
        studentName,
      }).catch(() => {/* silent — local state already updated */});
    }
  };

  /* Manual entry: professor types student ID to add to roster and mark present */
  const [manualEntryId,   setManualEntryId]   = useState("");
  const [manualEntryName, setManualEntryName] = useState("");
  const [manualEntryBusy, setManualEntryBusy] = useState(false);

  const handleManualEntry = async () => {
    const sid  = manualEntryId.trim().toUpperCase();
    const name = manualEntryName.trim() || sid;
    if (!sid || !activeSessionId || !activeCourse) return;
    setManualEntryBusy(true);
    /* Add to local roster if not already there */
    setStudents((prev) => {
      const exists = prev.find((s) => s.id === sid);
      if (exists) return prev.map((s) => s.id === sid ? { ...s, status: "present", checkIn: nowTime(), geoVerified: false } : s);
      return [...prev, { id: sid, name, checkIn: nowTime(), status: "present", geoVerified: false }];
    });
    setJustMarked(sid);
    setTimeout(() => setJustMarked(null), 1500);
    await apiManualCheckIn({ sessionId: activeSessionId, courseId: activeCourse.id, studentId: sid, studentName: name });
    setManualEntryId(""); setManualEntryName(""); setManualEntryBusy(false);
  };

  const startSession = async (course: CourseRecord) => {
    setActiveCourse(course);
    setSessionActive(true);
    setElapsed(0);
    setStudents([]);
    setFraudLog([]);
    const risks = generateCourseStudentRisks(course.id);
    setStudentRisks(risks);
    setScreen("live_session");

    const token = generateSessionToken(course.id).code;
    const { data } = await apiStartSession(course.id, token);
    if (data?.session) {
      setActiveSessionId(data.session.id);
      localStorage.setItem("neu_active_session_id", data.session.id);
      localStorage.setItem("neu_active_session_course", course.id);
    }

    /* Pre-populate roster with all enrolled students as absent */
    const { data: enrolled } = await apiGetCourseStudents(course.id);
    if (enrolled?.students && enrolled.students.length > 0) {
      setStudents(
        enrolled.students.map((s) => ({
          id:            s.studentId,
          name:          s.studentName,
          studentNumber: s.studentNumber ?? undefined,
          checkIn:       null,
          status:        "absent",
          geoVerified:   false,
        }))
      );
    }
  };

  const endSession = async () => {
    setSessionActive(false);
    if (activeSessionId) {
      await apiEndSession(activeSessionId);
      setActiveSessionId(null);
      localStorage.removeItem("neu_active_session_id");
      localStorage.removeItem("neu_active_session_course");
    }
  };

  /* Simulate a flagged student check-in (demo) */
  const simulateFraudCheckIn = () => {
    if (studentRisks.length === 0) return;
    const at_risk = studentRisks.filter((r) => r.riskLevel === "high");
    if (at_risk.length === 0) return;
    const pick = at_risk[Math.floor(Math.random() * at_risk.length)];
    const reasons = [
      "GPS accuracy 0.8 m — spoofing suspected",
      "Impossible travel: 45 km/h required",
      "Duplicate check-in attempt within 8 seconds",
    ];
    const reason = reasons[Math.floor(Math.random() * reasons.length)] ?? reasons[0];
    setStudents((prev) => {
      const exists = prev.find((s) => s.id === pick.studentId);
      if (exists) {
        return prev.map((s) => s.id === pick.studentId
          ? { ...s, status: "flagged", checkIn: nowTime(), geoVerified: false, fraudFlag: reason }
          : s
        );
      }
      return [...prev, {
        id: pick.studentId, name: pick.studentName,
        checkIn: nowTime(), status: "flagged", geoVerified: false, fraudFlag: reason,
      }];
    });
    setFraudLog((fl) => [{ name: pick.studentName, reason: reason!, ts: nowTime() }, ...fl].slice(0, 5));
  };

  const handleSearch = () => {
    if (!searchCode.trim()) return;
    const q = searchCode.trim().toLowerCase();
    const matches = dbCourses.filter((c) => {
      const id   = c.id.toLowerCase();
      const name = c.name.toLowerCase();
      return id.includes(q) || name.includes(q);
    });
    if (matches.length > 0) { setSearchResults(matches); setManualMode(false); }
    else { setSearchResults("not_found"); setManualForm((f) => ({ ...f, id: searchCode.trim().toUpperCase() })); }
  };

  const handleAddCourse = async (course: CourseRecord) => {
    await apiAddProfessorCourse({
      courseCode: course.id,
      courseName: course.name,
      room:       course.room       ?? "",
      days:       course.days       ?? "",
      startTime:  course.startTime  ?? "",
      endTime:    course.endTime    ?? "",
      instructor: course.instructor ?? "",
      semester:   course.semester   ?? "",
      source:     course.source,
    });
    const r = await apiGetProfessorCourses();
    if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
    setScreen("my_courses");
    setSearchCode(""); setSearchResults(null); setManualMode(false);
    setManualForm({ id: "", name: "", instructor: "", room: "", days: "", startTime: "", endTime: "" });
  };

  const handleRemoveCourse = async (id: string) => {
    await apiRemoveProfessorCourse(id);
    const r = await apiGetProfessorCourses();
    if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
  };

  const presentCount   = students.filter((s) => s.status === "present" || s.status === "late").length;
  const attendanceRate = students.length ? Math.round((presentCount / students.length) * 100) : 0;
  const flaggedCount   = students.filter((s) => s.status === "flagged").length;
  const absentCount    = students.filter((s) => s.status === "absent").length;

  const sessionInsights = activeCourse
    ? buildSessionInsights(students, elapsed, activeCourse)
    : [];

  /* Risk distribution */
  const riskCounts = {
    high:   studentRisks.filter((r) => r.riskLevel === "high").length,
    medium: studentRisks.filter((r) => r.riskLevel === "medium").length,
    low:    studentRisks.filter((r) => r.riskLevel === "low").length,
  };

  return (
    <Layout role="professor">
      <AnimatePresence mode="wait">

        {/* ══ My Courses ══ */}
        {screen === "my_courses" && (
          <motion.div key="my_courses" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{t("professor.portal")}</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1">{t("professor.portalDesc")}</p>
              </div>
              <button
                onClick={() => setScreen("add_course")}
                className="shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> {t("common.addCourse")}
              </button>
            </div>

            {myCourses.length === 0 ? (
              <div className="py-20 text-center space-y-4 border border-dashed border-border rounded-2xl">
                <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="font-semibold text-sm">{t("professor.noCoursesYet")}</p>
                  <p className="text-xs text-muted-foreground mt-1 px-8">{t("professor.noCoursesHint")}</p>
                </div>
                <button
                  onClick={() => setScreen("add_course")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> {t("professor.addFirstCourse")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myCourses.map((course) => {
                  const risks = generateCourseStudentRisks(course.id);
                  const highCount = risks.filter((r) => r.riskLevel === "high").length;
                  return (
                    <div key={course.id} className="bg-card border border-border hover:border-primary/40 rounded-xl px-3 sm:px-5 py-3 sm:py-4 transition-all flex items-center gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono font-bold text-primary text-sm whitespace-nowrap">{course.id}</span>
                          {course.source === "imported" && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                              {t("common.fromTimetable")}
                            </span>
                          )}
                          {highCount > 0 && (
                            <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1 whitespace-nowrap">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {highCount} high risk
                            </span>
                          )}
                        </div>
                        <p className="font-semibold mt-0.5 truncate">{course.name}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {course.room && <span className="flex items-center gap-1 whitespace-nowrap"><MapPin className="w-3 h-3 shrink-0" />{course.room}</span>}
                          {course.days && <span className="whitespace-nowrap">{course.days}</span>}
                          {course.startTime && course.endTime && <span className="whitespace-nowrap">{course.startTime}–{course.endTime}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <button
                          onClick={() => startSession(course)}
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> {t("professor.startSession")}
                        </button>
                        <button
                          onClick={() => handleRemoveCourse(course.id)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ══ Add Course ══ */}
        {screen === "add_course" && (
          <motion.div key="add_course" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 max-w-md mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("professor.addCourseTitle")}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("professor.addCourseDesc")}</p>
              </div>
              <button
                onClick={() => { setScreen("my_courses"); setSearchCode(""); setSearchResults(null); setManualMode(false); }}
                className="shrink-0 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Enter course code — e.g. CS301"
                  value={searchCode}
                  onChange={(e) => { setSearchCode(e.target.value.toUpperCase()); setSearchResults(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchCode.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {t("common.search")}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {Array.isArray(searchResults) && !manualMode && (
                <motion.div key="found" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium px-1">
                    {searchResults.length} course{searchResults.length !== 1 ? "s" : ""} found — click to add
                  </p>
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {searchResults.map((course) => (
                      <div key={course.id} className="bg-card border border-border hover:border-primary/50 rounded-xl p-3 space-y-1 cursor-pointer transition-colors group"
                        onClick={() => handleAddCourse(course)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-primary text-sm">{course.id}</span>
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">+ Add</span>
                        </div>
                        <p className="text-sm font-medium leading-tight">{course.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {course.room && course.room !== "—" && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{course.room}</span>}
                          {course.days && <span>{course.days}</span>}
                          {course.startTime && course.endTime && <span>{course.startTime}–{course.endTime}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {searchResults === "not_found" && !manualMode && (
                <motion.div key="notfound" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                  <p className="font-semibold text-sm text-yellow-500">
                    Course "<span className="font-mono">{searchCode}</span>" not found in timetable
                  </p>
                  <p className="text-xs text-muted-foreground">Add it manually, or ask the admin to import the Excel timetable.</p>
                  <button
                    onClick={() => setManualMode(true)}
                    className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add manually
                  </button>
                </motion.div>
              )}

              {manualMode && (
                <motion.div key="manual" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <p className="font-semibold text-sm">Manual Entry</p>
                  {[
                    { key: "id",         label: t("field.courseCode"),  placeholder: "CS301"           },
                    { key: "name",       label: t("field.courseName"),  placeholder: "Data Structures" },
                    { key: "instructor", label: t("field.instructor"),  placeholder: "Dr. Smith"       },
                    { key: "room",       label: t("field.room"),        placeholder: "B204"            },
                    { key: "days",       label: t("field.days"),        placeholder: "Mon, Wed"        },
                    { key: "startTime",  label: t("field.startTime"),   placeholder: "09:00"           },
                    { key: "endTime",    label: t("field.endTime"),     placeholder: "10:30"           },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                      <input
                        type="text" placeholder={placeholder}
                        value={(manualForm as Record<string, string>)[key]}
                        onChange={(e) => setManualForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                  <button
                    disabled={!manualForm.id.trim() || !manualForm.name.trim()}
                    onClick={() => handleAddCourse({ ...manualForm, source: "manual" })}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> {t("common.addCourse")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ══ Live Session ══ */}
        {screen === "live_session" && activeCourse && (
          <motion.div key="live_session" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <button
                  onClick={() => { setScreen("my_courses"); setSessionActive(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground mb-1 block"
                >
                  ← {t("professor.myCourses")}
                </button>
                <h1 className="text-xl sm:text-3xl font-bold tracking-tight leading-tight">{t("professor.liveSession")}</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-1 truncate">
                  {t("professor.liveDesc")} — {activeCourse.id} / {activeCourse.room || "—"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm font-mono">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  {formatElapsed(elapsed)} elapsed
                </div>
                {/* Demo: simulate a flagged check-in */}
                <button
                  onClick={simulateFraudCheckIn}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                  title="Simulate a suspicious check-in for demo"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Simulate Fraud
                </button>
                <Button
                  variant={sessionActive ? "destructive" : "default"}
                  onClick={() => { if (sessionActive) endSession(); else setSessionActive(true); }}
                  className="gap-2"
                >
                  {sessionActive
                    ? <><Square className="w-4 h-4" /> {t("professor.endSession")}</>
                    : <><Play  className="w-4 h-4" /> {t("professor.resume")}</>}
                </Button>
              </div>
            </div>

            {/* Fraud alert log */}
            <AnimatePresence>
              {fraudLog.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-sm font-semibold text-destructive">Suspicious Attendance Detected</p>
                  </div>
                  {fraudLog.slice(0, 3).map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-destructive/80">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span><span className="font-semibold">{f.name}</span> — {f.reason} <span className="opacity-60">({f.ts})</span></span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Attendance stats */}
              <Card className="border-primary/20">
                <CardHeader className="pb-2 border-b border-border/50">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-semibold text-primary">{t("professor.attStats")}</CardTitle>
                    {sessionActive && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 animate-pulse text-xs">
                        {t("professor.live")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-400">{presentCount}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("professor.present")}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-muted-foreground">{students.length - presentCount}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("professor.absent")}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm text-muted-foreground">{presentCount} / {students.length || "—"} students</span>
                      <span className="text-2xl font-bold text-primary">{students.length ? `${attendanceRate}%` : "—"}</span>
                    </div>
                    <div className="relative">
                      <Progress value={attendanceRate} className="h-2.5" />
                      <div className="absolute top-0 bottom-0 w-0.5 bg-destructive/70" style={{ left: "70%" }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>0%</span>
                      <span className="text-destructive/70">70% threshold</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Course &amp; Room</p>
                    <p className="font-bold text-sm">{activeCourse.id} — {activeCourse.name}</p>
                    <p className="text-sm text-primary">{activeCourse.room || "—"}</p>
                  </div>
                </CardContent>
              </Card>

              {/* QR code */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{t("professor.attCode")}</CardTitle>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3" /> {t("professor.every2min")}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center py-6 gap-2">
                  <QRCodeDisplay sessionId={activeCourse.id} onCodeChange={handleCodeChange} showEnlarge />
                  <p className="text-xs text-center text-muted-foreground mt-2 px-4">
                    {t("professor.studentsDesc")}
                  </p>
                </CardContent>
              </Card>

              {/* Geo-fence map */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2 border-b border-border/50">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Location Map</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center pt-2">
                  <GeoFenceMap />
                </CardContent>
              </Card>
            </div>

            {/* AI session insights */}
            <AIInsightCard
              title="AI Session Insights"
              insights={sessionInsights}
              compact={false}
            />

            {/* At-Risk Student Panel */}
            <Card>
              <CardHeader className="border-b border-border/50 cursor-pointer" onClick={() => setShowRiskPanel((v) => !v)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    AI Risk Assessment — Enrolled Students
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-destructive font-semibold">{riskCounts.high} high</span>
                      <span className="text-yellow-500 font-semibold">{riskCounts.medium} medium</span>
                      <span className="text-green-400 font-semibold">{riskCounts.low} low</span>
                    </div>
                    {showRiskPanel ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
              </CardHeader>
              <AnimatePresence>
                {showRiskPanel && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <CardContent className="p-0">
                      <div className="max-h-64 overflow-auto">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead className="pl-6">Student</TableHead>
                              <TableHead>Attendance</TableHead>
                              <TableHead>Trend</TableHead>
                              <TableHead>Risk</TableHead>
                              <TableHead className="pr-6">Insight</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {studentRisks.map((r) => (
                              <TableRow key={r.studentId}>
                                <TableCell className="pl-6">
                                  <p className="font-medium text-sm">{r.studentName}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{r.studentId}</p>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${r.attendanceRate >= 80 ? "bg-green-500" : r.attendanceRate >= 70 ? "bg-yellow-500" : "bg-destructive"}`}
                                        style={{ width: `${r.attendanceRate}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-bold">{r.attendanceRate}%</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <TrendIcon trend={r.trend} />
                                    <span className="text-xs text-muted-foreground capitalize">{r.trend}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <RiskBadge level={r.riskLevel} />
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground pr-6 max-w-48">
                                  {r.insight}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* Live Roster */}
            <Card>
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base font-semibold">{t("professor.liveRoster")}</CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="text-green-400 font-medium">{presentCount} {t("professor.present").toLowerCase()}</span>
                    <span>·</span>
                    <span className={flaggedCount > 0 ? "text-destructive font-semibold" : ""}>{flaggedCount} flagged</span>
                    <span>·</span>
                    <span>{absentCount} {t("professor.absent").toLowerCase()}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* ── Manual check-in entry ── */}
                <div className="px-4 pt-4 pb-3 border-b border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Manual check-in — use when QR / barcode fails
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      placeholder="Student ID (e.g. 20220001)"
                      value={manualEntryId}
                      onChange={(e) => setManualEntryId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualEntry()}
                      className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={manualEntryName}
                      onChange={(e) => setManualEntryName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualEntry()}
                      className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={handleManualEntry}
                      disabled={!manualEntryId.trim() || manualEntryBusy || !sessionActive}
                      className="h-9 px-4 rounded-md bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {manualEntryBusy ? "Saving…" : "Mark Present"}
                    </button>
                  </div>
                </div>
                {students.length === 0 ? (
                  <div className="py-14 text-center text-muted-foreground text-sm">
                    <p className="font-medium">{t("professor.noStudentsYet")}</p>
                    <p className="text-xs mt-1">{t("professor.showQR")}</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile card list */}
                    <div className="sm:hidden divide-y divide-border">
                      {students.map((s) => (
                        <div key={s.id} className={`flex items-center justify-between px-4 py-3 gap-3 transition-colors ${justMarked === s.id ? "bg-primary/10" : ""}`}>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{s.name}</p>
                              <StatusBadge status={s.status} />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="font-mono">{s.studentNumber ?? s.id.slice(0, 8)}</span>
                              {s.checkIn && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.checkIn}</span>}
                              {s.geoVerified
                                ? <span className="flex items-center gap-1 text-green-400"><MapPin className="w-3 h-3" />GPS ✓</span>
                                : <span className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3 h-3" />No GPS</span>}
                            </div>
                            {s.fraudFlag && (
                              <p className="text-[10px] text-destructive flex items-center gap-0.5">
                                <ShieldAlert className="w-2.5 h-2.5" />{s.fraudFlag}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => markStudent(s.id, "present")}
                              className="p-2 rounded-lg bg-green-500/10 text-green-400 active:bg-green-500/20 transition-colors" title="Mark Present">
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button onClick={() => markStudent(s.id, "absent")}
                              className="p-2 rounded-lg bg-destructive/10 text-destructive active:bg-destructive/20 transition-colors" title="Mark Absent">
                              <UserX className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="pl-6">Student ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Check-In</TableHead>
                            <TableHead>GPS</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right pr-6">Override</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map((s) => (
                            <TableRow key={s.id} className={`transition-colors ${justMarked === s.id ? "bg-primary/10" : ""}`}>
                              <TableCell className="pl-6">
                                <p className="font-mono text-xs text-muted-foreground">{s.studentNumber ?? "—"}</p>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{s.name}</p>
                                  {s.fraudFlag && (
                                    <p className="text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                                      <ShieldAlert className="w-2.5 h-2.5" />{s.fraudFlag}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.checkIn ?? "—"}</TableCell>
                              <TableCell>
                                {s.geoVerified
                                  ? <span className="flex items-center gap-1 text-green-400 text-xs"><MapPin className="w-3 h-3" /> Verified</span>
                                  : <span className="flex items-center gap-1 text-yellow-400 text-xs"><AlertTriangle className="w-3 h-3" /> Unverified</span>}
                              </TableCell>
                              <TableCell><StatusBadge status={s.status} /></TableCell>
                              <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => markStudent(s.id, "present")}
                                    className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors" title="Mark Present">
                                    <UserCheck className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => markStudent(s.id, "absent")}
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Mark Absent">
                                    <UserX className="w-4 h-4" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
