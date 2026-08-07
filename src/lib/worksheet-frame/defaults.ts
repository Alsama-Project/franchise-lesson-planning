// The built-in default page frames — the two approved Alsama worksheet designs,
// shipped in code and selected by `subjects.content_language`. A stored
// `worksheet_frame` row overrides these; with no upload, every subject gets a proper
// Alsama page immediately.
//
// These are the education team's supplied files with three faults corrected (faults
// in the design, not choices):
//
//   1. `{{exercises}}` no longer sits inside a `.slot` styled as a 9pt grey monospace
//      PLACEHOLDER indicator — every exercise would have rendered in that styling. The
//      marker sits directly in `.body`, so exercises render in body styling.
//   2. `{{theme}}` (the lesson title, from the Word template's Lesson Title line) now
//      fills the centred title position; `{{lesson_key}}` sits small beneath it. The
//      supplied files left `{{theme}}` unused and put the lesson code in the title.
//   3. The `.sheet` A4 paper simulation (210mm × 297mm, box-shadow, and the `html`
//      desk background) is dropped: the pane already draws the white A4 page on its
//      canvas. `.sheet` is now a padding-only content inset — one A4 container, not two.
//
// Also: the logo points at the real asset (`/brand/alsama-logo.png`, not a
// public-root `/alsama-logo.png` that does not exist), the Google Fonts <link> is
// dropped (the app self-hosts Sora + IBM Plex Sans Arabic), and the Arabic frame's
// font-family targets IBM Plex Sans Arabic — the face the app already ships under
// `:lang(ar)` — via the app CSS variable, so a page never waits on a web font.
//
// Keep these authored against the `{{exercises}}` marker + the `{{subject}} {{year}}
// {{theme}} {{centre}} {{objective}} {{lesson_key}}` placeholders (see frame.ts).
//
// PRINT CONVENTION (applies to every frame, built-in OR uploaded — the CD/Connie
// brief must carry it):
//   · `@page { margin: 0 }`. A page margin is the only band the browser has to print
//     its OWN header/footer into; margin:0 leaves it nowhere to land, so teachers on
//     shared machines never have to untick "Headers and footers".
//   · Put the visual page margin in `.sheet` padding, NOT the `@page` margin, and do
//     NOT zero that padding in `@media print`.
//   · No `@page` margin-box page counter (`@bottom-*`): a counter box needs an `@page`
//     margin, which reopens the browser-chrome band. Page numbers are unavailable in
//     flowing content, so a frame carries a normal-flow footer (`.page-footer`), not a
//     per-sheet number.

import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';

const EN_FRAME = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Alsama worksheet — page design (English)</title>
<style>
/* Alsama student worksheet — English page scaffold. A4 portrait. Two-row header
   table (logo | centre block), objective line, centred lesson title, then the
   generated exercises. A normal-flow footer prints once at the document end. */

/* Page box: A4 portrait, NO margin — with no page margin the browser has nowhere to
   paint its own header/footer (URL, date, page count), so they never print and no
   teacher has to remember to untick "Headers and footers". The visual page margin is
   the .sheet padding instead. (A per-sheet page-number counter is not possible under
   margin:0 — an @page counter box needs an @page margin, which is the very band we
   removed to kill the browser chrome. See .page-footer.) */
@page {
  size: A4 portrait;
  margin: 0;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: Sora, "Helvetica Neue", Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.5;
  color: #1E1B19;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

a { color: #B62A5C; }
a:hover { color: #8E1F47; }

/* One A4 container: the pane draws the paper; .sheet is just the page inset. */
.sheet {
  padding: 20mm 20mm 18mm 20mm;
}

/* Header table — printed one time, on the first page. */
.masthead {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  break-inside: avoid;
}

.masthead td {
  border: 1pt solid #1E1B19;
  padding: 5mm 6mm;
  text-align: center;
  vertical-align: middle;
}

.masthead td.logo-cell { width: 42%; padding: 4mm; }

.masthead td.logo-cell img {
  display: block;
  width: 100%;
  max-width: 66mm;
  height: auto;
  margin: 0 auto;
}

.org { font-size: 15pt; font-weight: 700; line-height: 1.3; }
.dept { font-size: 15pt; font-weight: 700; line-height: 1.3; }

.centre-line { margin-top: 4mm; }

.f { font-size: 13pt; white-space: nowrap; }
.f b { font-weight: 700; }

.f .dots {
  display: inline-block;
  border-bottom: 1pt dotted #1E1B19;
  vertical-align: bottom;
  height: 6mm;
  margin-left: 1.5mm;
}
.f .dots.w-name { width: 72mm; }
.f .dots.w-date { width: 58mm; }

.f .val {
  display: inline-block;
  border-bottom: 1pt dotted #1E1B19;
  vertical-align: bottom;
  min-height: 6mm;
  margin-left: 1.5mm;
  padding: 0 2mm;
}

.fields {
  margin-top: 4mm;
  padding-top: 4mm;
  border-top: 0.5pt solid #1E1B19;
  text-align: left;
}
.fields .f + .f { margin-top: 2.5mm; }

/* ============ OBJECTIVE + TITLE ============ */
.objective {
  margin-top: 5mm;
  font-size: 13pt;
  line-height: 1.5;
  break-inside: avoid;
}
.objective b { font-weight: 700; color: #B62A5C; }

.lesson-title {
  margin-top: 4mm;
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  font-style: italic;
  color: #B62A5C;
}

.lesson-key {
  margin-top: 2mm;
  text-align: center;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9pt;
  letter-spacing: 0.06em;
  color: #6E6052;
}

/* ============ EXERCISES — the app writes them here ============ */
.body {
  padding-top: 8mm;
  min-height: 150mm;
}

/* Footer in NORMAL FLOW — prints once at the document end. It is not a running
   per-sheet footer (that needs an @page margin box, removed with margin:0) and not a
   page number; it is the page's footer mark, shown on screen and in print alike. */
.page-footer {
  margin-top: 10mm;
  padding-top: 4mm;
  border-top: 0.5pt solid #E6D9C7;
  text-align: center;
  font-size: 9pt;
  letter-spacing: 0.04em;
  color: #6E6052;
}

@media print {
  body { background: #fff; }
  /* .sheet KEEPS its padding in print: with @page margin:0 that padding IS the
     visual page margin (it was previously zeroed because the @page carried 20mm). */
  .body { min-height: 0; }
}
</style>
</head>
<body>

<div class="sheet">

  <table class="masthead">
    <tr>
      <td class="logo-cell"><img src="/brand/alsama-logo.png" alt="Alsama"></td>
      <td>
        <div class="org">Alsama Centers</div>
        <div class="dept">{{subject}}</div>
        <div class="centre-line f"><b>Center:</b><span class="val">{{centre}}</span> &nbsp; <b>Year:</b><span class="val">{{year}}</span></div>
        <div class="fields">
          <div class="f"><b>Name:</b><span class="dots w-name"></span></div>
          <div class="f"><b>Date:</b><span class="dots w-date"></span></div>
        </div>
      </td>
    </tr>
  </table>

  <div class="objective">
    <b>Objective:</b> By the end of this session, I will be able to {{objective}}
  </div>

  <div class="lesson-title">{{theme}}</div>
  <div class="lesson-key">{{lesson_key}}</div>

  <main class="body">{{exercises}}</main>

  <div class="page-footer">Alsama Centers</div>

</div>

</body>
</html>
`;

const AR_FRAME = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>ورقة عمل السماء — تصميم الصفحة</title>
<style>
/* Alsama student worksheet — Arabic (right-to-left) page scaffold. A4 portrait,
   mirrored. Same furniture as the English page; fixed wording from the template.
   Font: IBM Plex Sans Arabic (the app's self-hosted Arabic face), via the app var. */

/* Page box: A4 portrait, NO margin — with no page margin the browser has nowhere to
   paint its own header/footer, so they never print and no teacher has to untick
   "Headers and footers". The visual page margin is the .sheet padding instead. (A
   per-sheet page-number counter is not possible under margin:0 — see .page-footer.) */
@page {
  size: A4 portrait;
  margin: 0;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-ibm-plex-arabic), var(--font-sora), "Helvetica Neue", Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #1E1B19;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

a { color: #B62A5C; }
a:hover { color: #8E1F47; }

/* One A4 container: the pane draws the paper; .sheet is just the page inset. */
.sheet {
  padding: 20mm 20mm 18mm 20mm;
}

/* ============ جدول الترويسة — يُطبع مرة واحدة ============ */
.masthead {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  break-inside: avoid;
}

.masthead td {
  border: 1pt solid #1E1B19;
  padding: 5mm 6mm;
  text-align: center;
  vertical-align: middle;
}

.masthead td.logo-cell { width: 42%; padding: 4mm; }

.masthead td.logo-cell img {
  display: block;
  width: 100%;
  max-width: 66mm;
  height: auto;
  margin: 0 auto;
}

.org, .dept { font-size: 15pt; font-weight: 700; line-height: 1.4; }

.centre-line { margin-top: 4mm; }

.f { font-size: 13pt; white-space: nowrap; }
.f b { font-weight: 700; }

.f .dots {
  display: inline-block;
  border-bottom: 1pt dotted #1E1B19;
  vertical-align: bottom;
  height: 6mm;
  margin-right: 1.5mm;
}
.f .dots.w-name { width: 72mm; }
.f .dots.w-date { width: 58mm; }

.f .val {
  display: inline-block;
  border-bottom: 1pt dotted #1E1B19;
  vertical-align: bottom;
  min-height: 6mm;
  margin-right: 1.5mm;
  padding: 0 2mm;
}

.fields {
  margin-top: 4mm;
  padding-top: 4mm;
  border-top: 0.5pt solid #1E1B19;
  text-align: right;
}
.fields .f + .f { margin-top: 2.5mm; }

/* ============ الهدف ============ */
.objective {
  margin-top: 5mm;
  font-size: 13pt;
  line-height: 1.6;
  break-inside: avoid;
}
.objective b { font-weight: 700; color: #B62A5C; }

.lesson-title {
  margin-top: 4mm;
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  color: #B62A5C;
}

.lesson-key {
  margin-top: 2mm;
  text-align: center;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 9pt;
  letter-spacing: 0.06em;
  color: #6E6052;
  direction: ltr;
}

/* ============ التمارين — يكتبها التطبيق هنا ============ */
.body {
  padding-top: 8mm;
  min-height: 150mm;
}

/* Footer in NORMAL FLOW — prints once at the document end. Not a running per-sheet
   footer (that needs an @page margin box, removed with margin:0) and not a page
   number; it is the page's footer mark, shown on screen and in print alike. */
.page-footer {
  margin-top: 10mm;
  padding-top: 4mm;
  border-top: 0.5pt solid #E6D9C7;
  text-align: center;
  font-size: 9pt;
  letter-spacing: 0.04em;
  color: #6E6052;
}

@media print {
  body { background: #fff; }
  /* .sheet KEEPS its padding in print: with @page margin:0 that padding IS the
     visual page margin (it was previously zeroed because the @page carried 20mm). */
  .body { min-height: 0; }
}
</style>
</head>
<body>

<div class="sheet">

  <table class="masthead">
    <tr>
      <td class="logo-cell"><img src="/brand/alsama-logo.png" alt="السماء"></td>
      <td>
        <div class="org">مركز السماء</div>
        <div class="dept">{{subject}}</div>
        <div class="centre-line f"><b>إسم المركز :</b><span class="val">{{centre}}</span> &nbsp; <b>السنة :</b><span class="val">{{year}}</span></div>
        <div class="fields">
          <div class="f"><b>الاسم :</b><span class="dots w-name"></span></div>
          <div class="f"><b>التاريخ :</b><span class="dots w-date"></span></div>
        </div>
      </td>
    </tr>
  </table>

  <div class="objective">
    <b>الهدف:</b> بحلول نهاية هذه الحصة، سأكون قادراً على {{objective}}
  </div>

  <div class="lesson-title">{{theme}}</div>
  <div class="lesson-key">{{lesson_key}}</div>

  <main class="body">{{exercises}}</main>

  <div class="page-footer">مركز السماء</div>

</div>

</body>
</html>
`;

/** The built-in default frame HTML for a subject's content language. Always returns a
 *  complete, valid frame — the fallback when a subject has no uploaded row. */
export function defaultFrameHtml(language: WorksheetContentLanguage): string {
  return language === 'ar' ? AR_FRAME : EN_FRAME;
}
