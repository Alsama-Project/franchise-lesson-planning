'use client';

// The APP-DEFAULT print page setup, for the worksheet surfaces that have NO uploaded
// page frame (the hand-built DocMasthead/DocFooter scaffold and the archived v2
// print view). It is emitted as a `<style>` on those surfaces ONLY — never on the
// frame path — so that when a subject's page frame is active, the FRAME's own hoisted
// `@page` is the single page rule in the document. Two `@page` rules used to paint two
// page numbers (the app's `@bottom-right` and the frame's `@bottom-center`); keeping
// the app's `@page` out of the frame path removes that competition outright.
//
// `margin: 0` is deliberate and load-bearing: with no page margin the browser has
// nowhere to render its OWN header/footer (URL, date, title, page count), so they
// never print — no per-teacher "untick Headers and footers" ritual on a shared
// machine. The visual page margins move into the surface's own content padding.

/** The app-default page box: A4 portrait, no margin (so browser chrome has nowhere to
 *  land). Visual margins are supplied by the surface's content padding, not here. */
export const APP_PRINT_PAGE_CSS = '@page { size: A4 portrait; margin: 0; }';

/** Emit the app-default `@page`. Render on non-frame print surfaces only; the frame
 *  path supplies its own `@page` and must stay the sole page rule. */
export function PrintPageStyle() {
  return <style dangerouslySetInnerHTML={{ __html: APP_PRINT_PAGE_CSS }} />;
}
