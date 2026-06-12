"use strict";
const mammoth = require("./node_modules/mammoth");
const fs = require("fs");
const path = require("path");

const PUB = path.resolve(__dirname, "../artifacts/neu-attendai/public");
const logoB64 = fs.readFileSync(path.join(PUB, "neu-logo.png")).toString("base64");

const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: #000; background: #fff; }
.page-wrapper { max-width: 21cm; margin: 0 auto; padding: 2.5cm; }

/* ── Navy cover page ─────────────────────────────────────────── */
.cover-page {
  background: #0D1B33;
  color: #fff;
  width: calc(21cm + 5cm);
  min-height: 29.7cm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2.5cm;
  margin: -2.5cm -2.5cm 0 -2.5cm;
  page-break-after: always;
}
.cover-page img { width: 3.2cm; height: 3.2cm; margin-bottom: 1.2cm; }
.cover-uni   { font-size: 16pt; font-weight: bold; color: #fff;    margin-bottom: .3cm; }
.cover-fac   { font-size: 12pt; color: #AACCEE; margin-bottom: .2cm; }
.cover-dept  { font-size: 12pt; color: #AACCEE; margin-bottom: 2.2cm; }
.cover-title { font-size: 22pt; font-weight: bold; color: #fff;    margin-bottom: .4cm; }
.cover-sub   { font-size: 13pt; font-style: italic; color: #BBDDEE; margin-bottom: .4cm; }
.cover-desc  { font-size: 11pt; font-style: italic; color: #7799BB; margin-bottom: 2.2cm; }
.cover-by    { font-size: 11pt; color: #7799BB; margin-bottom: .4cm; }
.cover-name  { font-size: 15pt; font-weight: bold; color: #fff;    margin-bottom: .3cm; }
.cover-det   { font-size: 11pt; color: #AACCEE; margin-bottom: .2cm; }
.cover-sm    { font-size: 10pt; color: #7799BB; margin-bottom: .2cm; }

/* ── Body ────────────────────────────────────────────────────── */
h1 { font-size: 14pt; font-weight: bold; margin: 20pt 0 10pt; text-align: center; page-break-before: always; }
h1:first-of-type { page-break-before: avoid; }
h2 { font-size: 13pt; font-weight: bold; margin: 14pt 0 6pt; }
h3 { font-size: 12pt; font-weight: bold; margin: 10pt 0 4pt; }
p  { margin-bottom: 8pt; text-align: justify; }
pre, code { font-family: 'Courier New', Courier, monospace; font-size: 9pt;
            background: #f5f5f5; padding: 6pt 10pt; display: block;
            margin: 6pt 0; white-space: pre-wrap; }
img { max-width: 100%; height: auto; display: block; margin: 10pt auto; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
td, th { border: 1px solid #999; padding: 4pt 6pt; font-size: 10pt; }
th { background: #d9d9d9; font-weight: bold; }

@media print {
  body { font-size: 11pt; }
  .page-wrapper { padding: 0; max-width: none; }
  .cover-page { page-break-after: always; }
  h1 { page-break-before: always; }
  h1:first-of-type { page-break-before: avoid; }
  pre { page-break-inside: avoid; }
  img { max-width: 14cm; }
  @page { size: A4; margin: 2.5cm; }
  @page :first { margin: 0; }
}
`;

mammoth.convertToHtml({ path: path.join(PUB, "NEU_AttendAI_Graduation_Report.docx") })
  .then(result => {
    const coverHtml = `
<div class="cover-page">
  <img src="data:image/png;base64,${logoB64}" alt="NEU Logo">
  <div class="cover-uni">NEAR EAST UNIVERSITY</div>
  <div class="cover-fac">Faculty of Engineering</div>
  <div class="cover-dept">Department of Computer Engineering</div>
  <div class="cover-title">NEU AttendAI</div>
  <div class="cover-sub">Smart Geo-Fencing Attendance System</div>
  <div class="cover-desc">A Dual-Verification Web Platform for Near East University</div>
  <div class="cover-by">Prepared by</div>
  <div class="cover-name">FATUMO MUKHTAR</div>
  <div class="cover-det">Student ID: 20225507</div>
  <div class="cover-det">COM491 — Graduation Project</div>
  <div class="cover-sm">Near East University · Nicosia, TRNC</div>
  <div class="cover-sm">Spring Semester, Academic Year 2025–2026</div>
</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NEU AttendAI — Graduation Report</title>
<style>${css}</style>
</head>
<body>
${coverHtml}
<div class="page-wrapper">${result.value}</div>
</body>
</html>`;

    const out = path.join(PUB, "NEU_AttendAI_Print.html");
    fs.writeFileSync(out, html);
    const kb = Math.round(html.length / 1024);
    console.log(`HTML done: ${kb} KB → ${out}`);
  })
  .catch(e => { console.error("ERROR:", e.message); process.exit(1); });
