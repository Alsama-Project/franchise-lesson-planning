// Shared zoom constants + helpers for the v3 worksheet page (ported from the
// archived v2 WorksheetBuilder, trimmed to what v3 needs).
//
// Zoom is a VIEW control only: an ephemeral CSS scale on the `.ws-doc-page`
// surface. It changes nothing persisted, compiled, or printed (the print rules
// reset the transform — see globals.css `@media print`). Default is 1.0 (100%);
// v3's page is already `maxWidth: 100%` and shrinks to the pane on its own, so
// there is no fit-to-width mode — Ctrl-0 resets to 100%.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
/** Round to 2dp so button/keyboard steps don't accumulate float drift. */
export const round2 = (z: number) => Math.round(z * 100) / 100;
