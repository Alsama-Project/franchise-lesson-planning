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
 * injected. Single-brace on purpose: it is a distinct token from the double-brace
 * field placeholders below, so the "unknown placeholder → empty" pass never eats
 * it. CD authors against this exact token (they are using `{exercises}` as the
 * placeholder); keep the two in lockstep.
 */
export const EXERCISE_SLOT = '{exercises}';

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

/** Patterns rejected on upload — the frame is markup we print verbatim, so any
 *  script vector is a hard failure (reject, never silently strip). Each entry is a
 *  [test, human-readable label] pair; the label goes into the rejection message. */
const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [/<script[\s/>]/i, '<script> tags'],
  [/<iframe[\s/>]/i, '<iframe> tags'],
  [/<object[\s/>]/i, '<object> tags'],
  // Inline event handlers: an on… attribute, e.g. onclick= / onload=. Requires a
  // whitespace boundary before `on` so hyphenated names (data-on-x) don't trip it.
  [/\son[a-z]+\s*=/i, 'inline event handler attributes (on…=)'],
  [/javascript:/i, 'javascript: URLs'],
];

export type FrameValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate an uploaded frame's HTML. Two hard rejections, each with a clear
 * message: the exercise slot marker must be present, and no script vector may
 * appear. Rejects rather than sanitising — a rejected upload is a better failure
 * than silently altered markup, and the app ships no HTML sanitiser.
 */
export function validateFrameHtml(html: string): FrameValidation {
  if (!html.includes(EXERCISE_SLOT)) {
    return {
      ok: false,
      error: `The frame must contain the exercise slot marker ${EXERCISE_SLOT} — that is where the worksheet's exercises are inserted.`,
    };
  }
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(html)) {
      return {
        ok: false,
        error: `The frame cannot contain ${label}. Remove them and upload again — the frame is not sanitised, it is rejected.`,
      };
    }
  }
  return { ok: true };
}

function asText(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

/**
 * Render a frame: substitute every `{{…}}` field placeholder (known → its value,
 * unknown → empty) and inject the compiled exercises HTML at {@link EXERCISE_SLOT}.
 * The exercises are injected LAST so their own content is never re-scanned for
 * placeholders. Assumes `frameHtml` has already passed {@link validateFrameHtml}
 * (so the marker is present); a frame without the marker would drop the exercises,
 * which is exactly why upload rejects one.
 */
export function renderWorksheetFrame(
  frameHtml: string,
  placeholders: FramePlaceholders,
  exercisesHtml: string,
): string {
  const substituted = frameHtml.replace(PLACEHOLDER_RE, (_match, rawName: string) => {
    const name = rawName.toLowerCase() as FramePlaceholder;
    return KNOWN_PLACEHOLDERS.includes(name) ? asText(placeholders[name]) : '';
  });
  // Global-replace the marker so a frame may repeat it (e.g. per column) harmlessly.
  return substituted.split(EXERCISE_SLOT).join(exercisesHtml);
}
