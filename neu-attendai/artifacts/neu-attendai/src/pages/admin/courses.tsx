import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, MapPin, Upload, FileSpreadsheet,
  X, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Trash2,
  Database, CalendarDays, Settings2, RefreshCw, OctagonX,
} from "lucide-react";
// xlsx is loaded dynamically inside parseExcelFile to avoid Vite polyfill issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XLSXModule = any;
import {
  type CourseRecord,
  getImportedCourses,
  saveImportedCourses,
  getActiveSemester,
  setActiveSemester,
} from "@/lib/store";
import {
  apiImportCourses,
  apiDeleteCourse,
  apiDeleteAllCourses,
  apiGetActiveSemester,
  apiSetActiveSemester,
  apiGetCourses,
  apiGetSemesters,
} from "@/lib/api";
import { useLang } from "@/context/lang-context";

type ImportStatus = "idle" | "preview" | "success" | "error";

/* ── Semester helpers ────────────────────────────────────────────── */

function defaultSemester(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 2 && m <= 7 ? `Spring${y}` : `Fall${y}`;
}

function semesterOptions(): string[] {
  const y = new Date().getFullYear();
  return [
    `Spring${y - 1}`, `Fall${y - 1}`,
    `Spring${y}`,     `Fall${y}`,
    `Spring${y + 1}`, `Fall${y + 1}`,
  ];
}

/* ── Column auto-detection ───────────────────────────────────────── */

const COLUMN_ALIASES: Record<string, string[]> = {
  id: [
    "id", "course id", "course_id", "code", "course code", "course no", "coursecode",
    "crn", "subject code", "dept code", "class code", "catalog", "catalog no", "course number",
    "ders kodu", "ders no", "ders kod", "kod", "dersler", "ders",
    "كود", "كود المادة", "رمز المادة", "رقم المادة",
  ],
  name: [
    "name", "course name", "course_name", "subject", "title", "coursename",
    "course title", "subject name", "class name", "class title", "description",
    "ders adı", "ders adi", "ders ismi", "ders adi", "ders açıklaması",
    "اسم المادة", "المادة", "اسم المقرر", "المقرر", "اسم الدرس", "الدرس",
  ],
  instructor: [
    "instructor", "teacher", "professor", "dr", "lecturer", "academic",
    "faculty", "staff", "taught by", "given by", "instructor name",
    "öğretmen", "ogretmen", "hoca", "prof", "öğretim görevlisi", "öğretim üyesi",
    "المدرس", "الاستاذ", "الأستاذ", "اسم الأستاذ", "اسم الدكتور", "الدكتور", "مدرس",
  ],
  room: [
    "room", "location", "hall", "classroom", "venue", "place",
    "room no", "room number", "class room", "building", "lab",
    "salon", "salonu", "salonlar", "ders salonu", "derslik salonu",
    "oda", "derslik", "sınıf", "sinif", "mekan", "mekân",
    "القاعة", "الغرفة", "الفصل", "رقم القاعة", "موقع", "المبنى",
  ],
  days: [
    "day", "days", "lecture day", "lecture days", "schedule", "meeting days",
    "meets", "class days", "week day", "weekday",
    "gün", "gun", "günler", "gunler", "ders günü",
    "اليوم", "الأيام", "ايام", "أيام الدراسة", "يوم المحاضرة",
  ],
  startTime: [
    "start", "start time", "from", "begin", "starttime", "starts", "time start",
    "lecture start", "class start", "opens",
    "başlangıç", "baslangic", "başlangıç saati", "başlar",
    "وقت البدء", "البداية", "يبدأ", "وقت البداية",
  ],
  endTime: [
    "end", "end time", "to", "finish", "endtime", "ends", "time end",
    "lecture end", "class end", "closes",
    "bitiş", "bitis", "bitiş saati", "biter",
    "وقت الانتهاء", "النهاية", "ينتهي", "وقت النهاية",
  ],
  enrollment: [
    "enrollment", "students", "count", "capacity", "enrolled", "size",
    "class size", "no of students", "number of students",
    "kayıt", "kayit", "öğrenci sayısı", "ogrenci sayisi",
    "عدد الطلاب", "التسجيل", "الطلاب", "سعة",
  ],
};

function detectColumn(headers: string[], field: string): number {
  const aliases = COLUMN_ALIASES[field] ?? [];
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === alias);
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Returns true when a cell value looks like a NEU-style course code
 * (e.g. "AII202", "BLG106 AILHAN", "HKK204+KMH202 MERDAL") rather than
 * an actual schedule day string ("Mon", "Mon,Wed", "MWF", …).
 */
function looksLikePairedCourseCode(s: string): boolean {
  return /^[A-Za-z]{2,7}\d{3}/i.test(s.trim());
}

function wsToRows(XLSX: XLSXModule, ws: unknown): string[][] {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  return raw.map((r) =>
    (r as unknown[]).map((c) => (c === null || c === undefined ? "" : String(c).trim()))
  );
}

/* Score a row by how many cells match known column keywords */
function scoreHeaderRow(row: string[]): number {
  const allAliases = Object.values(COLUMN_ALIASES).flat();
  let score = 0;
  for (const cell of row) {
    const lower = cell.toLowerCase().trim();
    if (!lower) continue;
    if (allAliases.some((a) => lower === a || lower.includes(a) || a.includes(lower))) score++;
  }
  return score;
}

function findHeaderRow(rows: string[][]): number {
  let bestIdx   = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const nonEmpty = rows[i].filter((c) => c !== "").length;
    if (nonEmpty < 2) continue;
    const score = scoreHeaderRow(rows[i]);
    /* Prefer rows with keyword matches; break ties by taking the earliest */
    if (score > bestScore) { bestScore = score; bestIdx = i; }
    /* If we found a strong match (≥3 known keywords) stop searching */
    if (score >= 3) break;
  }
  return bestIdx;
}

/* ── NEU Room-Based Timetable Parser ─────────────────────────────
   The NEU Excel format is a room timetable, NOT a course list:
     Row N  : col0="SALON", col1="KAPASİTE", col4-74 = day names (repeated per slot)
     Row N+1: col4-74 = time slots  "8:30-09:30", "09:30-10:30", ...
     Row N+2+: each row = one room; cells = "CODE[+CODE2] INSTRUCTOR" or "X"
   We extract one CourseRecord per unique (code, room, day, startTime) session.
   IDs are generated as "CODE-DAY-HHMM" so each session has a unique PK.
   ──────────────────────────────────────────────────────────────── */

const NEU_DAY_MAP: Record<string, string> = {
  "PAZARTESİ": "Monday",    "PAZARTESI": "Monday",
  "SALI": "Tuesday",        "SALI ": "Tuesday",
  "ÇARŞAMBA": "Wednesday",  "CARSAMBA": "Wednesday",
  "PERŞEMBE": "Thursday",   "PERSEMBE": "Thursday",
  "CUMA": "Friday",
  "CUMARTESİ": "Saturday",  "CUMARTESI": "Saturday",
  "PAZAR": "Sunday",
};

const DAY_ABBR: Record<string, string> = {
  Monday: "MON", Tuesday: "TUE", Wednesday: "WED",
  Thursday: "THU", Friday: "FRI", Saturday: "SAT", Sunday: "SUN",
};

function detectNeuTimetable(rows: string[][]): { headerRow: number; timeRow: number } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const col0 = (rows[i][0] ?? "").trim().toUpperCase();
    if (col0 === "SALON" || col0.startsWith("SALON")) {
      const nextIdx = i + 1;
      if (nextIdx < rows.length) {
        const hasTime = rows[nextIdx].some((c) => /\d+:\d+-\d+:\d+/.test(c));
        if (hasTime) return { headerRow: i, timeRow: nextIdx };
      }
    }
  }
  return null;
}

function extractNeuTimetableCourses(
  rows: string[][],
  sheetLabel: string,
): { courses: CourseRecord[]; warnings: string[]; sheetInfo: string } {
  const detected = detectNeuTimetable(rows);
  if (!detected) throw new Error("Not NEU timetable format — SALON header not found");

  const { headerRow, timeRow } = detected;
  const headerCells = rows[headerRow];
  const timeCells   = rows[timeRow];

  /* Build col-index → {day, start, end} for every time-slot column (col 4 onward) */
  type ColMeta = { day: string; start: string; end: string };
  const colInfo = new Map<number, ColMeta>();

  for (let c = 4; c < headerCells.length; c++) {
    const dayRaw  = (headerCells[c] ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    const timeRaw = (timeCells[c]   ?? "").trim();
    if (!timeRaw || !timeRaw.includes("-")) continue;
    let day: string | null = null;
    for (const [key, val] of Object.entries(NEU_DAY_MAP)) {
      if (dayRaw.includes(key)) { day = val; break; }
    }
    if (!day) continue;
    const dashIdx = timeRaw.indexOf("-");
    const start = timeRaw.slice(0, dashIdx).trim();
    const end   = timeRaw.slice(dashIdx + 1).trim();
    if (start && end) colInfo.set(c, { day, start, end });
  }

  /* Scan every room row → collect slots per (code, room, day) */
  type Slot = { col: number; start: string; end: string; instructor: string };
  const groups = new Map<string, Slot[]>(); // key = "CODE|||room|||day"

  for (let r = timeRow + 1; r < rows.length; r++) {
    const row  = rows[r];
    const room = (row[0] ?? "").trim();
    if (!room) continue;

    for (const [c, meta] of colInfo.entries()) {
      const cellVal = (row[c] ?? "").trim();
      if (!cellVal || cellVal.toUpperCase() === "X") continue;

      /* "CODE[+CODE2+...] INSTRUCTOR" — first whitespace separates codes from instructor */
      const spaceIdx  = cellVal.search(/\s/);
      const codesPart = spaceIdx >= 0 ? cellVal.slice(0, spaceIdx) : cellVal;
      const instrPart = spaceIdx >= 0 ? cellVal.slice(spaceIdx + 1).trim() : "";

      for (const rawCode of codesPart.split("+")) {
        const code = rawCode.trim().toUpperCase();
        /* Must look like a real course code: 2-8 letters then 3+ digits */
        if (!code || !/^[A-Z]{2,8}\d{3}/.test(code)) continue;
        const key = `${code}|||${room}|||${meta.day}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ col: c, start: meta.start, end: meta.end, instructor: instrPart });
      }
    }
  }

  /* Merge consecutive columns into single sessions, then emit CourseRecords */
  const seenUids = new Set<string>();
  const courses: CourseRecord[] = [];

  for (const [key, slots] of groups.entries()) {
    const [code, room, day] = key.split("|||");
    slots.sort((a, b) => a.col - b.col);

    /* Split into consecutive runs */
    const runs: Slot[][] = [];
    let cur: Slot[] = [slots[0]];
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].col === slots[i - 1].col + 1) {
        cur.push(slots[i]);
      } else {
        runs.push(cur); cur = [slots[i]];
      }
    }
    runs.push(cur);

    for (const run of runs) {
      const startTime  = run[0].start;
      const endTime    = run[run.length - 1].end;
      const instructor = run[0].instructor || "—";
      /* Unique session ID: e.g. "AII202-MON-1330" */
      const startTag = startTime.replace(":", "").padStart(4, "0");
      const uid      = `${code}-${DAY_ABBR[day] ?? day.slice(0, 3).toUpperCase()}-${startTag}`;
      if (!seenUids.has(uid)) {
        seenUids.add(uid);
        courses.push({
          id:         uid,
          name:       code,   /* searchable by course code */
          instructor,
          room,
          days:       day,
          startTime,
          endTime,
          source:     "imported",
        });
      }
    }
  }

  if (courses.length === 0) throw new Error(`Sheet "${sheetLabel}": NEU timetable detected but no course sessions extracted`);

  const warnings = [
    `NEU room-timetable format · ${colInfo.size} time-slot columns · ${courses.length} sessions extracted`,
    `IDs are "CODE-DAY-HHMM" (e.g. AII202-MON-1330). Search by course code works normally.`,
  ];
  return { courses, warnings, sheetInfo: `Sheet: "${sheetLabel}" · ${courses.length} course sessions` };
}

/* ── Generic column-list parser (fallback for non-NEU formats) ── */
function extractColumnListCourses(rows: string[][], sheetLabel: string): { courses: CourseRecord[]; warnings: string[]; sheetInfo: string } {
  const headerIdx = findHeaderRow(rows);
  const dataRows  = rows.slice(headerIdx);
  if (dataRows.length < 2) throw new Error(`Sheet "${sheetLabel}": header found but no data rows below it`);

  const headers       = dataRows[0];
  const colId         = detectColumn(headers, "id");
  const colName       = detectColumn(headers, "name");
  const colInstructor = detectColumn(headers, "instructor");
  const colRoom       = detectColumn(headers, "room");
  const colDays       = detectColumn(headers, "days");
  const colStart      = detectColumn(headers, "startTime");
  const colEnd        = detectColumn(headers, "endTime");
  const colEnrollment = detectColumn(headers, "enrollment");

  const warnings: string[] = [];
  if (colId === -1)         warnings.push("'Course Code' column not detected — IDs auto-generated");
  if (colName === -1)       warnings.push("'Course Name' column not detected — using first non-empty column");
  if (colRoom === -1)       warnings.push("'Room' column not detected");
  if (colInstructor === -1) warnings.push("'Instructor' column not detected");

  const nameCol = colName !== -1 ? colName : headers.findIndex((h) => h !== "");
  const seenIds = new Set<string>();
  const courses: CourseRecord[] = [];

  for (let i = 1; i < dataRows.length; i++) {
    const row     = dataRows[i];
    const rawName = nameCol >= 0 ? (row[nameCol] ?? "").trim() : "";
    if (!rawName) continue;
    const rawId = colId !== -1 ? (row[colId] ?? "").trim() : "";
    const id    = rawId || `COURSE-${String(courses.length + 1).padStart(3, "0")}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    courses.push({
      id,
      name:       rawName,
      instructor: colInstructor >= 0 ? (row[colInstructor] ?? "").trim() || "—" : "—",
      room:       colRoom       >= 0 ? (row[colRoom]       ?? "").trim() || "—" : "—",
      days:       colDays       >= 0 ? (row[colDays]       ?? "").trim() || ""  : "",
      startTime:  colStart      >= 0 ? (row[colStart]      ?? "").trim() || ""  : "",
      endTime:    colEnd        >= 0 ? (row[colEnd]         ?? "").trim() || ""  : "",
      enrollment: colEnrollment >= 0 ? parseInt(row[colEnrollment] ?? "0") || 0  : 0,
      source:     "imported",
    });
  }

  if (courses.length === 0) {
    const sample = headers.filter(Boolean).slice(0, 6).join(", ");
    throw new Error(
      `Sheet "${sheetLabel}" (columns: ${sample || "none"}) — no course rows found. ` +
      `Download the template, fill in your data, then import it.`
    );
  }
  return { courses, warnings, sheetInfo: `Sheet: "${sheetLabel}" · Header row ${headerIdx + 1} · ${courses.length} courses` };
}

async function parseExcelFile(file: File): Promise<{ courses: CourseRecord[]; warnings: string[]; sheetInfo: string }> {
  const XLSX: XLSXModule = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wb: any;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch (e) {
    throw new Error(`Cannot read this file as Excel. Try saving it as .xlsx in Excel first. (${e instanceof Error ? e.message : e})`);
  }
  if (!wb.SheetNames || !wb.SheetNames.length) throw new Error("Workbook has no sheets");

  const errors: string[] = [];
  for (const sheetName of wb.SheetNames as string[]) {
    const rows     = wsToRows(XLSX, wb.Sheets[sheetName]);
    const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
    if (nonEmpty.length < 2) { errors.push(`"${sheetName}": only ${nonEmpty.length} non-empty row(s)`); continue; }

    /* Try NEU room-timetable format first */
    if (detectNeuTimetable(nonEmpty)) {
      try { return extractNeuTimetableCourses(nonEmpty, sheetName); }
      catch (err) { errors.push(`"${sheetName}" (NEU): ${err instanceof Error ? err.message : err}`); }
    }

    /* Fall back to generic column-list format */
    try { return extractColumnListCourses(nonEmpty, sheetName); }
    catch (err) { errors.push(`"${sheetName}" (list): ${err instanceof Error ? err.message : err}`); }
  }
  throw new Error(`Could not import from any sheet. ${errors.join(" | ")}`);
}

async function parseCsvFile(file: File): Promise<{ courses: CourseRecord[]; warnings: string[]; sheetInfo: string }> {
  const text  = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV file has fewer than 2 rows — nothing to import");
  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  const rows       = lines.map(parseRow);
  const headerIdx  = findHeaderRow(rows);
  const dataRows   = rows.slice(headerIdx);
  if (dataRows.length < 2) throw new Error("No data rows found after header");
  const headers       = dataRows[0];
  const colId         = detectColumn(headers, "id");
  const colName       = detectColumn(headers, "name");
  const colInstructor = detectColumn(headers, "instructor");
  const colRoom       = detectColumn(headers, "room");
  const colDays       = detectColumn(headers, "days");
  const colStart      = detectColumn(headers, "startTime");
  const colEnd        = detectColumn(headers, "endTime");
  const colEnrollment = detectColumn(headers, "enrollment");
  const warnings: string[] = [];
  if (colId === -1)   warnings.push("'Course Code' column not detected — IDs will be auto-generated");
  if (colName === -1) warnings.push("'Course Name' column not detected — using first column");
  const nameColFallback = colName !== -1 ? colName : 0;
  const courses: CourseRecord[] = [];
  for (let i = 1; i < dataRows.length; i++) {
    const row     = dataRows[i];
    const rawName = (row[nameColFallback] ?? "").trim();
    if (!rawName) continue;
    const rawId = colId !== -1 ? (row[colId] ?? "").trim() : "";
    courses.push({
      id:         rawId || `COURSE-${String(courses.length + 1).padStart(3, "0")}`,
      name:       rawName,
      instructor: colInstructor !== -1 ? (row[colInstructor] ?? "").trim() || "—" : "—",
      room:       colRoom       !== -1 ? (row[colRoom]       ?? "").trim() || "—" : "—",
      days:       colDays       !== -1 ? (row[colDays]       ?? "").trim() || ""  : "",
      startTime:  colStart      !== -1 ? (row[colStart]      ?? "").trim() || ""  : "",
      endTime:    colEnd        !== -1 ? (row[colEnd]        ?? "").trim() || ""  : "",
      enrollment: colEnrollment !== -1 ? parseInt(row[colEnrollment] ?? "0") || 0 : 0,
      source:     "imported",
    });
  }
  if (courses.length === 0) throw new Error("No valid course rows found in CSV");
  return { courses, warnings, sheetInfo: `CSV file · ${courses.length} rows parsed` };
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function CourseManagement() {
  const { t } = useLang();
  /* Start empty — API hydrates on mount so the count never flashes twice */
  const [courses, setCourses]                 = useState<CourseRecord[]>([]);
  const [search, setSearch]                   = useState("");
  const [clearConfirm, setClearConfirm]       = useState(false);
  const [clearing, setClearing]               = useState(false);
  const [importStatus, setImportStatus]       = useState<ImportStatus>("idle");
  const [importedCourses, setImportedCourses] = useState<CourseRecord[]>([]);
  const [warnings, setWarnings]               = useState<string[]>([]);
  const [errorMsg, setErrorMsg]               = useState("");
  const [fileName, setFileName]               = useState("");
  const [sheetInfo, setSheetInfo]             = useState("");
  const [showPreview, setShowPreview]         = useState(true);
  const [isDragging, setIsDragging]           = useState(false);

  // Semester state
  const [activeSemester, setActiveSemesterState] = useState<string>(() => getActiveSemester());
  const [importSemester, setImportSemester]       = useState<string>(() => defaultSemester());
  const [availSemesters, setAvailSemesters]       = useState<string[]>([]);
  const [filterSemester, setFilterSemester]       = useState<string>("all");
  const [editingSemester, setEditingSemester]     = useState(false);
  const [newSemesterInput, setNewSemesterInput]   = useState("");
  const [semSaving, setSemSaving]                 = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Load active semester + available semesters from API */
  useEffect(() => {
    apiGetActiveSemester().then((r) => {
      if (r.data) {
        setActiveSemesterState(r.data.semester);
        setActiveSemester(r.data.semester);
      }
    });
    apiGetSemesters().then((r) => {
      if (r.data) setAvailSemesters(r.data.semesters);
    });
    /* Also hydrate courses from DB on mount */
    apiGetCourses().then((r) => {
      if (r.data && r.data.courses.length > 0) {
        const mapped: CourseRecord[] = r.data.courses.map((c) => ({
          id: c.id, name: c.name, instructor: c.instructor,
          room: c.room, days: c.days, startTime: c.startTime,
          endTime: c.endTime, enrollment: c.enrollment,
          semester: c.semester, source: c.source as "imported" | "manual",
        }));
        setCourses(mapped);
        saveImportedCourses(mapped);
      }
    });
  }, []);

  const filtered = courses.filter((c) => {
    const semMatch = filterSemester === "all" || (c.semester ?? "") === filterSemester;
    const textMatch = [c.name, c.id, c.instructor ?? "", c.room ?? ""].some((f) =>
      f.toLowerCase().includes(search.toLowerCase())
    );
    return semMatch && textMatch;
  });

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "csv") {
      setErrorMsg("Only .xlsx or .csv files are accepted");
      setImportStatus("error");
      return;
    }
    setFileName(file.name);
    setImportStatus("idle");
    setErrorMsg("");
    try {
      let result: { courses: CourseRecord[]; warnings: string[]; sheetInfo: string };
      result = ext === "csv" ? await parseCsvFile(file) : await parseExcelFile(file);
      setImportedCourses(result.courses);
      setWarnings(result.warnings);
      setSheetInfo(result.sheetInfo);
      setImportStatus("preview");
      setShowPreview(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setImportStatus("error");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const confirmImport = async () => {
    const tagged = importedCourses.map((c) => ({ ...c, semester: importSemester }));
    setCourses((prev) => {
        /* Deduplicate by ID only — matches DB schema (id is sole PK) */
      const existingIds = new Set(prev.map((c) => c.id));
      const newOnes  = tagged.filter((c) => !existingIds.has(c.id));
      const updated  = prev.map((c) => {
        const match = tagged.find((ic) => ic.id === c.id);
        return match ? { ...c, ...match } : c;
      });
      const merged = [...updated, ...newOnes];
      saveImportedCourses(merged);
      return merged;
    });

    const result = await apiImportCourses(
      tagged.map((c) => ({
        id: c.id, name: c.name, instructor: c.instructor ?? "",
        room: c.room ?? "", days: c.days ?? "",
        startTime: c.startTime ?? "", endTime: c.endTime ?? "",
        source: c.source as "imported" | "manual",
        semester: importSemester,
        enrollment: c.enrollment ?? 0,
      })),
      importSemester
    );
    if (result.data) {
      setImportStatus("success");
      setImportedCourses([]);
      apiGetSemesters().then((s) => {
        if (s.data) setAvailSemesters(s.data.semesters);
      });
    } else {
      setErrorMsg(result.error || "Failed to save to database");
      setImportStatus("error");
    }
    setWarnings([]);
  };

  const cancelImport = () => {
    setImportStatus("idle");
    setImportedCourses([]);
    setWarnings([]);
    setFileName("");
    setSheetInfo("");
  };

  const saveActiveSemester = async (sem: string) => {
    setSemSaving(true);
    setActiveSemesterState(sem);
    setActiveSemester(sem);
    await apiSetActiveSemester(sem);
    setSemSaving(false);
    setEditingSemester(false);
  };

  const clearAllCourses = async () => {
    setClearing(true);
    try {
      await apiDeleteAllCourses();
      setCourses([]);
      saveImportedCourses([]);
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  const removeCourse = (id: string) => {
    apiDeleteCourse(id);
    setCourses((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveImportedCourses(updated);
      return updated;
    });
  };

  const duplicateCount = importedCourses.filter((ic) =>
    courses.some((c) => c.id === ic.id && (c.semester ?? "") === importSemester)
  ).length;

  const scheduleStr = (c: CourseRecord) =>
    [c.days, c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : ""]
      .filter(Boolean).join(" · ") || "—";

  const allSemestersInData = Array.from(new Set(courses.map((c) => c.semester ?? "").filter(Boolean)));

  return (
    <Layout role="admin">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("admin.courseTitle")}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">{t("admin.courseDesc")}</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("admin.searchPlaceholder")}
              className="pl-8 bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {courses.length > 0 && (
            clearConfirm ? (
              <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-1.5">
                <span className="text-destructive text-xs font-medium">Delete all {courses.length} courses?</span>
                <button
                  onClick={clearAllCourses}
                  disabled={clearing}
                  className="text-xs font-bold text-destructive hover:text-destructive/80 underline disabled:opacity-50"
                >
                  {clearing ? "Deleting…" : "Yes, clear all"}
                </button>
                <button onClick={() => setClearConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground ml-1">
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setClearConfirm(true)}
              >
                <OctagonX className="w-4 h-4" /> Clear All
              </Button>
            )
          )}
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet className="w-4 h-4" /> {t("admin.importExcel")}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileInput} />
        </div>
      </div>

      {/* ── Active Semester Banner ── */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/15 border border-primary/25">
              <CalendarDays className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Semester</p>
              <p className="font-bold text-primary text-sm">{activeSemester}</p>
            </div>
          </div>
          {!editingSemester ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => { setEditingSemester(true); setNewSemesterInput(activeSemester); }}>
              <Settings2 className="w-3.5 h-3.5" /> Change Active Semester
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={newSemesterInput}
                onChange={(e) => setNewSemesterInput(e.target.value)}
                className="rounded-lg border border-border bg-card text-sm px-3 py-1.5 text-foreground outline-none focus:border-primary"
              >
                {semesterOptions().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {availSemesters.filter((s) => !semesterOptions().includes(s)).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button size="sm" className="gap-1 text-xs h-8"
                disabled={semSaving} onClick={() => saveActiveSemester(newSemesterInput)}>
                {semSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2"
                onClick={() => setEditingSemester(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 rounded-xl px-5 py-4 text-sm text-primary">
        <Database className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">{t("admin.howTitle")}</p>
          <ol className="text-primary/80 text-xs space-y-0.5 list-decimal list-inside leading-relaxed">
            <li>Set the active semester above (e.g. Spring2026)</li>
            <li>Upload each term's Excel/CSV file and select its semester</li>
            <li>Old terms are automatically archived — not deleted</li>
            <li>Students & professors always see the active semester's courses</li>
          </ol>
        </div>
      </div>

      {/* Drop Zone */}
      {importStatus === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
            isDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-primary/5"
          }`}
        >
          <Upload className={`w-10 h-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <div className="text-center">
            <p className="font-medium text-sm">Drop an Excel or CSV file here, or click to choose</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .xlsx and .csv — columns: Course Code · Name · Room · Instructor · Day · Time</p>
          </div>
        </div>
      )}

      {/* Error */}
      {importStatus === "error" && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-destructive text-sm">{t("admin.importFailed")}</p>
              <p className="text-sm text-destructive/80 mt-0.5">{errorMsg}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={cancelImport}><X className="w-4 h-4" /></Button>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {importStatus === "success" && (
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-green-500 text-sm">{t("admin.importSuccess")}</p>
              <p className="text-sm text-green-500/80">
                <span className="font-mono">{fileName}</span> → <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">{importSemester}</Badge>{" "}
                — {courses.filter((c) => (c.semester ?? "") === importSemester).length} courses saved to database.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setImportStatus("idle")}><X className="w-4 h-4" /></Button>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {importStatus === "preview" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle className="text-sm font-semibold text-primary">
                    Preview — {fileName}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {importedCourses.length} courses ·{" "}
                    {duplicateCount > 0 ? `${duplicateCount} updates` : "all new"}
                    {sheetInfo && <span className="ml-2 opacity-60">({sheetInfo})</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Semester picker for this import batch */}
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  <select
                    value={importSemester}
                    onChange={(e) => setImportSemester(e.target.value)}
                    className="rounded-lg border border-border bg-card text-xs px-2 py-1.5 text-foreground outline-none focus:border-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {semesterOptions().map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview((p) => !p)} className="gap-1 text-xs">
                  {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showPreview ? "Hide" : "Show"}
                </Button>
                <Button variant="outline" size="sm" onClick={cancelImport}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={confirmImport} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Save to DB ({importedCourses.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          {warnings.length > 0 && (
            <div className="px-4 pt-3 space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-yellow-500">
                  <AlertCircle className="w-3 h-3 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
          {showPreview && (
            <CardContent className="p-0 mt-3">
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/30 sticky top-0">
                    <TableRow>
                      <TableHead className="pl-6 text-xs">Code</TableHead>
                      <TableHead className="text-xs">Course Name</TableHead>
                      <TableHead className="text-xs">Instructor</TableHead>
                      <TableHead className="text-xs">Room</TableHead>
                      <TableHead className="text-xs">Schedule</TableHead>
                      <TableHead className="text-xs text-center pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importedCourses.map((course, i) => {
                      const isDuplicate = courses.some((c) => c.id === course.id && (c.semester ?? "") === importSemester);
                      return (
                        <TableRow key={i} className={isDuplicate ? "bg-yellow-500/5" : ""}>
                          <TableCell className="pl-6 font-mono text-xs text-primary">{course.id}</TableCell>
                          <TableCell className="text-sm font-medium">{course.name}</TableCell>
                          <TableCell className="text-sm">{course.instructor}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              {course.room}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{scheduleStr(course)}</TableCell>
                          <TableCell className="text-center pr-4">
                            {isDuplicate
                              ? <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/10 text-xs">Update</Badge>
                              : <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10 text-xs">New</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Main table */}
      <Card>
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">
            {t("admin.coursesInTable")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({courses.length} total in database)
            </span>
          </CardTitle>
          {/* Semester filter tabs */}
          {allSemestersInData.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterSemester("all")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterSemester === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >All</button>
              {allSemestersInData.map((s) => (
                <button key={s}
                  onClick={() => setFilterSemester(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    filterSemester === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                  {s === activeSemester && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="Active" />
                  )}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!search || filtered.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              {courses.length === 0 ? (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground text-sm">{t("admin.noCoursesYet")}</p>
                  <p className="text-xs text-muted-foreground/60">{t("admin.importExplain")}</p>
                </>
              ) : !search ? (
                <>
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground text-sm">Use the search bar above to find courses</p>
                  <p className="text-xs text-muted-foreground/60">{courses.length} courses available — search by code, name, instructor, or room</p>
                </>
              ) : (
                <>
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground text-sm">No courses match "{search}"</p>
                  <p className="text-xs text-muted-foreground/60">Try a different search term</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-border">
                {filtered.map((course) => (
                  <div key={`${course.id}-${course.semester}`} className="flex items-start justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary text-sm">{course.id}</span>
                        {course.semester && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${course.semester === activeSemester ? "text-green-500 border-green-500/30" : "text-muted-foreground"}`}>
                            {course.semester}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{course.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {course.instructor && course.instructor !== "—" && <span>{course.instructor}</span>}
                        {course.room && course.room !== "—" && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{course.room}</span>
                        )}
                        {scheduleStr(course) !== "—" && <span>{scheduleStr(course)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => removeCourse(course.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-6">Course Code</TableHead>
                      <TableHead>Course Name</TableHead>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead className="text-right">Enrollment</TableHead>
                      <TableHead className="text-right pr-6">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((course) => (
                      <TableRow key={`${course.id}-${course.semester}`} className="group">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2 font-mono font-medium text-primary">
                            {course.id}
                            {course.source === "imported" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" title="Imported from Excel" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{course.name}</TableCell>
                        <TableCell className="text-sm">{course.instructor}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            {course.room}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{scheduleStr(course)}</TableCell>
                        <TableCell>
                          {course.semester ? (
                            <Badge
                              variant="outline"
                              className={`text-xs ${course.semester === activeSemester ? "text-green-500 border-green-500/30 bg-green-500/10" : "text-muted-foreground"}`}
                            >
                              {course.semester === activeSemester && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 inline-block" />}
                              {course.semester}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{course.enrollment || "—"}</TableCell>
                        <TableCell className="text-right pr-6">
                          <Button
                            variant="ghost" size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeCourse(course.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
    </Layout>
  );
}
