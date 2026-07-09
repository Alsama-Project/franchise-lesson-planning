'use client';

// Small shared building blocks for the document editor's top toolbar and selection
// bubble: an icon button with active/disabled states, a thin separator, and the
// curated block-style + colour pickers. Brand palette only — no arbitrary font or
// size controls.

import { useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { BRAND, BLOCK_STYLES, TEXT_COLOURS, type BlockStyle } from './theme';

export function TBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 30,
        height: 30,
        padding: '0 6px',
        borderRadius: 7,
        border: 'none',
        background: active ? BRAND.creamSoft : 'transparent',
        color: disabled ? '#C4BCB1' : active ? BRAND.pink : BRAND.ink,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

export function TSep() {
  return <span style={{ width: 1, height: 20, background: '#E7DECF', margin: '0 3px' }} />;
}

/** The current block style of the selection (Heading / Subheading / Body). */
function activeStyle(editor: Editor): BlockStyle {
  if (editor.isActive('heading', { level: 2 })) return 'heading';
  if (editor.isActive('heading', { level: 3 })) return 'subheading';
  return 'body';
}

function applyStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === 'body') chain.setNode('paragraph').run();
  else if (style === 'heading') chain.setNode('heading', { level: 2 }).run();
  else chain.setNode('heading', { level: 3 }).run();
}

export function BlockStylePicker({ editor }: { editor: Editor }) {
  const current = activeStyle(editor);
  const label = BLOCK_STYLES.find((s) => s.style === current)?.label ?? 'Body';
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Text style"
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 7,
          border: '1px solid #E7DECF',
          background: '#fff',
          color: BRAND.ink,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          minWidth: 108,
          textAlign: 'left',
        }}
      >
        {label} ▾
      </button>
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              zIndex: 41,
              background: '#fff',
              border: '1px solid #E7DECF',
              borderRadius: 10,
              boxShadow: '0 12px 32px -12px rgba(40,30,20,0.35)',
              padding: 5,
              minWidth: 150,
            }}
          >
            {BLOCK_STYLES.map((s) => (
              <button
                key={s.style}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyStyle(editor, s.style);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 7,
                  border: 'none',
                  background: current === s.style ? BRAND.creamSoft : 'transparent',
                  cursor: 'pointer',
                  fontSize: s.style === 'heading' ? 17 : s.style === 'subheading' ? 15 : 13.5,
                  fontWeight: s.style === 'body' ? 500 : 700,
                  color: BRAND.ink,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ColourPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const current = (editor.getAttributes('textStyle').color as string | undefined) ?? null;
  return (
    <div style={{ position: 'relative' }}>
      <TBtn title="Text colour" onClick={() => setOpen((o) => !o)} active={!!current}>
        <span
          style={{
            width: 15,
            height: 15,
            borderRadius: 4,
            border: '1px solid #D8C9B4',
            background: current ?? 'linear-gradient(135deg,#B62A5C,#1F7A6C)',
            display: 'inline-block',
          }}
        />
      </TBtn>
      {open ? (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              zIndex: 41,
              display: 'flex',
              gap: 6,
              background: '#fff',
              border: '1px solid #E7DECF',
              borderRadius: 10,
              boxShadow: '0 12px 32px -12px rgba(40,30,20,0.35)',
              padding: 8,
            }}
          >
            {TEXT_COLOURS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                  setOpen(false);
                }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: current === c.value ? `2px solid ${BRAND.ink}` : '1px solid #D8C9B4',
                  background: c.value ?? '#fff',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Prompt for a URL and toggle a link mark on the selection. */
export function toggleLink(editor: Editor) {
  const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
  const url = window.prompt('Link URL', prev);
  if (url === null) return;
  if (url.trim() === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}
