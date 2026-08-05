'use client';

// The LIVE renderer for a parsed page frame: the Alsama page furniture (masthead,
// objective, lesson title, footer) rendered around the worksheet editor, from the
// subject's uploaded frame or the built-in default.
//
// This is one of the two renderers over a single parsed frame (see
// `lib/worksheet-frame/parse.ts`). Here — the review/print surface — there is no
// exercises HTML string: the contenteditable IS the content. So `{{exercises}}`
// resolves to a SENTINEL element, and the editor is portalled into it. The other
// renderer (read-only / PDF, a separate branch) feeds serialized exercises HTML to the
// same `renderWorksheetFrame` string helper.
//
// Why a portal, not string-splitting: the marker sits inside nested elements
// (`<main class="body">…</main>`), so splitting the HTML at it would produce
// unbalanced markup. Instead the frame body is set as innerHTML with the marker
// replaced by `<div data-ws-exercises>`, and React portals the editor into that node.
//
// The frame markup mounts INSIDE `.ws-doc-page` (this component's output is the page's
// inner), so it rides the zoom transform on `.ws-doc-page` and inherits the existing
// `.ws-print-area` print path — the scale is never moved off `.ws-doc-page`.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  renderWorksheetFrame,
  EXERCISE_SENTINEL_HTML,
  EXERCISE_SENTINEL_ATTR,
  FRAME_ROOT_CLASS,
  type FramePlaceholders,
  type ParsedFrame,
} from '@/lib/worksheet-frame/frame';

export function WorksheetFramePage({
  frame,
  placeholders,
  children,
}: {
  frame: ParsedFrame;
  placeholders: FramePlaceholders;
  /** The editor surface to mount at the frame's `{{exercises}}` marker. */
  children: ReactNode;
}) {
  // Substitute the field placeholders and drop a sentinel where the exercises go —
  // the SAME `renderWorksheetFrame` the print/PDF renderer uses, only the "exercises"
  // argument differs (a sentinel here, serialized HTML there). Memoised so the
  // innerHTML string is referentially stable across unrelated re-renders (zoom, save
  // state, gutter busy): React then never re-sets innerHTML, and the portal host node
  // — and the editor inside it — stay put. It only changes when a placeholder value
  // does (e.g. the teacher edits the objective in Step 1).
  const bodyHtml = useMemo(
    () => renderWorksheetFrame(frame.bodyHtml, placeholders, EXERCISE_SENTINEL_HTML),
    [frame.bodyHtml, placeholders],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  // After the frame body is committed to the DOM, find the sentinel and portal the
  // editor into it. Re-runs when `bodyHtml` changes (React replaces the innerHTML, so
  // the sentinel node identity changes with it).
  useLayoutEffect(() => {
    const el = rootRef.current?.querySelector(`[${EXERCISE_SENTINEL_ATTR}]`);
    setMount(el instanceof HTMLElement ? el : null);
  }, [bodyHtml]);

  return (
    <>
      {/* The frame's scoped CSS + hoisted @page. A <style> in the tree is inert to
          layout and its rules (scoped to .ws-frame-root, plus @page) apply document-
          wide — so the frame's page size/margins win in print while it is active. */}
      <style dangerouslySetInnerHTML={{ __html: frame.css }} />
      <div
        ref={rootRef}
        className={FRAME_ROOT_CLASS}
        dir={frame.dir}
        lang={frame.lang}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {mount ? createPortal(children, mount) : null}
    </>
  );
}
