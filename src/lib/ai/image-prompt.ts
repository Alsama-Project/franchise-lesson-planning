// Pure assembly of the flat prompt string sent to the image model (`gpt-image-1`).
//
// The image API has no system/user split, so the user-supplied brief and the
// composed context stack land in one flat string. This module owns ONLY that
// string assembly — extracted from the route so it can be unit-tested in
// isolation. It performs no I/O and reads nothing off the request; the subject
// name is resolved server-side by the caller and passed in.
//
// The subject is a fact about THIS request, placed beside the brief and above the
// composed stack — never inside the composed instruction documents or the
// precedence ladder. When no subject name is available the sentence (and its
// trailing blank line) is omitted entirely, so the output is byte-identical to a
// brief-only assembly. A missing subject degrades the illustration; it is not
// fail-closed the way `composeContextStack` is.

const BRIEF_HEADER = '━━━ IMAGE BRIEF (what to draw) ━━━';

/**
 * Assemble the flat image prompt: brief header → (optional subject sentence) →
 * the trimmed brief → (optional teacher adjustment) → the composed system stack.
 *
 * `subjectName` is the subject's canonical (English) name, resolved server-side.
 * Null/undefined/blank drops the sentence cleanly — no placeholder, no partial
 * sentence — leaving the exact string a brief-only assembly produces.
 *
 * `instruction` is an optional teacher steer for a regeneration (e.g. "make it
 * simpler"). It sits right under the brief — what to draw, then how the teacher wants
 * it changed — before the composed guidance. Null/undefined/blank drops it cleanly, so
 * a no-instruction assembly is byte-identical to before this parameter existed.
 */
export function assembleImagePrompt({
  brief,
  composedSystem,
  subjectName,
  instruction,
}: {
  brief: string;
  composedSystem: string;
  subjectName?: string | null;
  instruction?: string | null;
}): string {
  const subjectSentence =
    subjectName && subjectName.trim()
      ? `This illustration will appear on a ${subjectName.trim()} worksheet.\n\n`
      : '';
  const adjust =
    instruction && instruction.trim()
      ? `\n\n━━━ TEACHER ADJUSTMENT (apply to this image) ━━━\n${instruction.trim()}`
      : '';
  return `${BRIEF_HEADER}\n${subjectSentence}${brief.trim()}${adjust}\n\n${composedSystem}`;
}
