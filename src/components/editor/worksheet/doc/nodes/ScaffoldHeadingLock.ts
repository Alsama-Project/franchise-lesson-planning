'use client';

// Makes the scaffold SECTION headings read-only — the one exception to "everything is
// editable". Compile stamps `wsScaffold: true` on every heading it takes from the
// subject's template (see `assembleWorksheetDoc`), and `template_anchor` matching keys
// off that heading's exact text; so retyping one would silently move its exercise on
// the next compile. This plugin prevents that WITHOUT a cursor trap:
//
//   • It is a `filterTransaction`, not `contentEditable=false`. The caret still enters
//     the heading, selection and copy still work, and — crucially — a paragraph can be
//     inserted directly above or below it. Only a transaction that would CHANGE a
//     scaffold heading's text (or remove one) is rejected.
//   • It leaves EXERCISE headings (`wsCompiled`) and TEACHER-authored headings (neither
//     marker) fully editable — the lock keys off `wsScaffold` alone.
//   • The cream styling on `.ws-scaffold-heading` (globals.css) signals the heading is
//     system-provided and fixed, so a rejected keystroke reads as "this is fixed", not
//     "this is broken".
//
// Detection is by TEXT MULTISET, not a per-keystroke range walk: a transaction passes
// iff the set of scaffold-heading texts is unchanged. This is why it needs no fragile
// step-range mapping and why a programmatic rebuild that reproduces the same headings
// passes untouched. Genuine programmatic writes that DO change the scaffold (a compile
// after a coordinator edited the template) carry the `SCAFFOLD_LOCK_BYPASS` meta.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

/** Meta flag a programmatic write (applyFullDoc build, per-exercise splice) sets so the
 *  lock never rejects it — the teacher is not the author of that change. */
export const SCAFFOLD_LOCK_BYPASS = 'scaffoldLockBypass';

export const scaffoldHeadingLockKey = new PluginKey('scaffoldHeadingLock');

/** A template section heading — the only kind this lock protects. */
function isScaffoldHeading(node: PMNode): boolean {
  return node.type.name === 'heading' && node.attrs?.wsScaffold === true;
}

/** Trimmed text of every top-level scaffold heading, in document order. */
function scaffoldHeadingTexts(doc: PMNode): string[] {
  const texts: string[] = [];
  doc.forEach((node) => {
    if (isScaffoldHeading(node)) texts.push(node.textContent.trim());
  });
  return texts;
}

/** True when two string lists hold the same values regardless of order. */
function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export const ScaffoldHeadingLock = Extension.create({
  name: 'scaffoldHeadingLock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: scaffoldHeadingLockKey,

        // Reject a transaction that changes any scaffold heading's text (or drops one).
        // Typing elsewhere, and inserting a paragraph directly above/below a heading,
        // leave the heading multiset unchanged and pass.
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          if (tr.getMeta(SCAFFOLD_LOCK_BYPASS)) return true;
          const before = scaffoldHeadingTexts(state.doc);
          if (before.length === 0) return true;
          return sameMultiset(before, scaffoldHeadingTexts(tr.doc));
        },

        props: {
          // A node decoration marks each scaffold heading so globals.css can render it
          // as system-provided/fixed (cream, a small lock glyph). Purely visual.
          decorations(state) {
            const decos: Decoration[] = [];
            let pos = 0;
            state.doc.forEach((node) => {
              if (isScaffoldHeading(node)) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ws-scaffold-heading' }));
              }
              pos += node.nodeSize;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
