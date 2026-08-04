'use client';

// The per-exercise Regenerate affordance, as a ProseMirror widget decoration in the
// left gutter of each exercise range.
//
// It follows the image control bar's model: an OVERLAY, not document content. A
// widget decoration is never part of the doc, so it is absent from `getJSON()`,
// `generateHTML`, print and PDF — nothing to strip, and it cannot leak onto a
// student's sheet (the wrapper also carries `ws-no-print`). One button is drawn at
// the FIRST top-level node carrying each `exerciseId`; clicking it asks the host to
// regenerate that exercise. Placement/tracking is ProseMirror's job — the widget
// rides the node through edits, scroll and the zoom transform for free.
//
// BRIDGE TO REACT: the extension's `storage` holds the live handler, the busy set and
// the button label. `DocumentWorksheet` refreshes them each render and dispatches a
// redraw (a meta-only, doc-unchanged transaction — no autosave) when `busy` changes,
// so the disabled/spinner state re-renders. The widget reads `storage` at click time,
// so a stale closure can never fire the wrong handler.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { nodeExerciseId } from '@/lib/ai/worksheet-assemble';

export interface ExerciseGutterStorage {
  /** Ask the host to regenerate an exercise by id. Null until the host wires it. */
  onRegenerate: ((exerciseId: string) => void) | null;
  /** Ids currently regenerating — their buttons render disabled with a spinner. */
  busy: Set<string>;
  /** Localised button title/aria-label (teacher UI locale). */
  title: string;
}

export const exerciseGutterKey = new PluginKey('exerciseGutter');

/** A meta flag the host sets on a doc-unchanged transaction to force a redraw. */
export const EXERCISE_GUTTER_REDRAW = 'exerciseGutterRedraw';

const REGEN_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const SPINNER_SVG =
  '<svg class="ws-ex-regen-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';

export const ExerciseGutter = Extension.create<Record<string, never>, ExerciseGutterStorage>({
  name: 'exerciseGutter',

  addStorage() {
    return { onRegenerate: null, busy: new Set<string>(), title: 'Regenerate' };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: exerciseGutterKey,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const seen = new Set<string>();
            let pos = 0;
            state.doc.forEach((node) => {
              // A PM node exposes `.attrs` just like the JSON shape, so read it
              // directly — no per-keystroke toJSON allocation over the whole doc.
              const id = nodeExerciseId(node);
              if (id && !seen.has(id)) {
                seen.add(id);
                const busy = storage.busy.has(id);
                decos.push(
                  Decoration.widget(
                    pos,
                    () => {
                      const wrap = document.createElement('div');
                      wrap.className = 'ws-ex-gutter ws-no-print';
                      wrap.contentEditable = 'false';
                      const btn = document.createElement('button');
                      btn.type = 'button';
                      btn.className = 'ws-ex-regen';
                      btn.title = storage.title;
                      btn.setAttribute('aria-label', storage.title);
                      btn.setAttribute('data-exercise-id', id);
                      btn.disabled = busy;
                      btn.innerHTML = busy ? SPINNER_SVG : REGEN_SVG;
                      btn.addEventListener('mousedown', (e) => e.preventDefault());
                      btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (!storage.busy.has(id)) storage.onRegenerate?.(id);
                      });
                      wrap.appendChild(btn);
                      return wrap;
                    },
                    // `side: -1` associates the widget before the node so typing at the
                    // node's start lands after it; the busy flag in `key` swaps the DOM
                    // when state changes; `ignoreSelection` keeps caret logic untouched.
                    { side: -1, key: `exg:${id}:${busy ? 1 : 0}`, ignoreSelection: true },
                  ),
                );
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
