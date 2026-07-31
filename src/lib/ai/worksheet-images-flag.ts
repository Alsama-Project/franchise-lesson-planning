import 'server-only';

// Emergency KILL-SWITCH for worksheet image generation.
//
// ON by default. Setting WORKSHEET_IMAGES_ENABLED=false in an environment instantly
// disables generation (the generate route returns a clean 503 rather than throwing,
// and never touches the OpenAI key). Any other value (unset, "true", …) keeps it on.
//
// Server-side ONLY — deliberately NOT a NEXT_PUBLIC_* var: this must never be
// inlined into the client bundle. `import 'server-only'` enforces that. Mirrors the
// ad-hoc one-const-plus-one-function pattern of src/lib/editor/doc-flag.ts; the
// value is read from a literal `process.env.WORKSHEET_IMAGES_ENABLED` so there is no
// flag framework here.

export const WORKSHEET_IMAGES_FLAG = 'WORKSHEET_IMAGES_ENABLED' as const;

/** True unless WORKSHEET_IMAGES_ENABLED is explicitly "false" (the kill-switch). */
export function isWorksheetImagesEnabled(): boolean {
  return process.env.WORKSHEET_IMAGES_ENABLED !== 'false';
}
