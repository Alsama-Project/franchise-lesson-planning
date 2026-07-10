'use client';

// The persistent top toolbar — a SINGLE non-wrapping row. Formatting controls sit
// left (allowed to shrink); the save indicator + the two teal buttons (Resource
// bank, Generate) are pinned right and never shrink. When the pane is dragged too
// narrow to fit everything on one line, the lowest-priority formatting groups
// collapse into a "⋯" overflow menu (measured with a ResizeObserver) rather than
// wrapping to a second row. Always-visible: undo/redo, the style dropdown, B/I/U,
// and the right-hand cluster. First to move into "⋯" as width shrinks: alignment,
// lists, indent, insert (link/image/table), then colour.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  IndentDecrease,
  IndentIncrease,
  Link as LinkIcon,
  ImagePlus,
  Table as TableIcon,
  Library,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { useEditorTick } from './useEditorTick';
import { BRAND, type SaveState } from './theme';
import { TBtn, TSep, BlockStylePicker, ColourPicker, toggleLink } from './toolbarControls';

const ICON = 17;
const MORE_W = 40; // reserved width for the "⋯" button when the menu is shown

// The formatting groups that may collapse into the overflow menu, in their natural
// left-to-right inline order. `insert` = link/image/table.
const OPTIONAL_ORDER = ['colour', 'align', 'lists', 'indent', 'insert'] as const;
type OptionalId = (typeof OPTIONAL_ORDER)[number];
// Which groups survive longest as width shrinks (kept first). The inverse is the
// collapse order: alignment moves out first, then lists, indent, insert, colour.
const KEEP_PRIORITY: OptionalId[] = ['colour', 'insert', 'indent', 'lists', 'align'];
const GROUP_LABEL: Record<OptionalId, string> = {
  colour: 'Colour',
  align: 'Align',
  lists: 'Lists',
  indent: 'Indent',
  insert: 'Insert',
};

/** Shared teal call-to-action style for the Resource bank + Generate pair. */
const tealButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 13px',
  borderRadius: 8,
  border: 'none',
  background: BRAND.teal,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : state === 'error' ? 'Couldn’t save' : '';
  if (!label) return null;
  return (
    <span style={{ fontSize: 12, color: state === 'error' ? BRAND.pink : BRAND.faint, whiteSpace: 'nowrap', paddingInline: 4 }}>
      {label}
    </span>
  );
}

/** The "⋯" overflow button + its dropdown (portalled so the left cluster's
 *  `overflow:hidden` doesn't clip it). */
function OverflowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 240) });
    setOpen((o) => !o);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <TSep />
      <button
        ref={btnRef}
        type="button"
        title="More formatting"
        aria-label="More formatting"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 30,
          height: 30,
          borderRadius: 7,
          border: 'none',
          background: open ? BRAND.creamSoft : 'transparent',
          color: BRAND.ink,
          cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={ICON} />
      </button>
      {open
        ? createPortal(
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onMouseDown={() => setOpen(false)} />
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  zIndex: 61,
                  background: '#fff',
                  border: '1px solid #E7DECF',
                  borderRadius: 12,
                  boxShadow: '0 12px 32px -12px rgba(40,30,20,0.35)',
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minWidth: 200,
                }}
              >
                {children}
              </div>
            </>,
            document.body,
          )
        : null}
    </span>
  );
}

export function Toolbar({
  editor,
  onInsertImage,
  onInsertResource,
  onGenerateAI,
  saveState = 'idle',
}: {
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertResource: () => void;
  onGenerateAI: () => void;
  saveState?: SaveState;
}) {
  useEditorTick(editor);

  const containerRef = useRef<HTMLDivElement>(null);
  const alwaysRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const widths = useRef<{ always: number; right: number; opt: Record<string, number> } | null>(null);
  const [hidden, setHidden] = useState<OptionalId[]>([]);

  const compute = useCallback((containerW: number) => {
    const w = widths.current;
    if (!w) return;
    const rightW = rightRef.current?.offsetWidth ?? w.right;
    const alwaysW = alwaysRef.current?.offsetWidth ?? w.always;
    // Breathing room for container gaps/padding.
    const avail = containerW - rightW - alwaysW - 20;
    const totalOpt = OPTIONAL_ORDER.reduce((s, id) => s + (w.opt[id] ?? 0), 0);
    if (totalOpt <= avail) {
      setHidden((prev) => (prev.length ? [] : prev));
      return;
    }
    const budget = avail - MORE_W;
    const keep = new Set<OptionalId>();
    let used = 0;
    for (const id of KEEP_PRIORITY) {
      const gw = w.opt[id] ?? 0;
      if (used + gw <= budget) {
        used += gw;
        keep.add(id);
      }
    }
    const next = OPTIONAL_ORDER.filter((id) => !keep.has(id));
    setHidden((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
  }, []);

  // Measure natural group widths ONCE (first layout, everything inline), then use
  // the cache to recompute on every width change.
  useLayoutEffect(() => {
    if (!widths.current && alwaysRef.current && rightRef.current) {
      const opt: Record<string, number> = {};
      let ok = true;
      for (const id of OPTIONAL_ORDER) {
        const el = groupRefs.current[id];
        if (!el) {
          ok = false;
          break;
        }
        opt[id] = el.offsetWidth;
      }
      if (ok) widths.current = { always: alwaysRef.current.offsetWidth, right: rightRef.current.offsetWidth, opt };
    }
    if (containerRef.current) compute(containerRef.current.clientWidth);
  });

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      if (containerRef.current && widths.current) compute(containerRef.current.clientWidth);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [compute]);

  if (!editor) return null;
  const e = editor;

  const inList = e.isActive('listItem') || e.isActive('taskItem');
  const doIndent = () => {
    if (e.isActive('taskItem')) e.chain().focus().sinkListItem('taskItem').run();
    else if (e.isActive('listItem')) e.chain().focus().sinkListItem('listItem').run();
    else e.chain().focus().indentBlock().run();
  };
  const doOutdent = () => {
    if (e.isActive('taskItem')) e.chain().focus().liftListItem('taskItem').run();
    else if (e.isActive('listItem')) e.chain().focus().liftListItem('listItem').run();
    else e.chain().focus().outdentBlock().run();
  };

  // The buttons for each collapsible group (no leading separator — the inline
  // wrapper / the menu row adds spacing).
  const groupContent = (id: OptionalId): ReactNode => {
    switch (id) {
      case 'colour':
        return <ColourPicker editor={e} />;
      case 'align':
        return (
          <>
            <TBtn title="Align left" active={e.isActive({ textAlign: 'left' })} onClick={() => e.chain().focus().setTextAlign('left').run()}>
              <AlignLeft size={ICON} />
            </TBtn>
            <TBtn title="Align centre" active={e.isActive({ textAlign: 'center' })} onClick={() => e.chain().focus().setTextAlign('center').run()}>
              <AlignCenter size={ICON} />
            </TBtn>
            <TBtn title="Align right" active={e.isActive({ textAlign: 'right' })} onClick={() => e.chain().focus().setTextAlign('right').run()}>
              <AlignRight size={ICON} />
            </TBtn>
            <TBtn title="Justify" active={e.isActive({ textAlign: 'justify' })} onClick={() => e.chain().focus().setTextAlign('justify').run()}>
              <AlignJustify size={ICON} />
            </TBtn>
          </>
        );
      case 'lists':
        return (
          <>
            <TBtn title="Bulleted list" active={e.isActive('bulletList')} onClick={() => e.chain().focus().toggleBulletList().run()}>
              <List size={ICON} />
            </TBtn>
            <TBtn title="Numbered list" active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={ICON} />
            </TBtn>
            <TBtn title="Checklist" active={e.isActive('taskList')} onClick={() => e.chain().focus().toggleTaskList().run()}>
              <ListChecks size={ICON} />
            </TBtn>
          </>
        );
      case 'indent':
        return (
          <>
            <TBtn title="Decrease indent" onClick={doOutdent}>
              <IndentDecrease size={ICON} />
            </TBtn>
            <TBtn title={inList ? 'Increase indent (nest)' : 'Increase indent'} onClick={doIndent}>
              <IndentIncrease size={ICON} />
            </TBtn>
          </>
        );
      case 'insert':
        return (
          <>
            <TBtn title="Insert link (Ctrl/Cmd-K)" active={e.isActive('link')} onClick={() => toggleLink(e)}>
              <LinkIcon size={ICON} />
            </TBtn>
            <TBtn title="Insert image" onClick={onInsertImage}>
              <ImagePlus size={ICON} />
            </TBtn>
            <TBtn title="Insert table" onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
              <TableIcon size={ICON} />
            </TBtn>
          </>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className="ws-no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 8,
        padding: '6px 8px',
        background: '#FBF8F3',
        border: '1px solid #EFE7DA',
        borderRadius: 12,
      }}
    >
      {/* LEFT — formatting cluster (shrinks; never wraps) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', flexWrap: 'nowrap' }}>
        {/* Always visible: undo/redo · style · B/I/U */}
        <div ref={alwaysRef} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <TBtn title="Undo (Ctrl/Cmd-Z)" onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()}>
            <Undo2 size={ICON} />
          </TBtn>
          <TBtn title="Redo (Ctrl/Cmd-Shift-Z)" onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()}>
            <Redo2 size={ICON} />
          </TBtn>
          <TSep />
          <BlockStylePicker editor={e} />
          <TSep />
          <TBtn title="Bold (Ctrl/Cmd-B)" active={e.isActive('bold')} onClick={() => e.chain().focus().toggleBold().run()}>
            <Bold size={ICON} />
          </TBtn>
          <TBtn title="Italic (Ctrl/Cmd-I)" active={e.isActive('italic')} onClick={() => e.chain().focus().toggleItalic().run()}>
            <Italic size={ICON} />
          </TBtn>
          <TBtn title="Underline (Ctrl/Cmd-U)" active={e.isActive('underline')} onClick={() => e.chain().focus().toggleUnderline().run()}>
            <Underline size={ICON} />
          </TBtn>
        </div>

        {/* Collapsible groups (inline unless moved into the overflow menu) */}
        {OPTIONAL_ORDER.map((id) =>
          hidden.includes(id) ? null : (
            <span
              key={id}
              ref={(el) => {
                groupRefs.current[id] = el;
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
            >
              <TSep />
              {groupContent(id)}
            </span>
          ),
        )}

        {hidden.length ? (
          <OverflowMenu>
            {hidden.map((id) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.faint, width: 52, flexShrink: 0 }}>{GROUP_LABEL[id]}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{groupContent(id)}</div>
              </div>
            ))}
          </OverflowMenu>
        ) : null}
      </div>

      {/* RIGHT — save state + the teal pair (never shrink) */}
      <div ref={rightRef} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <SaveIndicator state={saveState} />
        <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={onInsertResource} title="Insert a shared resource from the bank" style={tealButton}>
          <Library size={15} />
          Resource bank
        </button>
        <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={onGenerateAI} title="Generate a resource with AI" style={tealButton}>
          <Sparkles size={15} />
          Generate
        </button>
      </div>
    </div>
  );
}
