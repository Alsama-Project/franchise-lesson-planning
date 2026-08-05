'use client';

// The per-exercise Regenerate affordance, as a ProseMirror widget decoration.
//
// It follows the image control bar's model: an OVERLAY, not document content. A widget
// decoration is never part of the doc, so it is absent from `getJSON()`, `generateHTML`,
// print and PDF — nothing to strip, and it cannot leak onto a student's sheet (the
// wrapper also carries `ws-no-print`). One LABELLED teal chip is drawn at the top of the
// FIRST top-level node carrying each `exerciseId`, INSIDE the page (top-right of the
// block, not out in the margin). It is revealed when the pointer is over THAT exercise —
// not merely somewhere on the page — via lightweight hover tracking (see
// `handleDOMEvents`). Clicking it asks the host to open the regenerate comment popover.
//
// BRIDGE TO REACT: the extension's `storage` holds the live handler, the busy set, the
// label and the currently-hovered exercise id. `DocumentWorksheet` refreshes handler /
// busy / title each render and dispatches a redraw (a meta-only, doc-unchanged
// transaction — no autosave) when `busy` changes; the hover tracking dispatches the same
// redraw when the hovered exercise changes. The widget reads `storage` at click time, so
// a stale closure can never fire the wrong handler.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { nodeExerciseId } from '@/lib/ai/worksheet-assemble';

export interface ExerciseGutterStorage {
  /** Ask the host to regenerate an exercise by id (opens the comment popover). Null
   *  until the host wires it. */
  onRegenerate: ((exerciseId: string) => void) | null;
  /** Ids currently regenerating — their chips render disabled with a spinner. */
  busy: Set<string>;
  /** Localised chip label / aria-label (teacher UI locale). */
  title: string;
  /** The exercise currently under the pointer, so only its chip is revealed. */
  hoveredId: string | null;
}

export const exerciseGutterKey = new PluginKey('exerciseGutter');

/** A meta flag the host (and hover tracking) set on a doc-unchanged transaction to
 *  force the decorations to recompute. */
export const EXERCISE_GUTTER_REDRAW = 'exerciseGutterRedraw';

const REGEN_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const SPINNER_SVG =
  '<svg class="ws-ex-regen-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';

/** The exercise id of the top-level node under the given viewport point, or null. */
function exerciseIdAtCoords(view: EditorView, clientX: number, clientY: number): string | null {
  const found = view.posAtCoords({ left: clientX, top: clientY });
  if (!found) return null;
  const pos = found.pos;
  let acc = 0;
  let result: string | null = null;
  view.state.doc.forEach((node) => {
    const start = acc;
    const end = acc + node.nodeSize;
    if (result === null && pos >= start && pos < end) result = nodeExerciseId(node);
    acc = end;
  });
  return result;
}

export const ExerciseGutter = Extension.create<Record<string, never>, ExerciseGutterStorage>({
  name: 'exerciseGutter',

  addStorage() {
    return { onRegenerate: null, busy: new Set<string>(), title: 'Regenerate', hoveredId: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    /** Recompute which exercise the pointer is over; redraw only when it changes. */
    const track = (view: EditorView, clientX: number, clientY: number) => {
      const id = exerciseIdAtCoords(view, clientX, clientY);
      if (storage.hoveredId !== id) {
        storage.hoveredId = id;
        view.dispatch(view.state.tr.setMeta(EXERCISE_GUTTER_REDRAW, true).setMeta('preventUpdate', true));
      }
    };
    const clear = (view: EditorView) => {
      if (storage.hoveredId !== null) {
        storage.hoveredId = null;
        view.dispatch(view.state.tr.setMeta(EXERCISE_GUTTER_REDRAW, true).setMeta('preventUpdate', true));
      }
    };

    return [
      new Plugin({
        key: exerciseGutterKey,
        props: {
          handleDOMEvents: {
            // Track the hovered exercise so its chip (and only its chip) is revealed.
            // Skip while a button is held (a drag / selection) so a redraw never
            // disrupts it.
            mousemove(view, event) {
              if (event.buttons === 0) track(view, event.clientX, event.clientY);
              return false;
            },
            mouseleave(view) {
              clear(view);
              return false;
            },
          },
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
                const active = storage.hoveredId === id;
                decos.push(
                  Decoration.widget(
                    pos,
                    () => {
                      const wrap = document.createElement('div');
                      wrap.className =
                        'ws-ex-gutter ws-no-print' + (busy ? ' is-busy' : '') + (active ? ' is-active' : '');
                      wrap.contentEditable = 'false';
                      const btn = document.createElement('button');
                      btn.type = 'button';
                      btn.className = 'ws-ex-regen';
                      btn.title = storage.title;
                      btn.setAttribute('aria-label', storage.title);
                      btn.setAttribute('data-exercise-id', id);
                      btn.disabled = busy;
                      btn.innerHTML = busy ? SPINNER_SVG : REGEN_SVG;
                      const label = document.createElement('span');
                      label.className = 'ws-ex-regen-label';
                      label.textContent = storage.title;
                      btn.appendChild(label);
                      btn.addEventListener('mousedown', (e) => e.preventDefault());
                      btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (!storage.busy.has(id)) storage.onRegenerate?.(id);
                      });
                      wrap.appendChild(btn);
                      return wrap;
                    },
                    // `side: -1` associates the widget before the node so typing at the
                    // node's start lands after it; the busy + active flags in `key` swap
                    // the DOM when state changes; `ignoreSelection` keeps caret logic
                    // untouched.
                    { side: -1, key: `exg:${id}:${busy ? 1 : 0}:${active ? 1 : 0}`, ignoreSelection: true },
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
