'use client';

// Re-render a toolbar on every editor selection/transaction so active-state
// highlighting stays live. Mirrors the pattern the v2 WordToolbar used, kept local
// so the document toolbars don't depend on a specific @tiptap/react hook version.

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';

export function useEditorTick(editor: Editor | null): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => force((n) => n + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
}
