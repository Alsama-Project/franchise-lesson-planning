// Feature flag for the continuous-document worksheet editor (v3).
//
// OFF by default. It is a NEXT_PUBLIC_ var so the client bundle can read it (the
// editor mounts in the browser). Enable it for a specific Vercel PREVIEW deployment
// by setting NEXT_PUBLIC_WORKSHEET_DOC_EDITOR=true in that environment ONLY — never
// in production until sign-off. Because the value is inlined at build time, a
// literal `process.env.NEXT_PUBLIC_WORKSHEET_DOC_EDITOR` read is used (Next replaces
// it statically; a computed key would not be inlined).

export const WORKSHEET_DOC_EDITOR_FLAG = 'NEXT_PUBLIC_WORKSHEET_DOC_EDITOR' as const;

/** True when the document editor should replace the v2 block builder. */
export function isWorksheetDocEditorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORKSHEET_DOC_EDITOR === 'true';
}
