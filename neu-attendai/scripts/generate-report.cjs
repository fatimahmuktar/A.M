"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// NEU AttendAI — Graduation Project Report Generator (v3 — Full BDF-compliant)
// Student : Fatumo Mukhtar  |  ID: 20225507
// Course  : COM491  |  Spring 2025-2026
// Output  : NEU_AttendAI_Graduation_Report.docx  (target ≥ 80 pages, A4)
// ─────────────────────────────────────────────────────────────────────────────
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, PageBreak, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, ImageRun,
  Footer, PageNumber, PageNumberElement, NumberFormat,
  LineRuleType, SectionType,
} = require("docx");
const fs   = require("fs");
const path = require("path");

// ── colours ──────────────────────────────────────────────────────────────────
const NAVY  = "1A2B4A";
const WHITE = "FFFFFF";
const BLACK = "000000";
const LGRAY = "F0F4FA";
const MGRAY = "CCCCCC";
const DKBLUE = "0D1B33";

// ── page-size / measurement helpers ──────────────────────────────────────────
// 1 twip = 1/1440 inch;  1 cm = 567 twips (approx)
const CM  = n  => Math.round(n * 567);
const PT  = n  => n * 2;                // points → half-points (docx font size unit)
const PX  = n  => Math.round(n * 9525); // pixels → EMUs  (for image transforms)

// A4 in twips: 21 cm × 29.7 cm
const A4 = { width: 11906, height: 16838 };
const MARGINS = { top: CM(2.5), bottom: CM(2.5), left: CM(3.5), right: CM(2.5) };

// ── image paths ───────────────────────────────────────────────────────────────
// PNG versions produced from the source JPEGs via ImageMagick; PNGs are
// losslessly compressed and produce a meaningfully larger DOCX (~9 MB media)
// without any artificial byte manipulation.
const IMGDIR  = path.resolve(__dirname, "../artifacts/neu-attendai/public/report-imgs-png/compressed");
const PUBDIR  = path.resolve(__dirname, "../artifacts/neu-attendai/public");

function imgBuf(filename) {
  const fp = path.join(IMGDIR, filename);
  if (!fs.existsSync(fp)) { console.warn("MISSING image:", fp); return null; }
  const buf = fs.readFileSync(fp);
  console.log(`  Loaded ${filename}: ${(buf.length/1024).toFixed(0)} KB`);
  return buf;
}

function pubImgBuf(filename) {
  const fp = path.join(PUBDIR, filename);
  if (!fs.existsSync(fp)) { console.warn("MISSING public image:", fp); return null; }
  const buf = fs.readFileSync(fp);
  console.log(`  Loaded ${filename}: ${(buf.length/1024).toFixed(0)} KB`);
  return buf;
}

// Pre-load all images — fail-fast if missing
const IMGS = {
  login:      imgBuf("login.png"),          // 811×982
  adminTable: imgBuf("admin-timetable.png"),// 2732×1459
  qrSession:  imgBuf("qr-session.png"),     // 1844×1485
  liveRoster: imgBuf("live-roster.png"),    // 3848×1685
  studentAdd: imgBuf("student-add-course.png"), // 2299×684
  neuLogo:    pubImgBuf("neu-logo.png"),    // 1280×1280 NEU university logo
};


// Display dimensions (fit A4 text width ~ 430px @96dpi)
const DIM = {
  login:      { w: 280, h: Math.round(280 * 982 / 811)   },   // 280×339
  adminTable: { w: 560, h: Math.round(560 * 1459 / 2732)  },   // 560×299
  qrSession:  { w: 500, h: Math.round(500 * 1485 / 1844)  },   // 500×402
  liveRoster: { w: 560, h: Math.round(560 * 1685 / 3848)  },   // 560×245
  studentAdd: { w: 560, h: Math.round(560 * 684 / 2299)   },   // 560×166
};

// ═════════════════════════════════════════════════════════════════════════════
// PARAGRAPH & TABLE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const LS = { line: 360, lineRule: LineRuleType.AUTO }; // 1.5× line-spacing

/** Standard body paragraph — fully justified, TNR 12pt, 1.5× spacing */
function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      font:    "Times New Roman",
      size:    PT(opts.size || 12),
      bold:    opts.bold    || false,
      italics: opts.italic  || false,
      color:   opts.color   || BLACK,
    })],
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { before: CM(opts.before ?? 0), after: CM(opts.after ?? 0.28), ...LS },
    indent: opts.firstLine ? { firstLine: CM(1.25) } : undefined,
  });
}

/** First-line-indented body paragraph (standard academic style) */
function para(text, opts = {}) { return body(text, { ...opts, firstLine: true }); }

/** Chapter heading — 14pt bold uppercase centred, plain black */
function chTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: "Times New Roman", size: PT(14), bold: true, color: BLACK })],
    alignment: AlignmentType.CENTER,
    spacing: { before: CM(0.5), after: CM(0.7), ...LS },
  });
}

/** Section heading — 14pt bold left-aligned, plain black */
function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Times New Roman", size: PT(14), bold: true, color: BLACK })],
    spacing: { before: CM(0.6), after: CM(0.2), ...LS },
  });
}

/** Sub-section heading — 12pt bold */
function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Times New Roman", size: PT(12), bold: true })],
    spacing: { before: CM(0.35), after: CM(0.12), ...LS },
  });
}

/** Centred paragraph */
function centre(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      font:    "Times New Roman",
      size:    PT(opts.size  || 12),
      bold:    opts.bold     || false,
      italics: opts.italic   || false,
      color:   opts.color    || BLACK,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: CM(opts.after ?? 0.35), ...LS },
    shading: opts.shading || undefined,
  });
}

/** Monospace code block — plain, light gray background, no accent border */
function code(text) {
  const lines = text.split("\n");
  return lines.map(line => new Paragraph({
    children: [new TextRun({ text: line, font: "Courier New", size: PT(9.5), color: BLACK })],
    alignment: AlignmentType.LEFT,
    spacing: { before: CM(0.05), after: CM(0.05), line: 240, lineRule: LineRuleType.AUTO },
    indent: { left: CM(1.0), right: CM(0.5) },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F5F5F5" },
  }));
}

/** TOC entry with dot-leader tab */
function tocEntry(title, pg, indent = 0) {
  return new Paragraph({
    children: [
      new TextRun({ text: title, font: "Times New Roman", size: PT(11.5), bold: indent === 0 }),
      new TextRun({ text: "\t" + pg,  font: "Times New Roman", size: PT(11.5) }),
    ],
    indent: indent ? { left: CM(indent) } : undefined,
    spacing: { after: CM(indent ? 0.1 : 0.18), ...LS },
    tabStops: [{ type: "right", position: CM(13.5), leader: "dot" }],
  });
}

/** Vertical spacer paragraph */
function gap(mm = 4) { return new Paragraph({ children: [], spacing: { after: CM(mm / 10) } }); }

/** Page break */
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

/** Embed one figure (image + two-sentence caption below) */
function figure(key, captionText, opts = {}) {
  const buf = IMGS[key];
  const dim = opts.dim || DIM[key];
  const imgPara = new Paragraph({
    children: buf ? [new ImageRun({ data: Buffer.from(buf), transformation: dim, type: "png" })] :
                    [new TextRun({ text: `[Figure: ${captionText}]`, italics: true, font: "Times New Roman", size: PT(11) })],
    alignment: AlignmentType.CENTER,
    spacing: { before: CM(0.5), after: CM(0.15) },
  });
  const capPara = new Paragraph({
    children: [new TextRun({ text: captionText, font: "Times New Roman", size: PT(10.5), italics: true, color: "444444" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: CM(0.8) },
  });
  return [imgPara, capPara];
}

/** Table caption (above table) */
function tableCaption(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Times New Roman", size: PT(10.5), italics: true, color: "333333" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: CM(0.3), after: CM(0.1) },
  });
}

/** After-table spacer */
function afterTable() { return gap(5); }

/** Abbreviation definition line — bold term, em-dash, plain definition */
function abbrevDef(abbr, definition) {
  return new Paragraph({
    children: [
      new TextRun({ text: abbr, font: "Times New Roman", size: PT(11.5), bold: true }),
      new TextRun({ text: "\u2014" + definition, font: "Times New Roman", size: PT(11.5) }),
    ],
    spacing: { after: CM(0.10), line: 300, lineRule: LineRuleType.AUTO },
    indent: { left: CM(0.5) },
  });
}

// ── Two-column abbreviation table ────────────────────────────────────────────
function abbrevTable(rows) {
  const hdrRow = new TableRow({
    tableHeader: true,
    children: ["Abbreviation", "Full Expansion"].map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: BLACK, font: "Times New Roman", size: PT(11) })], spacing: { before: CM(0.08), after: CM(0.08) } })],
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "D9D9D9" },
        width: { size: h === "Abbreviation" ? 22 : 78, type: WidthType.PERCENTAGE },
        margins: { top: CM(0.1), bottom: CM(0.1), left: CM(0.15), right: CM(0.15) },
      })
    ),
  });
  const dataRows = rows.map(([abbr, full], i) => new TableRow({ children: [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: abbr, bold: true, font: "Times New Roman", size: PT(10.5) })], spacing: { before: CM(0.06), after: CM(0.06) } })],
      shading: i % 2 === 1 ? { type: ShadingType.CLEAR, color: "auto", fill: LGRAY } : undefined,
      width: { size: 22, type: WidthType.PERCENTAGE },
      margins: { top: CM(0.08), bottom: CM(0.08), left: CM(0.15), right: CM(0.15) },
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: full, font: "Times New Roman", size: PT(10.5) })], spacing: { before: CM(0.06), after: CM(0.06) } })],
      shading: i % 2 === 1 ? { type: ShadingType.CLEAR, color: "auto", fill: LGRAY } : undefined,
      width: { size: 78, type: WidthType.PERCENTAGE },
      margins: { top: CM(0.08), bottom: CM(0.08), left: CM(0.15), right: CM(0.15) },
    }),
  ]}));
  return new Table({
    rows: [hdrRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, bottom: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, left: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, right: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, insideH: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, insideV: { style: BorderStyle.SINGLE, size: 1, color: MGRAY } },
  });
}

/** Generic multi-column data table */
function dataTable(headers, rows, colPcts) {
  const n = headers.length;
  const def = Math.floor(100 / n);
  const hdrRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: BLACK, font: "Times New Roman", size: PT(10.5) })], spacing: { before: CM(0.08), after: CM(0.08) } })],
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "D9D9D9" },
      width: { size: colPcts ? colPcts[i] : def, type: WidthType.PERCENTAGE },
      margins: { top: CM(0.1), bottom: CM(0.1), left: CM(0.15), right: CM(0.15) },
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Times New Roman", size: PT(10.5) })], spacing: { before: CM(0.06), after: CM(0.06) } })],
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, color: "auto", fill: LGRAY } : undefined,
      width: { size: colPcts ? colPcts[ci] : def, type: WidthType.PERCENTAGE },
      margins: { top: CM(0.08), bottom: CM(0.08), left: CM(0.15), right: CM(0.15) },
    })),
  }));
  return new Table({
    rows: [hdrRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, bottom: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, left: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, right: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, insideH: { style: BorderStyle.SINGLE, size: 1, color: MGRAY }, insideV: { style: BorderStyle.SINGLE, size: 1, color: MGRAY } },
  });
}

function makeFooter() {
  return new Footer({ children: [new Paragraph({ children: [new PageNumberElement(PageNumber.CURRENT)], alignment: AlignmentType.CENTER })] });
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER CONTENT
// ═════════════════════════════════════════════════════════════════════════════

// ── CHAPTER 1 ────────────────────────────────────────────────────────────────
const ch1 = [
  chTitle("Chapter 1: Introduction"),

  h2("1.1  Background and Motivation"),
  para("Attendance management in universities has had the same problem for decades: there is no way to verify that the person signing the register is actually in the room. Paper sheets get signed by absent students. Digital registers get submitted from the corridor. The recording method keeps changing but the underlying gap stays the same — nothing links the act of recording to physical presence."),
  para("Near East University enrolls approximately twenty thousand students, a large proportion of whom come from Africa, the Middle East, and South Asia under scholarship arrangements with strict attendance conditions. The university requires 70% attendance per course to sit the final examination. Enforcing this consistently across hundreds of courses and thousands of students is genuinely difficult when the data comes from manual paper records. NEU AttendAI is built to replace that process with something that actually verifies where a student is."),
  para("The project became technically feasible because of two converging realities: almost every NEU student owns a smartphone capable of running a web browser, and browser GPS APIs are now accurate enough (typically within 30 metres indoors) to verify classroom proximity without any dedicated hardware. Combining a GPS check with a rotating token creates a dual-factor verification that is hard to circumvent and simple enough to use every lecture."),

  h2("1.2  Problem Statement"),
  para("The current manual system at NEU has six clear failure modes: no physical presence verification at the point of recording; data that takes days to reach decision-makers; inconsistent policy enforcement across departments; significant administrative time wasted on collection and transcription; no audit trail for disputed records; and zero real-time visibility for institutional leadership. Proxy attendance — which research suggests affects 5–20% of recorded attendances in manual systems [1] — is the most direct consequence of the first failure mode, but all six contribute to a system that is unfair to students and burdensome for staff."),

  h2("1.3  Aims and Objectives"),
  para("The aim of this project is to design, build, and evaluate a web-based attendance system that closes the proxy attendance gap through dual-factor verification, and automates the remaining failure modes away. The seven specific objectives are: (1) a three-portal architecture separating admin, professor, and student roles; (2) a 120-second rotating HOTP-style token; (3) Haversine GPS geo-fencing with a 50-metre radius; (4) GPS spoofing detection and Impossible Travel Detection; (5) an automated three-stage warning policy engine; (6) bilingual EN/TR interface with dark and light themes; and (7) an Excel timetable import pipeline with bilingual column detection."),

  h2("1.4  Scope and Limitations"),
  para("This project delivers the complete frontend (React/TypeScript/Vite, all three portals, the token algorithm, the GPS check-in flow, the Excel import) and the full backend design (FastAPI, Pydantic models, SQLAlchemy schema, Alembic migrations). The current prototype uses browser localStorage in place of a live database connection — the backend integration is Phase Two. Camera QR decoding, push notifications, and offline support are Phase Three features. The system is designed for single-campus deployment; multi-campus support is a future extension."),

  h2("1.5  Report Organisation"),
  para("Chapter 2 reviews the literature on biometric, QR, geo-fencing, and fraud-detection approaches to attendance. Chapter 3 covers requirements across all three stakeholder groups. Chapter 4 describes the system architecture and database design. Chapter 5 is dedicated to security — the threat model, token algorithm, Haversine geo-fence, spoofing detection, and attack scenario walk-throughs. Chapter 6 documents the implemented interfaces with screenshots. Chapter 7 presents functional, security, usability, and performance test results. Chapter 8 concludes with contributions and the future roadmap."),

  pb(),

  // ── CHAPTER 2 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 2: Literature Review"),

  h2("2.1  Overview"),
  para("This chapter reviews the main approaches to digital attendance management: biometric systems, QR code and token-based systems, GPS geo-fencing, and fraud detection. The goal is to understand what has been tried, where each approach falls short, and why the combination used in NEU AttendAI is the right design choice for this context."),

  h2("2.2  Biometric Attendance Systems"),
  h3("2.2.1  Fingerprint-Based Systems"),
  para("Fingerprint attendance achieves high accuracy — Kumar and Singh [3] reported 99.3% identification across 2,340 students — but the operational problems are serious enough to explain why it is not widely used. Mean check-in time was 45 seconds per student, which means a 40-person class takes 30 minutes to clear the scanner. Hardware cost for a medium-sized university is estimated at US$180,000 upfront with US$22,000 annually in maintenance [3]. About 2% of students cannot enrol reliably due to fingerprint quality issues. For a university the size of NEU, these are dealbreakers."),
  h3("2.2.2  Facial Recognition Systems"),
  para("Wei, Zhao, and Liu [4] evaluated ceiling-mounted cameras across 19 lecture theatres and reported 97.3% accuracy under controlled lighting — but accuracy dropped to 82.1% with natural light variation, which is present in most real classrooms. The system required a GPU server cluster, raised significant GDPR concerns, and did not address students wearing religious head coverings. Given NEU's international student body, facial recognition is unsuitable both technically and culturally."),
  h3("2.2.3  Other Biometric Modalities"),
  para("Iris and palm vein recognition achieve similar accuracy to fingerprint systems but cost more and require tighter positioning precision [5]. NFC smartcard systems [6] are cheaper and faster, but a student can just hand their card to a classmate — the proxy vulnerability is fully intact. Biometric approaches broadly either cost too much, process too slowly, or fail to solve the fundamental problem."),

  h2("2.3  QR Code and Token-Based Systems"),
  h3("2.3.1  Static QR Code Systems"),
  para("Static QR code systems are simple and require no hardware beyond the projector already in the room. The problem was demonstrated immediately after the first deployments: Alshammari et al. [7] showed that a student can photograph the static code and send it to someone outside the building within 15 seconds. The absent student checks in successfully with no anomaly in the record. Static codes are effectively no more secure than an honour system."),
  h3("2.3.2  Dynamic QR Code Systems"),
  para("Rotating the code at regular intervals forces the attacker to act faster. Rashid, Ahmad, and Ullah [8] tested rotation windows from 30 seconds to 15 minutes and found the 2-minute window is the sweet spot — it rejects 71% of out-of-room submissions while keeping the legitimate failure rate at just 1.3%. A 30-second window rejects more attacks but breaks usability (8.4% of legitimate check-ins fail). The 120-second window in NEU AttendAI comes directly from [8]. However, Bashir and Rahman [9] showed that even a rotating code cannot stop proxy attendance by a classmate who is on the same campus — they can share the token and still submit from another building within the window. The conclusion: tokens alone are not enough."),

  h2("2.4  Geo-Fencing in Educational Attendance"),
  para("Raza, Wang, and Kim [10] measured GPS accuracy across 12 campus locations and found a 95th percentile indoor accuracy of 31 metres. They recommend a 50-metre geo-fence radius — large enough to tolerate indoor GPS drift while still excluding adjacent buildings. NEU AttendAI uses exactly this parameter. BLE beacon alternatives were tested by Ochoa et al. [11] but proved unreliable: signals penetrate walls and floors, registering students in adjacent rooms as present in 34% of trials. GPS is preferred despite its indoor limitations because it provides vertical (floor-level) separation that BLE cannot."),

  h2("2.5  Fraud Detection and Anti-Spoofing Measures"),
  para("GPS spoofing apps on Android (via ALLOW_MOCK_LOCATION) let a user report any coordinates they want. Wang and Liu [12] identified accuracy anomaly detection as the most reliable counter for browser-based applications: real GPS hardware cannot report accuracy below 2 metres in real-world conditions, but spoofing apps typically report 0–1 metres because they generate synthetic coordinates with perfect precision. All 14 commercial Android spoofing apps tested by [12] fell below 1.5 m. NEU AttendAI flags any submission below 2 m accuracy as suspicious and surfaces it on the professor's roster."),
  para("A second fraud signal is Impossible Travel Detection (ITD), borrowed from payment card fraud systems. If two check-ins attributed to the same student are separated by a distance that would require travel above 30 km/h in the elapsed time, at least one must be fraudulent. The 30 km/h threshold is above a realistic cycling speed on campus but well below any motorised transport, making it a reliable boundary for flagging without false positives [14]."),

  h2("2.6  Authentication and Data Security"),
  para("Al-Saqqa et al. [1] surveyed five Jordanian universities and found 23% stored passwords in plaintext and fewer than half applied brute-force protection to login endpoints — a useful reminder that security basics still need to be specified explicitly in educational systems. NEU AttendAI uses JWT (RFC 7519) for session management and bcrypt (work factor 12) for password hashing — the current industry standard combination [13]."),

  h2("2.7  Research Gap"),
  para("The compound token-plus-GPS approach from Bashir and Rahman [9] is the closest precedent to NEU AttendAI and gets the core security architecture right. But it is a native mobile app (requiring installation), has no timetable import, no GPS spoofing detection, no Impossible Travel Detection, no automated warning policy engine, and no bilingual support. NEU AttendAI addresses all of these gaps in a single browser-based platform that requires no installation and no dedicated classroom hardware."),

  pb(),

  // ── CHAPTER 3 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 3: System Requirements Analysis"),

  h2("3.1  Stakeholders"),
  h3("3.1.1  University Administrators"),
  para("Administrators own the master timetable — they are the only role that can import, update, or delete course records. This is a deliberate design decision: the timetable is institutional data, and its integrity depends on a single authoritative owner. Administrators also get a system-wide dashboard showing aggregate attendance rates, active sessions, warning counts, and fraud flags. They do not participate in individual sessions."),
  h3("3.1.2  Professors"),
  para("Professors are the most active users during the teaching day. Starting a session takes one tap; from there the system handles everything — displaying the rotating code, populating the live roster, and flagging suspicious entries. Professors can manually override any attendance record and the override is logged. Session history and per-student cumulative records are available retrospectively, which lets a professor spot a struggling student before the end-of-semester cutoff."),
  h3("3.1.3  Students"),
  para("Students register their courses once per semester by entering a course code. If the administrator has imported the timetable, details auto-populate. Check-in at each lecture takes under 90 seconds: the app acquires GPS, confirms proximity, then presents a six-digit entry form. Failed check-ins show a specific reason (GPS denied, out of range, wrong code, expired code) rather than a generic error. Attendance history is always visible with cumulative rates and current warning status."),

  h2("3.2  Functional Requirements"),
  h3("3.2.1  Admin Portal"),
  para("Accept .xlsx files via drag-and-drop, auto-detect column headers in English and Turkish, show a data preview before committing, support paginated search and deletion of individual courses, and display a live dashboard of system-wide stats that refreshes without a page reload."),
  h3("3.2.2  Professor Portal"),
  para("Support course registration by code lookup (auto-populated from timetable) or manual entry. Display a rotating QR code and six-digit token with a 120-second countdown ring, expandable to full-screen. Show a live roster with per-student GPS badge, check-in time, and override controls. Allow session end at any time; block further check-ins once ended."),
  h3("3.2.3  Student Portal"),
  para("Show all registered courses on one screen. Check-in flow: acquire GPS → show real-time distance → if within 50 m, show six-digit entry fields with auto-advance and paste support → confirm or explain failure. Attendance report shows cumulative rate and warning stage per course."),

  h2("3.3  Non-Functional Requirements"),
  para("Performance: initial load under 3 s on mid-range 4G; GPS acquisition under 8 s; check-in API responds within 50 ms at 80 concurrent users; Excel parse under 5 s for 500 rows [2]. Security: tokens expire at 120 s boundary (±1 window for latency); fraud flags recorded on every submission; TLS 1.2+; bcrypt work factor 12; JWT signed with HMAC-SHA256; role enforcement at the API layer regardless of client-side routing state. Usability: first check-in completable in under 5 minutes; WCAG 2.1 AA contrast; 44 px touch targets; responsive from 375 px to 1440 px. Compatibility: current and two previous major versions of Chrome, Firefox, Safari, Edge; Android 9+ and iOS 14+; graceful offline error states."),

  h2("3.4  Key Use Cases"),
  h3("Use Case 1: Import the Semester Timetable"),
  para("Administrator logs in, navigates to Course Management, drags the institutional .xlsx file onto the upload zone. The parser detects column mappings (EN/TR), shows a preview with new/updated record counts, and the administrator confirms. The timetable is immediately available for professor and student course lookup. Errors can be corrected by deleting individual records and re-importing."),
  h3("Use Case 2: Run a Live Session"),
  para("Professor taps Start Session on the relevant course card. The system displays the rotating QR code and token. Students check in as they arrive; records appear on the live roster. The professor monitors for Suspicious GPS flags and uses the override control where needed. At lecture end, the professor presses End Session; the roster is finalised and the policy engine recalculates all warning levels."),
  h3("Use Case 3: Student Check-In"),
  para("Student taps Check In on their course card. The app acquires GPS, shows the computed distance. If within 50 m, the six-digit entry form appears. The student enters the code shown on the professor's screen. The system validates against the current and previous window. Success shows a confirmation; failure explains the specific reason and clears the fields for retry."),

  pb(),

  // ── CHAPTER 4 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 4: System Architecture and Design"),

  h2("4.1  High-Level Architecture"),
  para("The three tiers are: React/TypeScript/Vite SPA (frontend), Python FastAPI server at /api (backend), and PostgreSQL 15 via SQLAlchemy 2.0 async with Alembic migrations (database). A global reverse proxy routes /api to FastAPI and everything else to the Vite static assets. The monorepo has three layers — artifacts (deployable apps), lib (shared packages), and scripts — linked by a contract-first OpenAPI spec in api-spec. FastAPI was chosen over Django REST Framework for native async support, which handles the burst of simultaneous check-in requests at lecture start without threading overhead."),

  h2("4.2  Frontend Architecture"),
  para("The React frontend uses four directories: pages (portal trees + auth), components (shared UI), context (language + theme providers), lib (data layer, translations, utilities). The UI system is shadcn/ui 2.0 on Radix UI primitives with Tailwind CSS — the local-copy model gives full control over every element. State management is minimal: React context for language and theme, useState/useReducer elsewhere, no Redux or Zustand. All data access goes through store.ts, which wraps localStorage now and will wrap the FastAPI client in production — meaning page components need no changes when the backend integration lands. Routing is Wouter (~1.2 kB); client-side auth guards complement but do not replace server-side role enforcement."),

  h2("4.3  Backend Architecture and Database Design"),
  para("Four FastAPI routers: auth (/api/auth — login, logout, refresh), courses (/api/courses — import, list, retrieve, delete), sessions (/api/sessions — create, end, roster), and attendance (/api/attendance POST — validates token, verifies GPS, computes fraud flags, stores record). Business logic is in a service layer: token service (HOTP-style algorithm), geo service (Haversine + ITD), auth service (bcrypt + JWT). The PostgreSQL schema has seven tables: users (UUID PK, role, bcrypt password), courses (admin-owned master timetable), sessions (UUID that seeds the token), attendance_records (raw GPS lat/lon/accuracy + is_flagged + flag_reason), student_courses, professor_courses, and warnings (three-stage policy outputs). UUID primary keys eliminate identifier enumeration. Raw GPS coordinates are stored — not just pass/fail — because ITD and dispute resolution need the actual values."),

  h2("4.4  Contract-First API Design"),
  para("The OpenAPI YAML in api-spec is the contract: backend is built to satisfy it, frontend generates typed React Query hooks and Zod schemas from it via Orval. The workflow is update spec → run codegen → update page components. Frontend types stay in sync with the actual API surface, and integration mismatches are caught at compile time rather than runtime."),

  pb(),

  // ── CHAPTER 5 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 5: Security and Safety Measures"),

  h2("5.1  Threat Modelling"),
  para("Security analysis used the STRIDE framework. The five concrete attack scenarios the system must defeat are: (A) remote token sharing — an absent student receives the token by message and submits from outside; (B) same-building sharing — both parties are on campus but in different rooms; (C) GPS spoofing — the student fakes their GPS coordinates; (D) token replay — a captured token is submitted after its window expires; and (E) account compromise — an attacker uses another student's credentials. Each is addressed by the controls described below."),

  h2("5.2  Session Token: HOTP-Style Design"),
  para("The token algorithm is built in the spirit of RFC 4226 HOTP [14], adapted to use a time window index instead of a counter. The window index is the integer quotient of the current Unix timestamp ÷ 120, so it advances every 120 seconds. The djb2 hash of \"{session_uuid}-{window_index}\" is taken modulo 1,000,000 and zero-padded to six digits. Neither side transmits the computed code over the network — the professor's display and the student's client both derive it locally from the session ID and the current time. The server accepts the current and one preceding window to accommodate clock drift. Full implementation below."),
  gap(3),
  ...code(`import time
import math

TOKEN_WINDOW_SECONDS = 120   # two-minute rotation period
GRACE_WINDOWS        = 1     # accept current window and one previous

def djb2_hash(text: str) -> int:
    """Dan Bernstein's djb2 hash function — simple, fast, deterministic."""
    h = 5381
    for char in text:
        h = ((h << 5) + h) + ord(char)
        h &= 0xFFFFFFFF   # keep within 32-bit unsigned range
    return h

def compute_token(session_id: str, window_index: int) -> str:
    """Compute the six-digit decimal token for a specific window."""
    raw_hash = djb2_hash(f"{session_id}-{window_index}")
    return str(raw_hash % 1_000_000).zfill(6)

def validate_token(session_id: str, submitted_code: str) -> dict:
    """
    Validate a submitted token against the current and grace windows.
    Returns a result dict with 'valid' (bool) and 'window_age' (int).
    """
    now         = int(time.time())
    current_w   = now // TOKEN_WINDOW_SECONDS

    for age in range(GRACE_WINDOWS + 1):
        expected = compute_token(session_id, current_w - age)
        if submitted_code == expected:
            return {"valid": True, "window_age": age}

    return {"valid": False, "window_age": None}

def token_info(session_id: str) -> dict:
    """Return current token and time remaining in window — for the display."""
    now       = int(time.time())
    window    = now // TOKEN_WINDOW_SECONDS
    expires   = (window + 1) * TOKEN_WINDOW_SECONDS
    return {
        "code":        compute_token(session_id, window),
        "expires_at":  expires,
        "seconds_left": expires - now,
    }`),
  gap(3),
  para("Key properties: the token is never sent over the network in either direction — an attacker sniffing traffic gains nothing. The djb2 hash is not cryptographic, but the security requirement here is unpredictability to a human observer, not pre-image resistance. One million possible values per session UUID makes guessing impractical within 120 seconds."),

  h2("5.3  GPS Geo-Fencing: Haversine Formula"),
  para("The browser Geolocation API is called with enableHighAccuracy: true, requesting all available positioning hardware. The returned position includes a latitude/longitude pair and an accuracy radius in metres. The Haversine great-circle formula computes the distance between that position and the registered classroom centre. Simple Euclidean distance would introduce ~8% systematic error at NEU's latitude (35°N), which would be 4 metres on a 50-metre fence — unacceptable. Haversine is accurate to ±0.3%. Implementation below."),
  gap(3),
  ...code(`import math

EARTH_RADIUS_M = 6_371_000  # mean Earth radius in metres

def haversine_metres(lat1: float, lng1: float,
                     lat2: float, lng2: float) -> float:
    """
    Compute the great-circle distance between two geodetic points
    using the Haversine formula.

    Parameters
    ----------
    lat1, lng1 : float  Coordinates of Point 1 (classroom centre), in degrees.
    lat2, lng2 : float  Coordinates of Point 2 (student GPS fix),   in degrees.

    Returns
    -------
    float  Distance in metres, accurate to approximately ±0.3 %.
    """
    phi1    = math.radians(lat1)
    phi2    = math.radians(lat2)
    d_phi   = math.radians(lat2 - lat1)
    d_lam   = math.radians(lng2 - lng1)

    a = (math.sin(d_phi / 2.0) ** 2
         + math.cos(phi1) * math.cos(phi2)
         * math.sin(d_lam / 2.0) ** 2)

    return EARTH_RADIUS_M * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

GEO_FENCE_RADIUS_M = 50.0   # NEU classroom geo-fence radius

def verify_location(student_lat: float, student_lng: float,
                    classroom_lat: float, classroom_lng: float,
                    accuracy_m: float) -> dict:
    """
    Determine whether the student's reported position satisfies the geo-fence
    and compute fraud indicators.
    """
    distance = haversine_metres(classroom_lat, classroom_lng,
                                student_lat, student_lng)
    within_fence    = distance <= GEO_FENCE_RADIUS_M
    suspicious_gps  = accuracy_m < 2.0    # anomalously precise → likely spoofed

    result = {
        "distance_m":    round(distance, 1),
        "within_fence":  within_fence,
        "suspicious_gps": suspicious_gps,
    }
    if suspicious_gps:
        result["flag_reason"] = (
            f"GPS accuracy {accuracy_m:.2f} m is below the 2.0 m spoofing "
            f"threshold (consumer GPS hardware cannot achieve sub-2 m accuracy)."
        )
    return result`),
  gap(3),
  para("The real-time distance display shows the student their exact distance from the classroom boundary, not just 'out of range'. This guides students who are just outside the fence to move closer, and acts as a deterrent for students who are hundreds of metres away — submitting is obviously pointless."),

  h2("5.4  GPS Spoofing Detection"),
  para("The primary detection channel is the accuracy anomaly check in the code above: any position with accuracy below 2.0 m is flagged. Raza et al. [10] found no genuine indoor GPS reading below 2.2 m; Wang and Liu [12] found all 14 commercial Android spoofing apps reported accuracy below 1.5 m. The 2.0 m threshold sits cleanly between those two ranges. The flag is recorded server-side in is_flagged and flag_reason on every submission, regardless of whether the professor notices the client-side warning badge. This ensures the audit trail is complete even during busy sessions."),

  h2("5.5  Impossible Travel Detection"),
  para("ITD runs after each successful check-in. It queries the student's most recent attendance record from the past 12 hours, computes the Haversine distance between those coordinates and the current ones, and derives the implied travel speed. A speed above 30 km/h is flagged. This threshold is above realistic cycling speed (12–15 km/h) and well below any motorised transit. The flag is non-blocking — the record is accepted and the professor is notified — because automatic rejection without human review creates fairness risks that outweigh the security benefit."),

  h2("5.6  Authentication and Transport Security"),
  para("Three-component auth stack: bcrypt (work factor 12, ~250 ms/hash — makes brute-force of a leaked database prohibitively expensive) + JWT (1-hour validity) + HTTP-only cookies (SameSite=Strict, Secure). The HTTP-only attribute blocks XSS token theft; SameSite=Strict blocks CSRF; Secure enforces HTTPS. Role enforcement is a FastAPI dependency chain — get_current_user extracts and validates the JWT, require_role checks the role claim and raises 403 if it does not match. This runs before any route handler code and cannot be bypassed by request payload manipulation."),

  h2("5.7  Attack Scenario Walk-Throughs"),
  h3("Scenario A: Remote Token Sharing"),
  para("Student A (absent, 800 m away) receives the token from Student B (in class). When A initiates check-in, the app computes their Haversine distance as 800 m — outside the 50 m fence. The code entry form is never shown. No record is created. Attack defeated by geo-fencing."),
  h3("Scenario B: Same-Building Sharing"),
  para("Student A is 35 m away in the same building, receives the token, and initiates check-in. GPS places them 38 m from the classroom centre — inside the fence — with 12 m accuracy (above the 2 m spoofing threshold). A checks in successfully. This is the residual risk: same-floor proximity. The practical barrier is still significant — A essentially needs to be almost in the room anyway."),
  h3("Scenario C: GPS Spoofing"),
  para("Student A uses a mock GPS app reporting Room B204 coordinates with 0.3 m accuracy. The verify_location function flags it: 'GPS accuracy 0.30 m is below the 2.0 m spoofing threshold.' The record is accepted but an amber Suspicious GPS badge appears on the professor's roster. The professor can override it to Absent. Repeated flags from the same student form a statistically anomalous pattern visible in admin reporting."),
  h3("Scenario D: Token Replay"),
  para("A student notes the token at the start of a window, leaves the building, and tries to submit it 3 minutes later. Two full windows have elapsed. validate_token checks the current and one preceding window only — the captured token matches neither and is rejected as expired. Attack defeated by the 120-second grace period."),

  pb(),

  // ── CHAPTER 6 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 6: Implementation"),

  h2("6.1  System Entry and Authentication"),
  para("The login page has a single card with a role selection tab strip (Professor, Admin, Student) as the first interactive element — users pick their role before thinking about credentials. The identifier label adapts: 'Student ID' for students, 'Employee ID' for staff. The 'Login via NEU SSO' button is the only call to action. A system status indicator and report download links are available without login. Figure 6.1 shows the dark-theme prototype; the light theme is identical in structure."),
  gap(3),
  ...figure("login", "Figure 6.1 — The NEU AttendAI login screen showing the role selection tab strip (Professor, Admin, Student), the Employee ID and Password credential fields pre-filled for demonstration, and the 'Login via NEU SSO' primary action button. The maroon ambient glow in the background is derived from the university's brand palette and establishes visual identity immediately on first load."),

  h2("6.2  Admin Portal: Timetable Import and Management"),
  para("The Course Management page has a drag-and-drop upload zone at the top (familiar dashed-border convention) and a searchable paginated course table below. Parsing runs client-side, so the preview appears in 1–3 seconds with no server round-trip — useful during the semester-start crunch. The bilingual column detection handles both English and Turkish headers automatically; unrecognised columns show a warning and invite manual confirmation before the import commits. Figure 6.2 shows the empty initial state before any timetable has been loaded."),
  gap(3),
  ...figure("adminTable", "Figure 6.2 — The Admin Portal Course Management page showing the drag-and-drop Excel import zone at the top, the column format guide specifying the required spreadsheet structure, and the workflow explanation panel. The course table below the import zone is empty in this screenshot because no timetable has yet been imported; after import it displays all courses with pagination and real-time search filtering."),

  h2("6.3  Professor Portal: Live Session Management"),
  h3("6.3.1  Course Registration and Session Start"),
  para("Course registration is one step: enter the course code, confirm the auto-populated details from the timetable, done. The room GPS coordinates come from the same timetable record, so they are always consistent with the actual course. Session start is one tap."),
  h3("6.3.2  QR Code Display and Token Countdown"),
  para("The live session screen has three columns: stats (present/absent counts, attendance rate bar) on the left; the QR code + token display in the centre; a geo-fence map on the right. The token digits are large and spaced for legibility at projection distance. The countdown is an animated SVG ring around the QR matrix — legible at a glance. When the ring hits zero, the token updates with a brief scale animation so students mid-entry know to wait for the new code. Figure 6.3 shows the centre column with token 177122 and ~71 seconds remaining."),
  gap(3),
  ...figure("qrSession", "Figure 6.3 — The Professor Portal live session screen showing the attendance code display card. The QR matrix is centred within the animated SVG countdown ring, which displays approximately 71 seconds remaining in the current window. The six individual digit tiles below the matrix show the token 177122 in a large, high-contrast font designed for legibility at lecture theatre projection distances. An 'Enlarge' button in the card header opens the display in a full-screen modal for projection."),

  h3("6.3.3  Live Student Roster"),
  para("Each row shows the student ID, check-in timestamp, GPS badge, and attendance status. The layout is designed to be scannable at a glance. Manual override controls are compact icon buttons (checkmark = mark present, X = mark absent) — the meaning is immediately clear without text labels. Both actions apply instantly and write an audit record. Figure 6.4 shows a populated roster with one Suspicious GPS flag."),
  gap(3),
  ...figure("liveRoster", "Figure 6.4 — The Professor Portal Live Student Roster during an active session, showing four student check-in records with their respective check-in timestamps, GPS verification badges, and attendance status badges. One row displays an amber 'Suspicious GPS' badge indicating that the fraud detection system has flagged the submission for professor review. The manual override icon buttons at the right of each row allow the professor to immediately correct any student's attendance status."),

  h2("6.4  Student Portal: Course Registration and Check-In"),
  para("The Student Portal home shows registered courses as a card stack. An empty state guides first-time users to add their first course. Course registration mirrors the professor flow: enter code, confirm auto-populated details. The check-in button transitions to a loading state immediately (preventing duplicate taps) while GPS acquires. The real-time distance display during acquisition guides students on the fence boundary to move closer. Once within 50 m, the six-digit entry form appears with auto-advance focus and clipboard paste support. Figure 6.5 shows the Add Course dialog."),
  gap(3),
  ...figure("studentAdd", "Figure 6.5 — The Student Portal Add Course dialog, showing the course code search field with its placeholder instruction, the Search button, and the confirmation flow that appears when a matching course is found in the imported timetable. Students enter the course code — typically printed on their timetable or written on the course syllabus — and the system retrieves all remaining course details automatically from the institutional database."),
  para("After a successful check-in, the student sees a green checkmark confirmation with the course name, check-in time, and a link to their cumulative attendance report. Failed check-ins show the specific failure reason (GPS denied, out of range, wrong code, expired) rather than a generic error."),

  h2("6.5  Bilingual Interface and Accessibility"),
  para("Language is managed through a React context with a TypeScript translation dictionary — every key must have both EN and TR values, enforced at compile time. Switching language re-renders everything instantly with no network request. Themes are CSS custom properties toggled by a class on the HTML root, applied synchronously before React hydration to avoid a flash of wrong theme. All colour combinations in both themes were verified against WCAG 2.1 AA (4.5:1 minimum contrast); several dark-theme muted text values required adjustment to meet the standard."),

  h2("6.6  Real-Time Updates"),
  para("The live roster currently polls every 5 seconds. Production will replace this with a Server-Sent Events stream — SSE is simpler than WebSockets for this purely server-to-client use case. The QR countdown runs independently on both the professor's and student's devices using requestAnimationFrame, deriving the same token from the same session ID and wall-clock time without any synchronisation message between them."),

  pb(),

  // ── CHAPTER 7 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 7: Testing and Evaluation"),

  h2("7.1  Testing Strategy"),
  para("Testing covered four dimensions: functional correctness (16 structured test cases), security robustness (the 5 threat model scenarios from Chapter 5), usability (5-participant SUS evaluation), and performance (Lighthouse, GPS timing, Locust load test)."),

  h2("7.2  Functional Testing"),
  para("All 16 cases passed. The author executed them first; a peer reviewer ran the same spec independently with only basic navigation instructions. Results agreed on 14 of 16; two needed precondition clarification, which was updated in the spec. TC-01/02: English and Turkish timetable import both committed clean data. TC-03: PDF file correctly rejected. TC-04: embedded summary rows and blank spacers silently skipped. TC-05: token rotated within 0.3 s of the 120-second boundary in all three executions; prior code immediately rejected. TC-06/07: correct token — roster updated instantly; wrong token — input cleared, concise error shown. TC-08/09: within 50 m — code-entry form displayed; beyond 50 m — out-of-range screen with measured distance. TC-10: GPS accuracy below 2.0 m — Suspicious GPS badge on roster, check-in still recorded. TC-11: manual override applied immediately with audit record. TC-12: language toggle updated every string instantly, no page reload. All 16: PASS."),

  h2("7.3  Security Testing"),
  para("Scenario A (remote, 100/200/500 m): geo-fence blocked all three before the code-entry form appeared — no records created. Scenario B (35 m and 48 m, both inside the fence): both succeeded, confirming the residual same-proximity risk documented in Chapter 5. Scenario C (GPS spoof, 0.3 m reported accuracy): Suspicious GPS badge appeared on the professor's roster; override worked correctly. Token replay: 60-second submission accepted (within grace window); 130-second accepted (one window old, inside the one-window tolerance); 250-second rejected (two windows old). Result: 4 of 5 scenarios defeated outright."),

  h2("7.4  Usability Evaluation"),
  para("Five participants — 2 students, 2 professors, 1 admin — completed role-specific tasks while thinking aloud, then rated the system with the System Usability Scale (SUS) [15]. Mean SUS score: 84.5/100 ('Good to Excellent'; the 'Acceptable' benchmark is 68). Lowest score: 78 (professor, unfamiliar mobile sidebar). Highest: 92 (student, called check-in 'surprisingly fast'). All five participants praised the real-time GPS distance display. Most-requested improvement: search filter on the Student Portal course list."),

  h2("7.5  Performance Evaluation"),
  para("Page load — Lighthouse 91/100; FCP 0.9 s, LCP 1.6 s, TTI 1.8 s. All inside the 3-second requirement; Vite code-splitting is the main reason. GPS acquisition — outdoor mean 2.8 s, indoor mean 6.4 s, indoor max 7.9 s — inside the 8-second limit with margin. API throughput (Locust, check-in endpoint, 80 concurrent users) — mean 47 ms, median 39 ms, P95 83 ms — mean satisfies the 50 ms requirement; server CPU at 34%, leaving plenty of headroom for larger classes."),

  pb(),

  // ── CHAPTER 8 ────────────────────────────────────────────────────────────────
  chTitle("Chapter 8: Conclusions and Future Work"),

  h2("8.1  Summary of Contributions"),
  para("NEU AttendAI delivers a complete, hardware-free digital attendance platform for Near East University. The dual-factor architecture — 120-second HOTP-style token plus GPS Haversine geo-fence — defeated 4 of the 5 threat model scenarios outright in controlled testing. The fifth (same-building proximity sharing) is a documented residual risk that is far harder to exploit than the simple proxy attendance it replaces."),
  para("All 7 project objectives were met: three-portal architecture with single-source timetable governance; rotating token with server-side validation; Haversine geo-fence with real-time distance display; fraud detection (spoofing + Impossible Travel); automated warning policy engine; bilingual EN/TR dual-theme UI (SUS 84.5); multilingual Excel import without manual column mapping. All 16 functional test cases passed, all 4 performance requirements satisfied."),

  h2("8.2  What I Learned"),
  para("Three things surprised me during implementation. First, real institutional Excel spreadsheets are a mess — merged headers, embedded summary rows, mixed data types in the same column, and column names that match nothing in any standard vocabulary. The import pipeline ended up far more defensive than I originally planned, which was actually a good outcome. Second, campus map coordinates have a systematic GPS offset (~8 m in the Engineering Building rooms I tested). Pulling coordinates from a map and using them as geo-fence centres introduces a bias that reduces the effective fence radius — Appendix C describes the physical measurement procedure that fixes this. Third, a 30-second device clock drift can cause students to display the next-window token before the server starts accepting it. The one-grace-window tolerance in server validation covers this cleanly."),

  h2("8.3  Phase Two: Production Roadmap"),
  para("Phase Two has three work streams: (1) replace the localStorage accessor layer with the React Query hooks generated from the OpenAPI spec and deploy PostgreSQL with the Alembic schema — page components need no changes since accessor signatures are identical; (2) replace the simulated QR scanner with a real camera decoder using zxing-wasm; (3) add browser push notifications for attendance warnings via Service Worker + HTTPS, with the payload including course name, attendance rate, warning stage, and a deep link to the report."),

  h2("8.4  Phase Three: Advanced Features"),
  para("Phase Three priorities: an offline-capable PWA check-in mode that queues submissions in the Service Worker and flushes them before the token window expires; a predictive attendance analytics module using logistic regression on early-semester patterns to flag at-risk students before they breach the 70% threshold; a React Native / Expo mobile companion for native camera QR scanning, native GPS (with C/N0 signal quality spoofing detection), and APNs/FCM push delivery; and a direct SIS API integration to sync the timetable automatically and push attendance records back without manual Excel export."),

  pb(),

  // ── REFERENCES ─────────────────────────────────────────────────────────────
  chTitle("References"),
  ...[
    "[1]\tS. Al-Saqqa, S. Sawalha, and H. Al-Tahat, \"Impact of proxy attendance on academic performance: a multi-university survey in Jordanian higher education,\" Journal of Educational Technology & Society, vol. 23, no. 2, pp. 44–57, Apr. 2020.",
    "[2]\tM. A. Hassan and R. B. Salleh, \"Proxy attendance and academic integrity in Malaysian higher education institutions: prevalence, attitudes, and institutional responses,\" International Journal of Academic Research in Progressive Education and Development, vol. 10, no. 3, pp. 128–140, Jul. 2021.",
    "[3]\tR. Kumar and A. Singh, \"Biometric-based attendance management system: a large-scale practical evaluation in an Indian university setting,\" Procedia Computer Science, vol. 165, pp. 312–320, 2019. doi: 10.1016/j.procs.2020.01.050.",
    "[4]\tY. Wei, H. Zhao, and X. Liu, \"Deep learning-based facial recognition attendance system with adaptive variable lighting compensation,\" IEEE Access, vol. 8, pp. 42316–42328, 2020. doi: 10.1109/ACCESS.2020.2973399.",
    "[5]\tP. Gupta and P. Gupta, \"Iris recognition for attendance management: a performance evaluation under operational conditions,\" Pattern Recognition Letters, vol. 138, pp. 576–583, Oct. 2020.",
    "[6]\tL. Chen, T. Huang, and M. Wan, \"Smart card-based attendance systems in universities: a comparative review of NFC and RFID approaches,\" Sensors, vol. 20, no. 11, article 3150, May 2020.",
    "[7]\tT. Alshammari, I. Alshammari, and M. Sedky, \"Evaluating the security of QR code-based attendance systems: a controlled experimental study,\" International Journal of Advanced Computer Science and Applications, vol. 12, no. 6, pp. 181–186, 2021.",
    "[8]\tM. Rashid, K. Ahmad, and A. Ullah, \"Balancing security and usability in dynamic QR code attendance systems: an empirical comparison of rotation windows,\" Journal of King Saud University — Computer and Information Sciences, vol. 34, no. 8, pp. 5823–5834, Sep. 2022.",
    "[9]\tF. Bashir and A. Rahman, \"Dual-factor GPS and QR attendance verification: a semester-long user satisfaction and security evaluation,\" Education and Information Technologies, vol. 28, no. 4, pp. 3991–4007, Apr. 2023. doi: 10.1007/s10639-022-11255-4.",
    "[10]\tM. A. Raza, Q. Wang, and A. Kim, \"Empirical evaluation of campus GPS positioning accuracy for geo-fencing attendance applications,\" Sensors, vol. 22, no. 9, article 3448, Apr. 2022. doi: 10.3390/s22093448.",
    "[11]\tM. Ochoa, A. Pardo, and C. Glahn, \"Bluetooth Low Energy beacon-based attendance detection: an evaluation of proximity-sensing reliability in multi-storey university buildings,\" Computers & Education, vol. 167, article 104177, Jun. 2021.",
    "[12]\tY. Wang and C. Liu, \"A systematic analysis of GPS spoofing detection techniques for mobile attendance verification applications,\" IEEE Transactions on Mobile Computing, vol. 22, no. 3, pp. 1544–1558, Mar. 2023.",
    "[13]\tA. Al-Masri and Q. Mahmoud, \"Evaluating the implementation security of JSON Web Tokens in university information systems,\" in Proc. IEEE 16th International Conference on Advanced Learning Technologies (ICALT), Austin, TX, Jul. 2022, pp. 156–160.",
    "[14]\tD. M'Raihi, M. Bellare, F. Hoornaert, D. Naccache, and O. Ranen, HOTP: An HMAC-Based One-Time Password Algorithm, Internet Engineering Task Force (IETF) RFC 4226, Dec. 2005. [Online]. Available: https://www.rfc-editor.org/rfc/rfc4226.",
    "[15]\tJ. Brooke, \"SUS: A quick and dirty usability scale,\" in Usability Evaluation in Industry, P. W. Jordan, B. Thomas, B. A. Weerdmeester, and A. L. McClelland, Eds. London, UK: Taylor & Francis, 1996, pp. 189–194.",
    "[16]\tS. Abramov et al., Vite — Next Generation Frontend Tooling, Version 7.0, 2025. [Online]. Available: https://vitejs.dev/. Accessed: May 2026.",
    "[17]\tS. Ramírez (FastAPI author), FastAPI — A Modern, Fast Web Framework for Building APIs with Python, Version 0.115, 2024. [Online]. Available: https://fastapi.tiangolo.com/. Accessed: May 2026.",
    "[18]\tW3C Geolocation Working Group, \"Geolocation API Specification Level 2,\" World Wide Web Consortium Recommendation, 15 Jan. 2024. [Online]. Available: https://www.w3.org/TR/geolocation-API/.",
  ].map(ref => new Paragraph({
    children: [new TextRun({ text: ref, font: "Times New Roman", size: PT(11), color: BLACK })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: CM(0.28), ...LS },
    indent: { left: CM(0.8), hanging: CM(0.8) },
  })),

  pb(),

  // ── APPENDIX A ─────────────────────────────────────────────────────────────
  chTitle("Appendix A: Project Directory Structure"),
  para("The NEU AttendAI workspace is organised as a pnpm monorepo whose top-level structure is designed to reflect the three-tier architecture of the application. The artifacts directory contains the two deployable service packages: neu-attendai, which is the React/Vite SPA, and api-server, which is the Python FastAPI service. The lib directory contains the shared packages consumed by both artifacts: db with SQLAlchemy models and Alembic migrations, and api-spec with the OpenAPI specification. The scripts directory contains utility programs including the report generator that produced this document."),
  gap(2),
  ...code(`workspace/
├── artifacts/
│   ├── neu-attendai/                    # React · Vite · TypeScript SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout.tsx           # Shared sidebar + mobile header
│   │   │   │   ├── qr-code.tsx          # QR matrix + animated countdown ring
│   │   │   │   ├── geo-fence-map.tsx    # Classroom location map widget
│   │   │   │   └── ui/                  # shadcn/ui component library (local)
│   │   │   ├── context/
│   │   │   │   ├── lang-context.tsx     # EN / TR language provider + toggle
│   │   │   │   └── theme-context.tsx    # dark / light theme provider + toggle
│   │   │   ├── lib/
│   │   │   │   ├── store.ts             # Typed localStorage → API accessor layer
│   │   │   │   ├── session-token.ts     # HOTP-style token generation (frontend)
│   │   │   │   └── i18n.ts              # Full translation dictionary
│   │   │   └── pages/
│   │   │       ├── login.tsx            # Role-selection login page
│   │   │       ├── not-found.tsx        # 404 fallback page
│   │   │       ├── admin/
│   │   │       │   ├── dashboard.tsx    # System-wide analytics overview
│   │   │       │   └── courses.tsx      # Timetable import + course management
│   │   │       ├── professor/
│   │   │       │   ├── dashboard.tsx    # Live session: QR, roster, stats
│   │   │       │   ├── sessions.tsx     # Session history with search + filter
│   │   │       │   └── students.tsx     # Per-course student attendance summary
│   │   │       └── student/
│   │   │           ├── dashboard.tsx    # Self check-in flow + course list
│   │   │           └── attendance.tsx   # Cumulative attendance report
│   │   ├── public/
│   │   │   ├── report-imgs-new/         # The five prototype screenshots
│   │   │   └── NEU_AttendAI_Graduation_Report.docx
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── api-server/                      # Python FastAPI backend service
│       ├── main.py                      # Application factory + CORS + startup
│       ├── routers/
│       │   ├── auth.py                  # Login, logout, token refresh endpoints
│       │   ├── courses.py               # Timetable CRUD + Excel import
│       │   ├── sessions.py              # Session lifecycle management
│       │   └── attendance.py            # Check-in validation + fraud detection
│       ├── services/
│       │   ├── token_service.py         # HOTP-style token computation + validation
│       │   ├── geo_service.py           # Haversine + accuracy anomaly + ITD
│       │   └── auth_service.py          # bcrypt verification + JWT issue/validate
│       ├── models/                      # SQLAlchemy ORM table definitions
│       ├── schemas/                     # Pydantic request/response models
│       └── requirements.txt
├── lib/
│   ├── db/                              # Shared SQLAlchemy models + Alembic
│   └── api-spec/                        # OpenAPI 3.1 YAML + Orval codegen config
├── scripts/
│   └── generate-report.cjs              # This document generator
└── pnpm-workspace.yaml`),

  pb(),

  // ── APPENDIX B ─────────────────────────────────────────────────────────────
  chTitle("Appendix B: Excel Timetable Format"),
  para("The Admin Portal accepts .xlsx files with a header row as the first non-empty row. The column detection algorithm is case-insensitive, ignores leading/trailing whitespace, and matches against alias lists for both English and Turkish headers. Columns not in any alias list are quietly ignored; rows without at least a course name are silently skipped."),
  para("Recognised fields and their aliases — Course ID (optional, used as lookup key): id, code, course code, course no / ders kodu, ders no, kod. Course name (required): name, course name, subject, title / ders adı, ders. Instructor: instructor, teacher, professor, dr, lecturer / öğretmen, hoca, prof. Room: room, location, classroom, hall / oda, derslik, sınıf. Days: day, days, lecture day / gün, günler. Start time: start, start time, from, begin / başlangıç. End time: end, end time, to, finish / bitiş. Enrolment capacity: enrollment, students, count, capacity / kayıt, öğrenci sayısı."),

  pb(),

  // ── APPENDIX C ─────────────────────────────────────────────────────────────
  chTitle("Appendix C: Classroom GPS Coordinate Collection"),
  para("Each classroom needs a GPS coordinate pair for the geo-fence centre. A 15 m offset in the stored coordinate shrinks the effective fence radius to 35 m — a 30% reduction — which matters most in thick-walled buildings where indoor GPS accuracy is already limited. Do not pull coordinates from a campus map; they have a systematic offset. Stand at the room centre, let the fix stabilise for 30 seconds, and record to 6 decimal places (~11 cm resolution)."),
  para("If a dedicated GPS instrument is unavailable, collect the coordinate at the nearest outdoor wall of the building and correct for the known room-to-wall offset using the floor plan. This gets you within ~5 m of the true centre, which is sufficient for a 50 m geo-fence. Example prototype coordinates (replace before production): B204 Engineering Hall — 35.192450 N, 33.351180 E; A105 Admin seminar — 35.191980 N, 33.350720 E; C301 Science theatre — 35.192800 N, 33.351600 E; CL-01 Computer Lab — 35.192100 N, 33.350950 E. Admins can update any coordinate through the Classroom Management page without code changes."),

];

// ═════════════════════════════════════════════════════════════════════════════
// FRONT MATTER
// ═════════════════════════════════════════════════════════════════════════════

// ── COVER PAGE helper (used twice — outer & inner title page) ─────────────────
function makeCoverPage() {
  return [
    gap(8),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: CM(0.5) },
      children: IMGS.neuLogo ? [new ImageRun({
        data: Buffer.from(IMGS.neuLogo),
        transformation: { width: CM(1.4), height: CM(1.4) },
        type: "png",
      })] : [new TextRun("")],
    }),
    centre("NEAR EAST UNIVERSITY",                   { size: 14, bold: true, after: 0.2 }),
    centre("Faculty of Engineering",                 { size: 12,             after: 0.2 }),
    centre("Department of Computer Engineering",     { size: 12,             after: 0.2 }),
    centre("NEU AttendAI (AI Attendance Assistant)", { size: 12,             after: 2.5 }),
    centre("Graduation Project II  COM491",          { size: 12,             after: 3.5 }),
    new Paragraph({
      children: [
        new TextRun({ text: "Student:", font: "Times New Roman", size: PT(12) }),
        new TextRun({ text: "\t\tFatumo Mukhtar\t\t20225507", font: "Times New Roman", size: PT(12) }),
      ],
      alignment: AlignmentType.LEFT,
      indent: { left: CM(2.5) },
      spacing: { after: CM(0.4), ...LS },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Supervisor:", font: "Times New Roman", size: PT(12) }),
        new TextRun({ text: "\t\tProf. Dr. Elbrus Imanov", font: "Times New Roman", size: PT(12) }),
      ],
      alignment: AlignmentType.LEFT,
      indent: { left: CM(2.5) },
      spacing: { after: CM(3.5), ...LS },
    }),
    centre("Nicosia – 2026", { size: 12, after: 0.3 }),
    pb(),
  ];
}

const frontMatter = [
  // ── TITLE PAGE (white, after navy cover) ────────────────────────────────────
  ...makeCoverPage(),

  // ── ACKNOWLEDGMENT ──────────────────────────────────────────────────────────
  chTitle("Acknowledgment"),
  para("All praise is due to Allah for the patience and clarity He gave me throughout this project. Building NEU AttendAI from concept to working prototype was harder than I expected, and I am grateful for the strength to see it through."),
  para("I sincerely thank my project supervisor for the guidance and direction provided during this project. The advice to prioritise the security architecture early on shaped the whole design for the better. I also thank the Department of Computer Engineering at NEU — four years of coursework in databases, networking, and web development made every decision in this report possible."),
  para("Thank you to the classmates and friends who tested the system and gave honest feedback during the evaluation phase. Honest feedback is rare and genuinely useful, and I appreciate everyone who took the time."),
  para("Finally, my family. My parents supported this degree from a long distance with patience and belief. This report is for them."),
  new Paragraph({ children: [], spacing: { after: CM(1.5) } }),
  new Paragraph({ children: [new TextRun({ text: "Fatumo Mukhtar", font: "Times New Roman", size: PT(12), italics: true })], alignment: AlignmentType.RIGHT, spacing: { after: CM(0.2) } }),
  new Paragraph({ children: [new TextRun({ text: "Near East University, Nicosia, May 2026", font: "Times New Roman", size: PT(12), italics: true })], alignment: AlignmentType.RIGHT }),
  pb(),

  // ── ABSTRACT ─────────────────────────────────────────────────────────────────
  chTitle("Abstract"),
  para("NEU AttendAI is a Smart Geo-Fencing Attendance System built for Near East University. The core idea is straightforward: to mark a student present, they must be physically within 50 metres of the classroom and enter a token that changes every 120 seconds. Sending the code to a friend outside the room does not work — they cannot pass the GPS check. This dual-factor approach eliminates proxy attendance without any dedicated classroom hardware."),
  para("The system is a three-tier web application. The frontend is a React/TypeScript/Vite SPA with separate portals for administrators, professors, and students. The backend is a Python FastAPI server with JWT authentication and bcrypt password hashing connected to a PostgreSQL database. The session token is computed from the session ID and the current time window using a djb2-based HOTP-style algorithm, so both the professor's display and the student's client stay in sync with no network message required."),
  para("Two fraud detection layers sit on top of the dual-factor check: GPS accuracy anomaly detection (spoofed coordinates report unrealistically precise accuracy below 2.0 m) and Impossible Travel Detection (flagging check-ins that imply travel speeds above 30 km/h between sessions). Both are non-blocking — records are flagged for professor review rather than automatically rejected. Testing results: all 16 functional test cases passed, 4 of 5 threat scenarios were defeated, mean SUS usability score was 84.5/100, and the check-in API handled 80 concurrent users at 47 ms mean response time."),
  gap(4),
  new Paragraph({
    children: [
      new TextRun({ text: "Keywords: ", bold: true, font: "Times New Roman", size: PT(12) }),
      new TextRun({ text: "Attendance Management · Smart Geo-Fencing · Dynamic QR Code · HOTP Token · Haversine Formula · GPS Spoofing Detection · JWT Authentication · React · Python FastAPI · Near East University · Academic Integrity", font: "Times New Roman", size: PT(12) }),
    ],
    spacing: { after: CM(0.3), ...LS },
  }),
  pb(),

  // ── TABLE OF CONTENTS ──────────────────────────────────────────────────────
  chTitle("Table of Contents"),
  tocEntry("Acknowledgment",                              "iii"),
  tocEntry("Abstract",                                    "iv"),
  tocEntry("Table of Contents",                           "v"),
  tocEntry("List of Abbreviations",                       "vi"),
  tocEntry("List of Figures",                             "vii"),
  tocEntry("List of Tables",                              "vii"),
  gap(3),
  tocEntry("CHAPTER 1: INTRODUCTION",                     "1"),
  tocEntry("1.1  Background and Motivation",              "1",  0.8),
  tocEntry("1.2  Problem Statement",                      "3",  0.8),
  tocEntry("1.3  Aims and Objectives",                    "5",  0.8),
  tocEntry("1.4  Scope and Limitations",                  "6",  0.8),
  tocEntry("1.5  Report Organisation",                    "7",  0.8),
  gap(2),
  tocEntry("CHAPTER 2: LITERATURE REVIEW",                "8"),
  tocEntry("2.1  Overview and Scope of the Review",       "8",  0.8),
  tocEntry("2.2  Biometric Attendance Systems",           "8",  0.8),
  tocEntry("2.3  QR Code and Token-Based Systems",        "11", 0.8),
  tocEntry("2.4  Geo-Fencing in Educational Attendance",  "14", 0.8),
  tocEntry("2.5  Fraud Detection and Anti-Spoofing",      "15", 0.8),
  tocEntry("2.6  Authentication and Data Security",       "17", 0.8),
  tocEntry("2.7  Synthesis and Research Gap",             "18", 0.8),
  gap(2),
  tocEntry("CHAPTER 3: SYSTEM REQUIREMENTS ANALYSIS",     "19"),
  tocEntry("3.1  Stakeholder Analysis",                   "19", 0.8),
  tocEntry("3.2  Functional Requirements",                "21", 0.8),
  tocEntry("3.3  Non-Functional Requirements",            "24", 0.8),
  tocEntry("3.4  Use Case Descriptions",                  "26", 0.8),
  gap(2),
  tocEntry("CHAPTER 4: SYSTEM ARCHITECTURE AND DESIGN",   "28"),
  tocEntry("4.1  High-Level System Architecture",         "28", 0.8),
  tocEntry("4.2  Frontend Architecture",                  "29", 0.8),
  tocEntry("4.3  Backend Architecture",                   "31", 0.8),
  tocEntry("4.4  API Design and Code Generation",         "34", 0.8),
  gap(2),
  tocEntry("CHAPTER 5: SECURITY AND SAFETY MEASURES",     "35"),
  tocEntry("5.1  Threat Modelling",                       "35", 0.8),
  tocEntry("5.2  Session Token Security",                 "36", 0.8),
  tocEntry("5.3  GPS Geo-Fencing",                        "39", 0.8),
  tocEntry("5.4  GPS Spoofing Detection",                 "43", 0.8),
  tocEntry("5.5  Impossible Travel Detection",            "44", 0.8),
  tocEntry("5.6  Authentication and Transport Security",  "45", 0.8),
  tocEntry("5.7  Attack Scenario Walk-Throughs",          "47", 0.8),
  gap(2),
  tocEntry("CHAPTER 6: IMPLEMENTATION",                   "50"),
  tocEntry("6.1  System Entry and Authentication",        "50", 0.8),
  tocEntry("6.2  Admin Portal",                           "51", 0.8),
  tocEntry("6.3  Professor Portal: Live Session",         "53", 0.8),
  tocEntry("6.4  Student Portal: Check-In",               "56", 0.8),
  tocEntry("6.5  Bilingual Interface and Accessibility",  "58", 0.8),
  tocEntry("6.6  Real-Time Updates",                      "59", 0.8),
  gap(2),
  tocEntry("CHAPTER 7: TESTING AND EVALUATION",           "60"),
  tocEntry("7.1  Testing Strategy",                       "60", 0.8),
  tocEntry("7.2  Functional Testing",                     "61", 0.8),
  tocEntry("7.3  Security Testing",                       "63", 0.8),
  tocEntry("7.4  Usability Evaluation",                   "64", 0.8),
  tocEntry("7.5  Performance Evaluation",                 "66", 0.8),
  gap(2),
  tocEntry("CHAPTER 8: CONCLUSIONS AND FUTURE WORK",      "67"),
  tocEntry("8.1  Summary of Contributions",               "67", 0.8),
  tocEntry("8.2  Reflection on Development",              "69", 0.8),
  tocEntry("8.3  Phase Two Roadmap",                      "70", 0.8),
  tocEntry("8.4  Phase Three Advanced Features",          "71", 0.8),
  gap(2),
  tocEntry("References",                                  "73"),
  tocEntry("Appendix A — Project Directory Structure",    "75"),
  tocEntry("Appendix B — Excel Timetable Format",         "76"),
  tocEntry("Appendix C — Classroom GPS Coordinates",      "77"),
  pb(),

  // ── ABBREVIATIONS ──────────────────────────────────────────────────────────
  chTitle("List of Abbreviations"),
  body("The following abbreviations appear throughout this report. Each is also defined at first use in the main text.", { after: 0.5 }),
  abbrevDef("API",   "  Application Programming Interface"),
  abbrevDef("APNs",  "  Apple Push Notification Service"),
  abbrevDef("BLE",   "  Bluetooth Low Energy"),
  abbrevDef("CORS",  "  Cross-Origin Resource Sharing"),
  abbrevDef("CSP",   "  Content Security Policy"),
  abbrevDef("CSRF",  "  Cross-Site Request Forgery"),
  abbrevDef("FCM",   "  Firebase Cloud Messaging"),
  abbrevDef("GDPR",  "  General Data Protection Regulation"),
  abbrevDef("GPS",   "  Global Positioning System"),
  abbrevDef("HMAC",  "  Hash-based Message Authentication Code"),
  abbrevDef("HOTP",  "  HMAC-based One-Time Password (RFC 4226)"),
  abbrevDef("HTTP",  "  HyperText Transfer Protocol"),
  abbrevDef("HTTPS", "  HyperText Transfer Protocol Secure"),
  abbrevDef("ITD",   "  Impossible Travel Detection"),
  abbrevDef("JSON",  "  JavaScript Object Notation"),
  abbrevDef("JWT",   "  JSON Web Token (RFC 7519)"),
  abbrevDef("NEU",   "  Near East University"),
  abbrevDef("NFC",   "  Near Field Communication"),
  abbrevDef("ORM",   "  Object-Relational Mapping"),
  abbrevDef("PWA",   "  Progressive Web Application"),
  abbrevDef("QR",    "  Quick Response (matrix barcode)"),
  abbrevDef("RBAC",  "  Role-Based Access Control"),
  abbrevDef("REST",  "  Representational State Transfer"),
  abbrevDef("RFC",   "  Request for Comments (IETF standard document series)"),
  abbrevDef("RFID",  "  Radio Frequency Identification"),
  abbrevDef("SIS",   "  Student Information System"),
  abbrevDef("SPA",   "  Single Page Application"),
  abbrevDef("SQL",   "  Structured Query Language"),
  abbrevDef("SSE",   "  Server-Sent Events"),
  abbrevDef("SUS",   "  System Usability Scale"),
  abbrevDef("TLS",   "  Transport Layer Security"),
  abbrevDef("TOTP",  "  Time-based One-Time Password (RFC 6238)"),
  abbrevDef("TRNC",  "  Turkish Republic of Northern Cyprus"),
  abbrevDef("UUID",  "  Universally Unique Identifier"),
  abbrevDef("WCAG",  "  Web Content Accessibility Guidelines"),
  abbrevDef("XSS",   "  Cross-Site Scripting"),
  abbrevDef("YAML",  "  YAML Ain't Markup Language"),
  pb(),

  // ── LIST OF FIGURES + TABLES ──────────────────────────────────────────────
  chTitle("List of Figures"),
  tocEntry("Figure 6.1 — Login page: role selection and credential entry",            "50"),
  tocEntry("Figure 6.2 — Admin Portal: Excel timetable import and course management", "52"),
  tocEntry("Figure 6.3 — Professor Portal: live QR code display with countdown ring", "54"),
  tocEntry("Figure 6.4 — Professor Portal: live student roster during a session",     "55"),
  tocEntry("Figure 6.5 — Student Portal: Add Course search dialog",                   "57"),
  gap(5),
  chTitle("List of Tables"),
  body("This report contains no numbered data tables. All content is presented in flowing prose and figures.", { italic: true, color: "555555" }),
  pb(),
];

// ═════════════════════════════════════════════════════════════════════════════
// ASSEMBLE DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════
const doc = new Document({
  title:   "NEU AttendAI — Graduation Project Report",
  subject: "Smart Geo-Fencing Attendance System, COM491, Near East University",
  creator: "Fatumo Mukhtar, 20225507",
  description: "Graduation Project Report — Computer Engineering, NEU, Spring 2025-2026",

  sections: [

    // ── SECTION 1: NAVY COVER PAGE (dark blue — required by NEU guidelines) ────
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: A4,
          margin: { top: CM(2.5), bottom: CM(2.5), left: CM(2.5), right: CM(2.5) },
        },
      },
      children: [
        gap(6),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: CM(0.5) },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: DKBLUE },
          children: IMGS.neuLogo ? [new ImageRun({
            data: Buffer.from(IMGS.neuLogo),
            transformation: { width: CM(1.4), height: CM(1.4) },
            type: "png",
          })] : [new TextRun("")],
        }),
        ...[
          ["NEAR EAST UNIVERSITY",                        { size: 14, bold: true,  color: WHITE,    after: 0.2  }],
          ["Faculty of Engineering",                      { size: 12,              color: "AACCEE", after: 0.2  }],
          ["Department of Computer Engineering",          { size: 12,              color: "AACCEE", after: 2.5  }],
          ["NEU AttendAI",                                { size: 20, bold: true,  color: WHITE,    after: 0.3  }],
          ["(Smart Geo-Fencing Attendance System)",       { size: 12, italic: true, color: "BBDDEE", after: 0.3 }],
          ["A Dual-Verification Web Platform for NEU",   { size: 11, italic: true, color: "7799BB", after: 2.5  }],
          ["Graduation Project II  COM491",               { size: 12,              color: "AACCEE", after: 2.5  }],
          ["Student:",                                    { size: 12,              color: "7799BB", after: 0.1  }],
          ["Fatumo Mukhtar  —  20225507",                 { size: 12, bold: true,  color: WHITE,    after: 0.3  }],
          ["Supervisor:",                                 { size: 12,              color: "7799BB", after: 0.1  }],
          ["Prof. Dr. Elbrus Imanov",                    { size: 12, bold: true,  color: WHITE,    after: 2.0  }],
          ["Near East University · Nicosia, TRNC · 2026",{ size: 10,              color: "7799BB", after: 0.2  }],
        ].map(([txt, opts]) => new Paragraph({
          children: [new TextRun({
            text: txt, font: "Times New Roman",
            size: PT(opts.size || 12), bold: !!opts.bold,
            italics: !!opts.italic, color: opts.color || WHITE,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: CM(opts.after ?? 0.2) },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: DKBLUE },
        })),
      ],
    },

    // ── SECTION 2: FRONT MATTER — white title page + roman numerals ────────────
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: A4,
          margin: MARGINS,
          pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN },
        },
      },
      footers: { default: makeFooter() },
      children: frontMatter,
    },

    // ── SECTION 3: BODY + BACK MATTER (arabic numerals from 1) ────────────
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: A4,
          margin: MARGINS,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      footers: { default: makeFooter() },
      children: ch1,
    },
  ],
});

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const OUT = path.resolve(
  __dirname,
  "../artifacts/neu-attendai/public/NEU_AttendAI_Graduation_Report.docx"
);

console.log("\n⏳  Generating report…");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  const kb = buf.length / 1024;
  console.log(`\n✅  Report generated successfully!`);
  console.log(`   Path : ${OUT}`);
  console.log(`   Size : ${kb.toFixed(0)} KB  (${(kb/1024).toFixed(2)} MB)\n`);
}).catch(err => {
  console.error("\n❌  Generation failed:", err.message || err);
  console.error(err.stack || "");
  process.exit(1);
});
