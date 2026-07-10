// Feature flag for the continuous-document worksheet editor (v3).
//
// ON by default — the document editor is the live worksheet surface. The env var
// is now an emergency KILL-SWITCH: set NEXT_PUBLIC_WORKSHEET_DOC_EDITOR=false in an
// environment to instantly fall back to the archived v2 block builder (no code
// change / revert needed). Any other value (unset, "true", …) keeps the new editor.
//
// It is a NEXT_PUBLIC_ var so the client bundle can read it (the editor mounts in
// the browser). Because the value is inlined at build time, a literal
// `process.env.NEXT_PUBLIC_WORKSHEET_DOC_EDITOR` read is used (Next replaces it
// statically; a computed key would not be inlined).

export const WORKSHEET_DOC_EDITOR_FLAG = 'NEXT_PUBLIC_WORKSHEET_DOC_EDITOR' as const;

/** True when the document editor is active (the default). Only an explicit
 *  `NEXT_PUBLIC_WORKSHEET_DOC_EDITOR=false` disables it (the kill-switch). */
export function isWorksheetDocEditorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORKSHEET_DOC_EDITOR !== 'false';
}
