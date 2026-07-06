'use client';

// The Word-like formatting toolbar. It lives in the editor *chrome* (always
// rendered at 100%, never zoom-scaled) and reads left→right exactly like Word:
// paragraph style → font size → B / I / U → colour → align → lists → insert group
// (image, text box, table).
//
// Formatting controls act on the currently-active block's tiptap editor (the last
// Free block / text box that held focus) and disable when none is active. The
// insert controls are document-level (drop a floating image or text box onto the
// page) and stay enabled regardless. Toolbar buttons keep the editor's selection
// alive by preventing the mousedown default, so a chain().focus() command still
// lands on the right block.

import { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Editor } from '@tiptap/react';

const TEAL_TEXT = '#186155';
const TEAL_TINT = '#E4F0ED';
const PINK = '#B62A5C';

/** Re-render the toolbar whenever the active editor's selection/content changes. */
function useEditorTick(editor: Editor | null) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const update = () => force();
    editor.on('transaction', update);
    editor.on('selectionUpdate', update);
    editor.on('focus', update);
    editor.on('blur', update);
    return () => {
      editor.off('transaction', update);
      editor.off('selectionUpdate', update);
      editor.off('focus', update);
      editor.off('blur', update);
    };
  }, [editor]);
}

/** A 30×30 square toolbar button with an active (teal) state. */
function IconButton({
  active,
  onClick,
  title,
  inert,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  title: string;
  inert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={inert}
      onMouseDown={(e) => e.preventDefault()}
      onClick={inert ? undefined : onClick}
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: 'none',
        cursor: inert ? 'default' : 'pointer',
        background: active ? TEAL_TINT : 'transparent',
        color: active ? TEAL_TEXT : '#2A2422',
        opacity: inert ? 0.4 : 1,
        font: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 16, background: '#ECE4D7', margin: '0 2px' }} />;
}

// Order matches the dropdown; the i18n key resolves the label and the level
// drives tiptap. Comparison uses the level (not the localized label) so the
// active row is correct in any locale.
const HEADING_OPTIONS = [
  { key: 'heading1', level: 1 as const },
  { key: 'heading2', level: 2 as const },
  { key: 'paragraph', level: 0 as const },
] as const;

const pillStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 500,
  color: '#2A2422',
  background: '#FBF8F3',
  border: '1px solid #E7DECF',
  borderRadius: 6,
  padding: '3px 8px',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  font: 'inherit',
});

/** A generic dropdown pill (used by the heading + font-size controls). */
function DropdownPill({
  label,
  disabled,
  width,
  children,
}: {
  label: React.ReactNode;
  disabled: boolean;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={pillStyle(disabled)}
      >
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#A79E94" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && !disabled ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            insetInlineStart: 0,
            background: '#fff',
            border: '1px solid #E7DECF',
            borderRadius: 9,
            boxShadow: '0 16px 40px -16px rgba(40,30,20,0.5)',
            padding: 5,
            zIndex: 30,
            minWidth: width ?? 140,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function menuItemStyle(activeItem: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    fontSize: 12.5,
    fontWeight: activeItem ? 600 : 500,
    color: activeItem ? TEAL_TEXT : '#2A2422',
    background: activeItem ? TEAL_TINT : 'transparent',
    border: 'none',
    borderRadius: 6,
    padding: '7px 9px',
    cursor: 'pointer',
    font: 'inherit',
  };
}

function HeadingDropdown({ editor }: { editor: Editor | null }) {
  const t = useTranslations('worksheet');
  const currentLevel: 0 | 1 | 2 = editor?.isActive('heading', { level: 1 })
    ? 1
    : editor?.isActive('heading', { level: 2 })
      ? 2
      : 0;

  const apply = (level: 0 | 1 | 2) => {
    if (!editor) return;
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level }).run();
  };

  const labelFor = (key: string) => t(`toolbar.${key}`);
  const currentKey = HEADING_OPTIONS.find((o) => o.level === currentLevel)?.key ?? 'paragraph';

  return (
    <DropdownPill label={labelFor(currentKey)} disabled={!editor}>
      {(close) =>
        HEADING_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              apply(opt.level);
              close();
            }}
            style={menuItemStyle(currentLevel === opt.level)}
          >
            {labelFor(opt.key)}
          </button>
        ))
      }
    </DropdownPill>
  );
}

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 17, 18, 20, 24, 28, 32, 40, 48];
const DEFAULT_FONT_SIZE = 17; // matches the .worksheet-doc base size

function FontSizeDropdown({ editor }: { editor: Editor | null }) {
  const raw = editor?.getAttributes('textStyle')?.fontSize as string | undefined;
  const current = raw ? parseInt(raw, 10) : DEFAULT_FONT_SIZE;

  return (
    <DropdownPill label={String(current)} disabled={!editor} width={86}>
      {(close) =>
        FONT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor?.chain().focus().setFontSize(`${size}px`).run();
              close();
            }}
            style={menuItemStyle(current === size)}
          >
            {size}
          </button>
        ))
      }
    </DropdownPill>
  );
}

export function WordToolbar({
  editor,
  canInsert,
  onInsertImage,
  onInsertTextBox,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  /** The active block's editor, or null when no block is focused. */
  editor: Editor | null;
  /** Whether a block is active to receive an inserted element. */
  canInsert: boolean;
  /** Insert a floating image into the active block. */
  onInsertImage: () => void;
  /** Insert a floating text box into the active block. */
  onInsertTextBox: () => void;
  /** Worksheet-level undo / redo (covers text edits AND block ops). */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const t = useTranslations('worksheet');
  useEditorTick(editor);
  const disabled = !editor;
  const colorActive = editor?.isActive('textStyle', { color: PINK }) ?? false;
  const run = (fn: (e: Editor) => void) => () => {
    if (editor) fn(editor);
  };

  return (
    <div
      className="ws-no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Undo / redo — worksheet-level, so they work even when no block is
          focused (e.g. to reverse an add/remove/reorder). */}
      <IconButton title={t('toolbar.undo')} inert={!canUndo} onClick={onUndo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" />
        </svg>
      </IconButton>
      <IconButton title={t('toolbar.redo')} inert={!canRedo} onClick={onRedo}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" />
        </svg>
      </IconButton>

      <Divider />

      <HeadingDropdown editor={editor} />
      <FontSizeDropdown editor={editor} />

      <Divider />

      <IconButton title={t('toolbar.bold')} inert={disabled} active={editor?.isActive('bold')} onClick={run((e) => e.chain().focus().toggleBold().run())}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>B</span>
      </IconButton>
      <IconButton title={t('toolbar.italic')} inert={disabled} active={editor?.isActive('italic')} onClick={run((e) => e.chain().focus().toggleItalic().run())}>
        <span style={{ fontSize: 14, fontStyle: 'italic' }}>I</span>
      </IconButton>
      <IconButton title={t('toolbar.underline')} inert={disabled} active={editor?.isActive('underline')} onClick={run((e) => e.chain().focus().toggleUnderline().run())}>
        <span style={{ fontSize: 14, textDecoration: 'underline' }}>U</span>
      </IconButton>
      <IconButton
        title={t('toolbar.textColour')}
        inert={disabled}
        active={colorActive}
        onClick={run((e) =>
          colorActive ? e.chain().focus().unsetColor().run() : e.chain().focus().setColor(PINK).run(),
        )}
      >
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>
          <span style={{ width: 15, height: 3, background: PINK, borderRadius: 1, marginTop: 1 }} />
        </span>
      </IconButton>

      <Divider />

      <IconButton title={t('toolbar.alignLeft')} inert={disabled} active={editor?.isActive({ textAlign: 'left' })} onClick={run((e) => e.chain().focus().setTextAlign('left').run())}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="15" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="13" y2="18" />
        </svg>
      </IconButton>
      <IconButton title={t('toolbar.alignCentre')} inert={disabled} active={editor?.isActive({ textAlign: 'center' })} onClick={run((e) => e.chain().focus().setTextAlign('center').run())}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="6" x2="18" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="18" y2="18" />
        </svg>
      </IconButton>

      <Divider />

      <IconButton title={t('toolbar.bulletList')} inert={disabled} active={editor?.isActive('bulletList')} onClick={run((e) => e.chain().focus().toggleBulletList().run())}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
        </svg>
      </IconButton>
      <IconButton title={t('toolbar.numberedList')} inert={disabled} active={editor?.isActive('orderedList')} onClick={run((e) => e.chain().focus().toggleOrderedList().run())}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><path d="M4 6h1v4M4 10h2M6 18H4l2-3H4" />
        </svg>
      </IconButton>

      <Divider />

      {/* Insert group — adds into the active block (disabled when none active) */}
      <IconButton title={canInsert ? t('toolbar.insertImage') : t('toolbar.insertImageDisabled')} inert={!canInsert} onClick={onInsertImage}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
        </svg>
      </IconButton>
      <IconButton title={canInsert ? t('toolbar.insertTextBox') : t('toolbar.insertTextBoxDisabled')} inert={!canInsert} onClick={onInsertTextBox}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5C544E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 9h8M8 13h5" />
        </svg>
      </IconButton>
      <IconButton title={t('toolbar.insertTable')} inert>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C7BCAE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </IconButton>
    </div>
  );
}
