'use client';

// The LIVE renderer for a parsed page frame: the Alsama page furniture (masthead,
// objective, lesson title, footer) rendered around the worksheet editor, from the
// subject's uploaded frame or the built-in default.
//
// This is one of the two renderers over a single parsed frame (see
// `lib/worksheet-frame/parse.ts`). Here — the review/print surface — there is no
// exercises HTML string: the contenteditable IS the content. So `{{exercises}}` becomes
// a genuine React CHILD in the tree. The other renderer (read-only / PDF) feeds
// serialized exercises HTML to the same `renderWorksheetFrame` string helper.
//
// Why React elements, NOT innerHTML + a portal: an earlier version set the frame body
// via `dangerouslySetInnerHTML`, found the `{{exercises}}` sentinel with a layout effect
// and `createPortal`ed the editor into it. That fails — the state update to store the
// mount node re-renders the container, React re-applies the innerHTML and REPLACES the
// sentinel, and the portal keeps rendering into the now-detached original node (verified:
// post-commit the captured node is disconnected, holds the editor, while a fresh empty
// sentinel is live). So the editor never appears on the page. Parsing the body to real
// React elements removes the failure mode outright: the editor is a normal child, no
// innerHTML for the body, no portal, no sentinel node to go stale.
//
// The parse (html-react-parser) maps class→className, style strings→objects, void
// elements and text nodes, and every other DOM/React attribute divergence. It is
// memoised on the frame HTML ALONE; the live editor is threaded in through context, so a
// keystroke (which changes `children`'s identity) re-renders only the exercises slot,
// never the surrounding frame furniture.
//
// The frame markup mounts INSIDE `.ws-doc-page` (this component's output is the page's
// inner), so it rides the zoom transform on `.ws-doc-page` and inherits the existing
// `.ws-print-area` print path — the scale is never moved off `.ws-doc-page`.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import parse, { Element as ParserElement, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import {
  renderWorksheetFrame,
  EXERCISE_SENTINEL_HTML,
  EXERCISE_SENTINEL_ATTR,
  FRAME_ROOT_CLASS,
  type FramePlaceholders,
  type ParsedFrame,
} from '@/lib/worksheet-frame/frame';

// Carries the live editor surface to the exercises slot. Threading it through context
// (rather than baking it into the parsed tree) is what lets the tree be memoised on the
// frame HTML alone: a changing `children` re-renders only the consumer below, never the
// frame furniture around it.
const ExercisesContext = createContext<ReactNode>(null);
function ExercisesSlot() {
  return <>{useContext(ExercisesContext)}</>;
}

/** True for the `<div data-ws-exercises>` sentinel `renderWorksheetFrame` leaves where
 *  `{{exercises}}` was — the one node we swap for the live editor. */
function isExerciseSentinel(node: DOMNode): boolean {
  return node instanceof ParserElement && node.attribs?.[EXERCISE_SENTINEL_ATTR] !== undefined;
}

export function WorksheetFramePage({
  frame,
  placeholders,
  children,
}: {
  frame: ParsedFrame;
  placeholders: FramePlaceholders;
  /** The editor surface to render at the frame's `{{exercises}}` marker. */
  children: ReactNode;
}) {
  // Substitute the field placeholders and drop a sentinel ELEMENT where the exercises go
  // — the SAME `renderWorksheetFrame` the print/PDF renderer uses, only the "exercises"
  // argument differs (a sentinel element here, serialized HTML there). Memoised so it is
  // stable across unrelated re-renders (zoom, save state, gutter busy); it changes only
  // when a placeholder value does (e.g. the teacher edits the objective in Step 1).
  const bodyHtml = useMemo(
    () => renderWorksheetFrame(frame.bodyHtml, placeholders, EXERCISE_SENTINEL_HTML),
    [frame.bodyHtml, placeholders],
  );

  // Parse the frame body into real React elements, swapping the sentinel for the live
  // editor slot. Memoised on `bodyHtml` ONLY — `children` flows in via context — so a
  // keystroke never re-parses or re-renders the frame.
  const tree = useMemo(() => {
    const options: HTMLReactParserOptions = {
      replace: (node) => (isExerciseSentinel(node) ? <ExercisesSlot key="ws-exercises" /> : undefined),
    };
    return parse(bodyHtml, options);
  }, [bodyHtml]);

  return (
    <>
      {/* The frame's scoped CSS + hoisted @page. A <style> in the tree is inert to
          layout and its rules (scoped to .ws-frame-root, plus @page) apply document-
          wide — so the frame's page size/margins win in print while it is active. */}
      <style dangerouslySetInnerHTML={{ __html: frame.css }} />
      <ExercisesContext.Provider value={children}>
        <div className={FRAME_ROOT_CLASS} dir={frame.dir} lang={frame.lang}>
          {tree}
        </div>
      </ExercisesContext.Provider>
    </>
  );
}
