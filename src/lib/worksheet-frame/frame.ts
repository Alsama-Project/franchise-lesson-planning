// The worksheet page frame — pure data layer.
//
// A "frame" is the printed page furniture around a worksheet (masthead, wordmark,
// Name/Date/Class, objective strip, footer, page numbers), authored as HTML in
// Claude Design and stored per subject in `worksheet_frame` (see
// 20260804090000_worksheet_frame.sql). This module holds ONLY the pure pieces:
// the exercise-slot contract, upload validation, and the render helper that
// substitutes placeholders and injects the compiled exercises. It is deliberately
// free of `server-only` and the Supabase client (that is `./resolve`) so it can be
// unit-tested and reused on either side of the boundary.
//
// NOTE: nothing here is wired into the rendered pane yet. Building the data layer
// is this branch; wiring the stored frame into the review pane and the read-only /
// print-preview path is a follow-up (those two paths are still hand-duplicated
// today — PageFrame/DocMasthead vs MasterFrame — and unifying them comes first).

/**
 * The marker an uploaded frame MUST contain, and where the compiled exercises are
 * injected. Double-brace, matching the field placeholders below: a coordinator is
 * told to type `{{exercises}}` into her page design. It is safe for it to share the
 * `{{…}}` shape because {@link renderWorksheetFrame} injects the exercises at this
 * marker FIRST and only then runs the field-placeholder pass — so the marker is
 * consumed before that pass, and the injected exercise content is never scanned (a
 * `{{…}}` token inside the exercises can never be blanked). Order, not brace style,
 * is what keeps them separate; keep CD authoring against this exact token.
 */
export const EXERCISE_SLOT = '{{exercises}}';

/**
 * The single container the pane owns and scopes an uploaded frame's CSS to. Every
 * frame selector is rewritten to live under this class (see `parse.ts`), so a frame's
 * styles can never touch the app chrome around it. Shared verbatim between the scoping
 * transform (server) and the live renderer (client) — they must agree on this token.
 */
export const FRAME_ROOT_CLASS = 'ws-frame-root';
export const FRAME_ROOT_SELECTOR = `.${FRAME_ROOT_CLASS}`;

/** The sentinel element the LIVE renderer substitutes for {@link EXERCISE_SLOT}: the
 *  editor is portalled into it (there is no exercises HTML string on the live pane —
 *  the contenteditable IS the content). The print/PDF renderer passes serialized
 *  exercises HTML at the same slot instead. `data-ws-exercises` is how the pane finds
 *  the mount point after the frame body is set. */
export const EXERCISE_SENTINEL_ATTR = 'data-ws-exercises';
export const EXERCISE_SENTINEL_HTML = `<div ${EXERCISE_SENTINEL_ATTR}></div>`;

/**
 * A frame parsed and scoped ONCE (see `parse.ts`), the shared representation both
 * renderers sit over:
 *   - live pane: `bodyHtml` → sentinel substitution → mounted with `css` injected;
 *   - print/PDF: `bodyHtml` → {@link renderWorksheetFrame} string injection, `css` inlined.
 * One parse, one scope — never two implementations of the same frame.
 */
export interface ParsedFrame {
  /** The frame's `<body>` inner HTML, scrubbed of active content, `{{…}}` intact. */
  bodyHtml: string;
  /** The frame's CSS, scoped to {@link FRAME_ROOT_SELECTOR}, `@page` hoisted, fonts
   *  mapped to the app's self-hosted families. Inject verbatim into a `<style>`. */
  css: string;
  /** The document's `dir` (from `<html>`/`<body>`), applied to the root container so
   *  an Arabic frame stays RTL after its `<body>` is extracted. Absent → inherit. */
  dir?: string;
  /** The document's `lang`, applied to the root container (drives the app's
   *  `:lang(ar)` Arabic font rule). Absent → inherit. */
  lang?: string;
}

/**
 * The field placeholders a frame may reference, each written as `{{name}}`. Any
 * `{{…}}` token NOT in this set renders as empty (never as literal text). Values
 * are supplied by the caller from the plan context at render time.
 */
export type FramePlaceholder =
  | 'subject'
  | 'year'
  | 'theme'
  | 'centre'
  | 'objective'
  | 'lesson_key';

/** The plan-context values substituted into a frame's `{{…}}` placeholders. A
 *  nullish value renders as empty. `year` accepts a number for convenience. */
export type FramePlaceholders = Partial<
  Record<FramePlaceholder, string | number | null | undefined>
>;

const KNOWN_PLACEHOLDERS: readonly FramePlaceholder[] = [
  'subject',
  'year',
  'theme',
  'centre',
  'objective',
  'lesson_key',
];

/** A `{{ name }}` token, tolerant of inner whitespace. */
const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Active-content vectors rejected on upload — the frame is markup we print
 *  verbatim, so anything that executes code or embeds external content is a hard
 *  failure (reject, never silently strip). Global + case-insensitive so every
 *  occurrence is found and its line reported.
 *
 *  Each vector is anchored to REAL markup, not prose, so ordinary words in a CSS
 *  comment or string are never mistaken for active content (a coordinator's page is
 *  mostly prose):
 *    · `<script`/`<iframe`/`<object` + a tag delimiter — a substring no ordinary word
 *      contains, so these match only an actual element open tag.
 *    · inline `on…=` handlers — anchored to inside a start tag (`<…on…=`); the bare
 *      `\son[a-z]+=` it replaced matched the middle of ordinary words ("prints once =",
 *      "only ="), rejecting innocent files. A real handler is always an attribute in a
 *      tag, so this keeps every true positive and drops the prose false positives.
 *    · `javascript:` URLs — anchored to a URL position (after `=`, a quote, or `(`), so
 *      the word "javascript:" in a comment or sentence is not flagged, while every real
 *      `href="javascript:…"` / `url(javascript:…)` still is. A `\s*` after the anchor
 *      catches the leading-whitespace evasion (browsers trim it) — ` javascript:`. */
const SCRIPT_VECTORS: readonly RegExp[] = [
  /<script[\s/>]/gi,
  /<iframe[\s/>]/gi,
  /<object[\s/>]/gi,
  /<[^>]*\son[a-z]+\s*=/gi,
  /["'(=]\s*javascript:/gi,
];

/** The 1-based line numbers of every active-content vector, ascending and unique.
 *  A coordinator reads these straight off her file to find and delete each one. */
function scriptLineNumbers(html: string): number[] {
  const lines = new Set<number>();
  for (const re of SCRIPT_VECTORS) {
    re.lastIndex = 0;
    for (let m = re.exec(html); m !== null; m = re.exec(html)) {
      // newlines before the match, + 1 → the 1-based line the match sits on.
      lines.add(html.slice(0, m.index).split('\n').length);
      if (m.index === re.lastIndex) re.lastIndex++; // never spin on a zero-width match
    }
  }
  return [...lines].sort((a, b) => a - b);
}

/** Why a frame was rejected — EVERY failing check at once (never fail-fast), so the
 *  upload panel can list them all and the coordinator fixes the file in one pass.
 *  `scriptLines` is empty when no active content was found. */
export interface FrameRejection {
  missingMarker: boolean;
  scriptLines: number[];
}

export type FrameValidation = { ok: true } | { ok: false; rejection: FrameRejection };

/**
 * Validate an uploaded frame's HTML, COLLECTING every failure. Two independent
 * checks: the exercise-slot marker must be present, and no active-content vector may
 * appear (each reported by line number). A file that both lacks the marker and runs a
 * script fails on both — the panel lists each. Rejects rather than sanitising: a
 * rejected upload is a better failure than silently altered markup, and the app ships
 * no HTML sanitiser.
 */
export function validateFrameHtml(html: string): FrameValidation {
  const missingMarker = !html.includes(EXERCISE_SLOT);
  const scriptLines = scriptLineNumbers(html);
  if (missingMarker || scriptLines.length > 0) {
    return { ok: false, rejection: { missingMarker, scriptLines } };
  }
  return { ok: true };
}

function asText(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

/**
 * Render a frame: inject the compiled exercises at {@link EXERCISE_SLOT} FIRST, then
 * substitute the `{{…}}` field placeholders across the surrounding frame — and only
 * the frame, never the injected exercises. Splitting on the marker up front means the
 * placeholder pass that follows runs on the frame segments alone; a `{{…}}` token that
 * happens to appear inside generated exercise content can never be chewed by it.
 * Unknown `{{…}}` tokens render empty (never as literal text). A frame may repeat the
 * marker (e.g. per column) harmlessly. Assumes `frameHtml` has passed
 * {@link validateFrameHtml} (marker present); a frame without it would drop the
 * exercises, which is exactly why upload rejects one.
 */
export function renderWorksheetFrame(
  frameHtml: string,
  placeholders: FramePlaceholders,
  exercisesHtml: string,
): string {
  // Split at the marker first; substitute placeholders on the frame segments only,
  // then rejoin with the raw (unscanned) exercises between them.
  return frameHtml
    .split(EXERCISE_SLOT)
    .map((segment) =>
      segment.replace(PLACEHOLDER_RE, (_match, rawName: string) => {
        const name = rawName.toLowerCase() as FramePlaceholder;
        return KNOWN_PLACEHOLDERS.includes(name) ? asText(placeholders[name]) : '';
      }),
    )
    .join(exercisesHtml);
}
