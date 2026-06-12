import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  CheckCircle2, XCircle, KeyRound, ScanLine, Loader2,
  User, MapPin, ShieldCheck, ShieldX, Navigation,
  AlertTriangle, WifiOff, Plus, Search, BookOpen, Trash2, X,
  ShieldAlert, Eye, QrCode, Clock, Smartphone,
  ChevronDown, ChevronUp, List,
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import { validateSessionCode } from "@/lib/session-token";
import { QrScanner } from "@/components/qr-scanner";
import {
  type CourseRecord,
  getActiveSemester,
} from "@/lib/store";
import { useLang } from "@/context/lang-context";
import { detectGpsFraud, type FraudAlert } from "@/lib/ai-analytics";
import { FraudAlertBanner } from "@/components/ai-insight-card";
import {
  apiCheckIn, apiGetCourses,
  apiGetStudentCourses, apiAddStudentCourse, apiRemoveStudentCourse,
  apiGetStudentAttendance,
  type ApiUserCourse, type ApiAttendanceRecord,
} from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────────────── */

type Screen       = "my_courses" | "add_course" | "checkin" | "success" | "history";
type CheckInStatus =
  | "idle" | "geo_requesting" | "geo_denied" | "geo_out_range"
  | "verifying" | "success" | "failed" | "flagged_success";
type Method = "qr" | "code";

/* ── Constants ──────────────────────────────────────────────────────── */

function getStudentAuth(): { name: string; id: string } {
  try {
    const raw = localStorage.getItem("neu_auth");
    if (!raw) return { name: "Student", id: "" };
    const auth = JSON.parse(raw) as { id?: string; name?: string };
    return { name: auth.name ?? auth.id ?? "Student", id: auth.id ?? "" };
  } catch {
    return { name: "Student", id: "" };
  }
}
const LAST_CHECKIN_KEY = "neu_last_checkin";
const DEFAULT_RADIUS = 800; // metres — hard-reject geofence radius

/* ── NEU Campus geofence (real coordinates) ─────────────────────────── */
const NEU_LAT            = 35.228731;   // real NEU campus centre
const NEU_LNG            = 33.319781;
const NEU_CAMPUS_RADIUS  = 800;         // metres — covers full 98-hectare campus
const CLASSROOM_RADIUS   = 50;          // metres — per-building tighter check

const ROOM_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  /* Offsets are approximate (~100–200 m spread around campus centre) */
  B204:   { lat: NEU_LAT + 0.0008, lng: NEU_LNG + 0.0007, name: "Block B – Room 204" },
  A105:   { lat: NEU_LAT - 0.0003, lng: NEU_LNG - 0.0009, name: "Block A – Room 105" },
  C301:   { lat: NEU_LAT + 0.0012, lng: NEU_LNG + 0.0011, name: "Block C – Room 301" },
  D201:   { lat: NEU_LAT - 0.0006, lng: NEU_LNG + 0.0004, name: "Block D – Room 201" },
  A203:   { lat: NEU_LAT - 0.0002, lng: NEU_LNG - 0.0005, name: "Block A – Room 203" },
  /* Innovation / lab buildings */
  INOV:   { lat: NEU_LAT + 0.0015, lng: NEU_LNG - 0.0006, name: "Inovasyon Building"  },
  INOVASYON: { lat: NEU_LAT + 0.0015, lng: NEU_LNG - 0.0006, name: "Inovasyon Building" },
  NEU:    { lat: NEU_LAT,           lng: NEU_LNG,            name: "Near East University" },
};

/* ── Geo helper ─────────────────────────────────────────────────────── */

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}
function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface LastCheckin { ts: number; lat: number; lng: number; }
function loadLastCheckin(): LastCheckin | null {
  try { return JSON.parse(localStorage.getItem(LAST_CHECKIN_KEY) ?? "null"); } catch { return null; }
}
function saveLastCheckin(d: LastCheckin) {
  try { localStorage.setItem(LAST_CHECKIN_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

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

/* ── Page ───────────────────────────────────────────────────────────── */

export default function StudentDashboard() {
  const { t } = useLang();

  /* Student identity from auth — read once on mount */
  const [student, setStudent] = useState(() => getStudentAuth());
  useEffect(() => { setStudent(getStudentAuth()); }, []);

  const [screen,     setScreen]     = useState<Screen>("my_courses");
  const [myCourses,  setMyCourses]  = useState<CourseRecord[]>([]);
  const [selected,   setSelected]   = useState<CourseRecord | null>(null);
  const [method,     setMethod]     = useState<Method>("qr");
  const [status,     setStatus]     = useState<CheckInStatus>("idle");
  const [code,       setCode]       = useState(["", "", "", "", "", ""]);
  const [errMsg,     setErrMsg]     = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [geoInfo,    setGeoInfo]    = useState<{ distance: number; accuracy?: number } | null>(null);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  /* Add-course state */
  const [searchQuery,  setSearchQuery]  = useState("");
  const [dbCourses,    setDbCourses]    = useState<CourseRecord[]>([]);
  const [dbLoading,    setDbLoading]    = useState(false);
  const [searchResult, setSearchResult] = useState<CourseRecord[] | "not_found" | null>(null);
  const [manualMode,   setManualMode]   = useState(false);
  const [showBrowse,   setShowBrowse]   = useState(true);
  const [manualForm,   setManualForm]   = useState({
    id: "", name: "", instructor: "", room: "", days: "", startTime: "", endTime: "",
  });

  /* Attendance history */
  const [historyRecords,  setHistoryRecords]  = useState<ApiAttendanceRecord[]>([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fullCode  = code.join("");
  const isBlocked = status === "geo_requesting" || status === "verifying";

  /* ── Load student's saved courses from DB on mount ── */
  useEffect(() => {
    apiGetStudentCourses().then((r) => {
      if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
    });
  }, []);

  /* ── Load attendance history when history tab opens ── */
  useEffect(() => {
    if (screen !== "history" || !student.id) return;
    setHistoryLoading(true);
    apiGetStudentAttendance(student.id).then((r) => {
      if (r.data) setHistoryRecords(r.data.records);
      setHistoryLoading(false);
    });
  }, [screen, student.id]);

  /* ── Load DB courses when add_course opens ── */
  useEffect(() => {
    if (screen !== "add_course") return;
    setDbLoading(true);
    const activeSem = getActiveSemester();
    apiGetCourses(activeSem).then((r) => {
      if (r.data) {
        const mapped: CourseRecord[] = r.data.courses.map((c) => ({
          id: c.id, name: c.name, instructor: c.instructor,
          room: c.room, days: c.days, startTime: c.startTime,
          endTime: c.endTime, enrollment: c.enrollment,
          semester: c.semester, source: c.source as "imported" | "manual",
        }));
        setDbCourses(mapped);
      } else {
        setDbCourses([]);
      }
      setDbLoading(false);
    });
  }, [screen]);


  /* ── Filtered DB courses for browse/search ── */
  const filteredDbCourses = dbCourses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) ||
           (c.instructor ?? "").toLowerCase().includes(q);
  });

  /* ── Course actions ── */
  const handleSearchCode = () => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();
    const matches = dbCourses.filter((c) => {
      return (
        c.id.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.name.toLowerCase() === q
      );
    });
    if (matches.length > 0) { setSearchResult(matches); setManualMode(false); }
    else { setSearchResult("not_found"); setManualForm((f) => ({ ...f, id: searchQuery.trim().toUpperCase() })); }
  };

  const handleAddCourse = async (course: CourseRecord) => {
    await apiAddStudentCourse({
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
    const r = await apiGetStudentCourses();
    if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
    setScreen("my_courses");
    setSearchQuery(""); setSearchResult(null); setManualMode(false);
    setManualForm({ id: "", name: "", instructor: "", room: "", days: "", startTime: "", endTime: "" });
  };

  const handleRemoveCourse = async (id: string) => {
    await apiRemoveStudentCourse(id);
    const r = await apiGetStudentCourses();
    if (r.data) setMyCourses(r.data.courses.map(mapUserCourse));
  };

  /* ── Code digit input ── */
  const handleDigit = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...code]; next[i] = val.slice(-1); setCode(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };
  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length === 6) { setCode(digits.split("")); inputRefs.current[5]?.focus(); }
  };

  /* ── Check-in logic ── */
  const runCodeCheck = (pos: GeolocationPosition | null, detectedFraud: FraudAlert[], dist: number) => {
    setStatus("verifying");
    setTimeout(async () => {
      const valid = method === "qr" || validateSessionCode(selected!.id, fullCode);
      if (valid) {
        setRecordedAt(nowTime());
        const isFlagged = detectedFraud.length > 0;
        setStatus(isFlagged ? "flagged_success" : "success");
        setScreen("success");
        if (pos) saveLastCheckin({ ts: Date.now(), lat: pos.coords.latitude, lng: pos.coords.longitude });
        const sessionId = localStorage.getItem("neu_active_session_id") || `demo-${selected!.id}`;
        await apiCheckIn({
          sessionId, courseId: selected!.id,
          studentId: student.id, studentName: student.name,
          lat: pos?.coords.latitude, lng: pos?.coords.longitude,
          distanceM: dist, flagged: isFlagged,
          flagReason: isFlagged ? detectedFraud.map((a) => a.reason).join("; ") : undefined,
          method,
        });
      } else {
        setStatus("failed");
        setErrMsg("The code is incorrect or has expired.");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    }, 1200);
  };

  const doCheckIn = () => {
    if (!selected) return;
    setStatus("geo_requesting");
    setErrMsg("");
    setFraudAlerts([]);
    if (!navigator.geolocation) { runCodeCheck(null, [], 0); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;

        /* ── Tier 1: Campus-level boundary (800 m hard reject) ── */
        const campusDist = Math.round(haversineMeters(lat, lng, NEU_LAT, NEU_LNG));
        if (campusDist > NEU_CAMPUS_RADIUS) {
          setStatus("geo_out_range");
          setGeoInfo({ distance: campusDist, accuracy: Math.round(accuracy * 10) / 10 });
          setErrMsg(
            `You are not on campus. Your current location is ${campusDist}m from ` +
            `Near East University (maximum allowed: ${NEU_CAMPUS_RADIUS}m).`
          );
          return;
        }

        /* ── Tier 2: Per-classroom boundary (50 m, soft — location_warning) ── */
        const rawRoom = (selected.room ?? "").toUpperCase().replace(/\s/g, "");
        const roomKey = rawRoom.slice(0, 4);
        const room    = ROOM_COORDS[rawRoom] ?? ROOM_COORDS[roomKey] ?? ROOM_COORDS["NEU"];
        const dist    = room
          ? Math.round(haversineMeters(lat, lng, room.lat, room.lng)) : 0;
        const accuracyRounded = Math.round(accuracy * 10) / 10;
        setGeoInfo({ distance: dist, accuracy: accuracyRounded });

        const last  = loadLastCheckin();
        const fraud = detectGpsFraud({
          accuracy: accuracyRounded, distanceFromClass: dist, geoRadius: CLASSROOM_RADIUS,
          lat, lng,
          lastCheckInTs: last?.ts, lastCheckInLat: last?.lat, lastCheckInLng: last?.lng,
        });

        /* On campus but wrong building → still accept, attach location_warning */
        const allAlerts = [...fraud.alerts];
        if (room && dist > CLASSROOM_RADIUS) {
          allAlerts.push({
            type:      "outside_fence",
            message:   `${dist}m from ${room.name} (expected within ${CLASSROOM_RADIUS}m) — location warning recorded`,
            timestamp: Date.now(),
            severity:  "medium",
          });
        }
        if (allAlerts.length > 0) setFraudAlerts(allAlerts);
        runCodeCheck(pos, allAlerts, dist);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("geo_denied");
          setErrMsg(
            "Location access denied. " +
            "On iPhone: Settings → Safari → Location → Allow. " +
            "On Android: tap the lock icon in your browser and allow Location."
          );
        } else {
          /* POSITION_UNAVAILABLE or TIMEOUT — allow check-in without GPS */
          runCodeCheck(null, [], 0);
        }
      },
      /* iOS Safari needs up to 15 s; maximumAge:0 forces a fresh fix */
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true },
    );
  };

  /* ── QR camera scan handler (must be after doCheckIn) ── */
  const handleQrScan = useCallback((data: string) => {
    try {
      const payload = JSON.parse(data) as { v?: number; cid?: string; token?: string; sid?: string };
      if (payload.v === 1 && payload.sid) {
        localStorage.setItem("neu_active_session_id", payload.sid);
      }
    } catch {
      /* plain text / non-JSON — method=qr auto-passes validation */
    }
    doCheckIn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const resetCheckin = () => {
    setStatus("idle"); setCode(["", "", "", "", "", ""]);
    setErrMsg(""); setGeoInfo(null); setFraudAlerts([]);
  };
  const startOver = () => {
    setScreen("my_courses"); setSelected(null); resetCheckin();
  };

  /* ── RENDER ── */
  return (
    <Layout role="student">
      {/* Student identity bar */}
      <div className="flex items-center gap-2 sm:gap-3 bg-card border border-border rounded-xl px-3 sm:px-5 py-3">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{student.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{student.id || "—"}</p>
        </div>
        <div className="flex items-center gap-1 text-xs shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-medium text-primary whitespace-nowrap hidden xs:inline sm:inline">GPS Active</span>
        </div>
      </div>


      <AnimatePresence mode="wait">

        {/* ══ My Courses ══ */}
        {screen === "my_courses" && (
          <motion.div key="my_courses" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("student.selfAtt")}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("student.selfAttDesc")}</p>
              </div>
              <button
                onClick={() => setScreen("add_course")}
                className="shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> {t("common.addCourse")}
              </button>
            </div>

            {myCourses.length === 0 ? (
              <div className="py-16 text-center space-y-4 border border-dashed border-border rounded-2xl">
                <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="font-semibold text-sm">{t("student.noCoursesYet")}</p>
                  <p className="text-xs text-muted-foreground mt-1 px-8">{t("student.noCoursesHint")}</p>
                </div>
                <button
                  onClick={() => setScreen("add_course")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> {t("student.addFirstCourse")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {myCourses.map((course) => (
                  <div key={course.id} className="bg-card border border-border hover:border-primary/40 rounded-xl px-3 sm:px-4 py-3 sm:py-4 transition-all flex items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelected(course); setScreen("checkin"); resetCheckin(); }}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="font-bold text-sm text-primary font-mono whitespace-nowrap">{course.id}</p>
                        {course.source === "imported" && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">{t("common.fromTimetable")}</span>
                        )}
                        {course.semester && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded whitespace-nowrap">{course.semester}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate">{course.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {course.instructor && <span className="truncate max-w-[120px]">{course.instructor}</span>}
                        {course.room && <span className="flex items-center gap-1 whitespace-nowrap"><MapPin className="w-3 h-3 shrink-0" />{course.room}</span>}
                        {course.days && <span className="whitespace-nowrap">{course.days}</span>}
                        {course.startTime && course.endTime && <span className="whitespace-nowrap">{course.startTime}–{course.endTime}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setSelected(course); setScreen("checkin"); resetCheckin(); }}
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors whitespace-nowrap"
                      >
                        <QrCode className="w-3.5 h-3.5 shrink-0" /> Check In
                      </button>
                      <button
                        onClick={() => handleRemoveCourse(course.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ══ Add Course ══ */}
        {screen === "add_course" && (
          <motion.div key="add_course" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">{t("student.addCourseTitle")}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Active semester: <span className="text-primary font-semibold">{getActiveSemester()}</span>
                </p>
              </div>
              <button onClick={() => { setScreen("my_courses"); setSearchQuery(""); setSearchResult(null); setManualMode(false); }}
                className="shrink-0 p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by course code or name…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value.toUpperCase()); setSearchResult(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchCode()}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button onClick={handleSearchCode} disabled={!searchQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {t("common.search")}
              </button>
            </div>

            {/* Exact-match search result */}
            <AnimatePresence mode="wait">
              {Array.isArray(searchResult) && !manualMode && (
                <motion.div key="found" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <p className="font-semibold text-sm text-green-500">
                      {searchResult.length} session{searchResult.length !== 1 ? "s" : ""} found — click to add
                    </p>
                  </div>
                  <div className="space-y-2">
                    {searchResult.map((course) => (
                      <div key={course.id} className="bg-card border border-border rounded-xl p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-primary text-sm">{course.name}</span>
                              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0">{t("common.fromTimetable")}</span>
                            </div>
                            {course.instructor && <p className="text-xs text-muted-foreground">{course.instructor}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                              {course.room && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{course.room}</span>}
                              {course.days && <span>{course.days}</span>}
                              {course.startTime && course.endTime && <span>{course.startTime}–{course.endTime}</span>}
                            </div>
                          </div>
                          <button onClick={() => handleAddCourse(course)}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors">
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {searchResult === "not_found" && !manualMode && (
                <motion.div key="notfound" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                    <p className="font-semibold text-sm text-yellow-500">
                      Not found in database: "<span className="font-mono">{searchQuery}</span>"
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">You can add it manually below, or browse the full course list.</p>
                  <button onClick={() => setManualMode(true)}
                    className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> {t("student.addManual")}
                  </button>
                </motion.div>
              )}

              {manualMode && (
                <motion.div key="manual" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <p className="font-semibold text-sm">{t("student.manualForm")}</p>
                  {[
                    { key: "id",         label: t("field.courseCode"),  placeholder: "CS301"           },
                    { key: "name",       label: t("field.courseName"),  placeholder: "Data Structures" },
                    { key: "instructor", label: t("field.instructor"),  placeholder: "Dr. John Smith"  },
                    { key: "room",       label: t("field.room"),        placeholder: "B204"            },
                    { key: "days",       label: t("field.days"),        placeholder: "Mon, Wed"        },
                    { key: "startTime",  label: t("field.startTime"),   placeholder: "09:00"           },
                    { key: "endTime",    label: t("field.endTime"),     placeholder: "10:30"           },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                      <input type="text" placeholder={placeholder}
                        value={(manualForm as Record<string, string>)[key]}
                        onChange={(e) => setManualForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                  <button disabled={!manualForm.id.trim() || !manualForm.name.trim()}
                    onClick={() => handleAddCourse({ ...manualForm, source: "manual" })}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> {t("common.addCourse")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Browse all courses from DB ── */}
            <div className="border border-border rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowBrowse((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-semibold"
              >
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4 text-primary" />
                  Browse All Courses
                  {dbLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    : <span className="text-xs font-normal text-muted-foreground">({filteredDbCourses.length} available)</span>}
                </div>
                {showBrowse ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {showBrowse && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    {dbLoading ? (
                      <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading from database…
                      </div>
                    ) : filteredDbCourses.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No courses found. Try a different search term.
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto divide-y divide-border">
                        {filteredDbCourses.map((c) => {
                          const alreadyAdded = myCourses.some((mc) => mc.id === c.id);
                          return (
                            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-primary">{c.id}</span>
                                  {c.semester && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{c.semester}</span>}
                                </div>
                                <p className="text-sm font-medium truncate">{c.name}</p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground mt-0.5">
                                  {c.instructor && <span>{c.instructor}</span>}
                                  {c.room && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{c.room}</span>}
                                  {c.days && <span>{c.days}</span>}
                                  {c.startTime && c.endTime && <span>{c.startTime}–{c.endTime}</span>}
                                </div>
                              </div>
                              <button
                                disabled={alreadyAdded}
                                onClick={() => handleAddCourse(c)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  alreadyAdded
                                    ? "bg-green-500/10 text-green-500 cursor-default"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                }`}
                              >
                                {alreadyAdded ? <><CheckCircle2 className="w-3 h-3 inline mr-1" />Added</> : <><Plus className="w-3 h-3 inline mr-1" />Add</>}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ══ Check-In ══ */}
        {screen === "checkin" && selected && (
          <motion.div key="checkin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-sm mx-auto space-y-4">
            <button onClick={startOver} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← {t("student.selfAtt")}
            </button>

            <h1 className="text-xl sm:text-2xl font-bold">Check In</h1>

            {/* Session info */}
            <div className="rounded-xl overflow-hidden border border-border">
              {([
                ["Student",  student.id],
                ["Course",   `${selected.id} — ${selected.name}`],
                ["Date",     todayStr()],
                ["Period",   selected.startTime && selected.endTime ? `${selected.startTime} – ${selected.endTime}` : "—"],
                ["Room",     selected.room || "—"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex border-b border-border/50 last:border-0">
                  <div className="w-24 shrink-0 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-medium">{label}</div>
                  <div className="flex-1 px-4 py-2.5 text-xs font-semibold bg-card">{value}</div>
                </div>
              ))}
            </div>

            {/* GPS status */}
            <AnimatePresence mode="wait">
              {status === "geo_requesting" && (
                <motion.div key="req" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <div><p className="font-semibold">Verifying location…</p><p className="text-xs opacity-75">Running GPS validation + fraud checks</p></div>
                </motion.div>
              )}
              {status === "geo_denied" && (
                <motion.div key="denied" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-4">
                  <div className="flex items-start gap-3">
                    <WifiOff className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div><p className="font-semibold text-sm text-destructive">Location Denied</p><p className="text-xs text-destructive/80 mt-1">{errMsg}</p></div>
                  </div>
                  <button onClick={resetCheckin} className="mt-3 text-xs text-destructive underline">Try again</button>
                </motion.div>
              )}
              {status === "geo_out_range" && geoInfo && (
                <motion.div key="out" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldX className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-destructive">
                        {errMsg.includes("not on campus") ? "Not On Campus" : "Not in Classroom"}
                      </p>
                      <p className="text-xs text-destructive/80 mt-1">{errMsg}</p>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-destructive/70 mb-1">
                          <span>Distance</span>
                          <span className="font-bold">
                            {geoInfo.distance}m / {errMsg.includes("not on campus") ? NEU_CAMPUS_RADIUS : CLASSROOM_RADIUS}m
                          </span>
                        </div>
                        <div className="w-full h-2 bg-destructive/20 rounded-full overflow-hidden">
                          <div className="h-full bg-destructive rounded-full"
                            style={{ width: `${Math.min((geoInfo.distance / ((errMsg.includes("not on campus") ? NEU_CAMPUS_RADIUS : CLASSROOM_RADIUS) * 2)) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={resetCheckin} className="text-xs text-destructive underline">Try again</button>
                </motion.div>
              )}
              {(status === "idle" || status === "verifying" || status === "failed") && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-xl px-4 py-2.5">
                    <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                    GPS verified on check-in (within {DEFAULT_RADIUS}m) · Fraud detection enabled
                  </div>
                  {geoInfo && (
                    <div className="flex items-center gap-2 text-xs bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
                      <Eye className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      <span className="text-green-400 font-medium">GPS verified</span>
                      <span className="text-muted-foreground">· {geoInfo.distance}m from room</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Method selector + content */}
            {(status === "idle" || status === "verifying" || status === "failed") && (
              <>
                <div className="flex gap-1 bg-muted p-1 rounded-xl">
                  {([
                    { m: "qr"   as Method, icon: <ScanLine className="w-3.5 h-3.5" />, label: "Scan QR"    },
                    { m: "code" as Method, icon: <KeyRound className="w-3.5 h-3.5" />, label: "Enter Code" },
                  ]).map(({ m, icon, label }) => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${method === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                      {icon}{label}
                    </button>
                  ))}
                </div>

                {/* ── Scan QR (live camera) ── */}
                {method === "qr" && (
                  status === "verifying" ? (
                    <div className="flex items-center justify-center h-44 rounded-xl bg-muted/30 border border-border">
                      <Loader2 className="w-9 h-9 text-primary animate-spin" />
                    </div>
                  ) : (
                    <QrScanner active={method === "qr"} onScan={handleQrScan} />
                  )
                )}

                {/* ── Enter Code ── */}
                {method === "code" && (
                  <div>
                    <p className="text-xs text-muted-foreground text-center mb-3">Enter the 6-digit code from the instructor's screen</p>
                    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                      {code.map((digit, i) => (
                        <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
                          type="text" inputMode="numeric" maxLength={1} value={digit}
                          onChange={(e) => handleDigit(i, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(i, e)}
                          disabled={isBlocked}
                          className={`w-10 h-12 text-center text-xl font-bold font-mono rounded-lg border-2 bg-card outline-none transition-all
                            ${digit ? "border-primary text-primary" : "border-border"}
                            ${status === "failed" ? "border-destructive/50" : ""}
                            focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50`}
                        />
                      ))}
                    </div>
                    <AnimatePresence>
                      {status === "failed" && errMsg && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 mt-3 text-xs text-destructive">
                          <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errMsg}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <button onClick={doCheckIn}
                  disabled={isBlocked || (method === "code" && fullCode.length < 6)}
                  className="w-full py-3.5 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold text-base transition-all flex items-center justify-center gap-2">
                  {status === "verifying"
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying…</>
                    : <><ShieldCheck className="w-5 h-5" /> {t("common.checkIn")}</>}
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ══ Success ══ */}
        {screen === "success" && selected && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="max-w-sm mx-auto text-center space-y-5">
            <AnimatePresence>
              {fraudAlerts.length > 0 && (
                <FraudAlertBanner alerts={fraudAlerts} onDismiss={() => setFraudAlerts([])} />
              )}
            </AnimatePresence>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${fraudAlerts.length > 0 ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-green-500/10 border border-green-500/30"}`}>
              {fraudAlerts.length > 0
                ? <ShieldAlert className="w-10 h-10 text-yellow-500" />
                : <CheckCircle2 className="w-10 h-10 text-green-400" />}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">
                {fraudAlerts.length > 0 ? "Attendance Flagged" : t("student.attRecorded")}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {fraudAlerts.length > 0
                  ? "Recorded but flagged for review by your instructor."
                  : t("student.attRecordedDesc")}
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-border text-left">
              {([
                ["Student",  student.name],
                ["Course",   `${selected.id} — ${selected.name}`],
                ["Date",     todayStr()],
                ["Period",   selected.startTime && selected.endTime ? `${selected.startTime} – ${selected.endTime}` : recordedAt],
                ["Time",     recordedAt],
                ["Method",   method === "qr" ? "QR Scan" : "Manual Code"],
                ["Status",   fraudAlerts.length > 0 ? "Flagged ⚠" : "Verified ✓"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex border-b border-border/50 last:border-0">
                  <div className="w-24 shrink-0 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-medium">{label}</div>
                  <div className={`flex-1 px-4 py-2.5 text-xs font-semibold bg-card ${label === "Status" && fraudAlerts.length > 0 ? "text-yellow-500" : label === "Status" ? "text-green-400" : ""}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={startOver} className="flex-1 py-3 rounded-full border border-border hover:bg-muted text-sm font-medium transition-colors">{t("common.back")}</button>
              <button onClick={startOver} className="flex-1 py-3 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">Done</button>
            </div>
          </motion.div>
        )}

        {/* ══ Attendance History ══ */}
        {screen === "history" && (
          <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Attendance History</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Your check-in records across all sessions</p>
            </div>

            {historyLoading ? (
              <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Loading your records…</p>
              </div>
            ) : historyRecords.length === 0 ? (
              <div className="py-16 text-center space-y-3 border border-dashed border-border rounded-2xl">
                <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="font-semibold text-sm">No records yet</p>
                  <p className="text-xs text-muted-foreground mt-1 px-8">Your check-in history will appear here after your first session.</p>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-4 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Date</span>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Attended</span>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Type</span>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Recorded-At</span>
                </div>

                {/* Table rows */}
                {historyRecords.map((rec) => {
                  const attended = true; /* records = check-ins = attended */
                  const recDate  = rec.checkedInAt ? new Date(rec.checkedInAt) : null;
                  const dateStr  = recDate
                    ? `${String(recDate.getDate()).padStart(2, "0")}.${String(recDate.getMonth() + 1).padStart(2, "0")}.${String(recDate.getFullYear()).slice(2)}`
                    : "—";
                  const timeStr  = recDate
                    ? recDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
                    : "—";
                  const isQr = rec.method !== "manual";

                  return (
                    <div key={rec.id} className={`grid grid-cols-4 items-center px-4 py-3 border-b border-border/50 last:border-0 ${rec.flagged ? "bg-yellow-500/5" : "bg-green-500/5"}`}>
                      {/* Date + course */}
                      <div>
                        <p className="text-xs font-mono font-semibold leading-tight">{dateStr}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeStr}</p>
                        <p className="text-[10px] text-primary/70 font-mono mt-0.5">{rec.courseId}</p>
                      </div>

                      {/* Attended icon */}
                      <div className="flex justify-center">
                        {rec.flagged
                          ? <AlertTriangle className="w-5 h-5 text-yellow-400" />
                          : <CheckCircle2 className="w-5 h-5 text-green-400" />
                        }
                      </div>

                      {/* Method icon */}
                      <div className="flex justify-center">
                        {isQr
                          ? <Smartphone className="w-4 h-4 text-primary" title="QR / Code scan" />
                          : <User       className="w-4 h-4 text-muted-foreground" title="Manual by professor" />
                        }
                      </div>

                      {/* Recorded-At */}
                      <div className="text-right">
                        <p className="text-xs font-mono leading-tight">{dateStr}</p>
                        <p className="text-[10px] text-muted-foreground">{timeStr}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </Layout>
  );
}
