// Makes the `wsCompiled` idempotency marker survive tiptap serialisation.
//
// `compileWorksheet` (lib/actions/worksheet-compile.ts) stamps every top-level node
// it inserts with `attrs.wsCompiled = true`, so a later compile can strip its own
// prior output (`stripCompiled` → `isCompiled`, a strict `=== true` check) and
// re-fill the bare scaffold instead of stacking a second copy of every exercise.
// The tag is written straight into the JSONB, never through tiptap.
//
// The problem this fixes: `wsCompiled` is not declared by any extension, and
// `editor.getJSON()` drops every undeclared attribute. So a single keystroke in the
// document editor re-serialises the whole doc and strips the tag from every node —
// the next compile then recognises none of its own output, leaves the edited copies
// in place, and appends a fresh compiled copy of every exercise. Silent, unbounded
// duplication.
//
// Like `HintPlaceholder`, this extension only DECLARES the attribute (as a global
// attribute across every node type that can be a direct child of `doc`) so it
// round-trips through `getJSON`. It is an INTERNAL marker:
//   • `renderHTML` returns `{}` UNCONDITIONALLY — it must never reach printed HTML
//     or the PDF (omitting `renderHTML` would make tiptap emit `wscompiled="true"`).
//   • no `parseHTML` — the tag arrives via JSON, never a DOM parse.
//   • `default: false`, so untagged teacher-authored nodes stay untagged through a
//     round trip and `isCompiled`'s `=== true` reads them as untagged.
//   • `keepOnSplit: false`, so splitting a compiled paragraph does not silently tag
//     the new one.
//
// No commands: nothing in the app sets this via tiptap — only compile writes it.

import { Extension } from '@tiptap/core';

/**
 * Every node type that can appear as a DIRECT CHILD of `doc` in either worksheet
 * bundle — i.e. every node compile can tag at top level. Derived by enumerating
 * `doc.contentMatch`-accepted node types from `worksheetDocExtensions` (the wider
 * bundle; it is a superset of `worksheetEditorExtensions`), NOT from a hand-written
 * list. `image` covers `ResizableImage` (same node name). Nested-only nodes
 * (`listItem`, `tableRow`/`tableHeader`/`tableCell`, `taskItem`) are excluded —
 * compile only ever tags top-level nodes.
 *
 * A type absent from a given schema (e.g. `table` in the print bundle) is a harmless
 * no-op, so this one list serves both bundles.
 */
export const WS_COMPILED_MARKER_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'image',
  'caption',
  'pageBreak',
  'resourceRef',
  'table',
  'taskList',
] as const;

export const WsCompiledMarker = Extension.create({
  name: 'wsCompiledMarker',

  addGlobalAttributes() {
    return [
      {
        types: [...WS_COMPILED_MARKER_TYPES],
        attributes: {
          wsCompiled: {
            default: false,
            // Splitting a compiled block (Enter mid-paragraph) must not tag the new
            // sibling — the split-off node is teacher content, not compile output.
            keepOnSplit: false,
            // Internal marker only: emit nothing to the DOM, so print / PDF /
            // `generateHTML` output is byte-identical to an undeclared attribute.
            renderHTML: () => ({}),
          },
          // The exercise-identity marker (see EXERCISE_ID_ATTR in worksheet-assemble).
          // Declared exactly like `wsCompiled` so a per-exercise regenerate can find an
          // exercise's nodes after any number of `getJSON()` round trips. keepOnSplit
          // is false BY DESIGN: a teacher splitting a paragraph inside an exercise
          // produces an id-less second half — her content, outside the exercise range,
          // never replaced by a later regenerate.
          exerciseId: {
            default: null,
            keepOnSplit: false,
            renderHTML: () => ({}),
          },
          // The scaffold-heading marker: compile stamps `wsScaffold: true` on every
          // heading it takes from the subject's template scaffold (see
          // `assembleWorksheetDoc`). It POSITIVELY distinguishes a template section
          // heading — which `ScaffoldHeadingLock` makes read-only so retyping it can't
          // silently break `template_anchor` matching — from an EXERCISE heading
          // (`wsCompiled`) and a TEACHER-authored heading (neither marker), both of
          // which stay freely editable. Declared like the others: round-trips through
          // getJSON, emits nothing to the DOM. keepOnSplit false so splitting off a new
          // block below a heading does not inherit the lock.
          wsScaffold: {
            default: false,
            keepOnSplit: false,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});
