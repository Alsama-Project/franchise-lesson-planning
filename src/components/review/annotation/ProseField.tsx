'use client';

// Inline prose field for the review view — the SMARTT objective and a block's
// teacher_does / students_do. It renders three ways:
//   • no annotation provider (the editor's Review step, a non-member view) → the
//     PLAIN text, byte-for-byte (a bare text node, no wrapper) — suggesting mode
//     never leaks off /view.
//   • a pending `text` suggestion exists → the tracked-change diff (pre · struck del ·
//     inserted ins · post), clicking focuses its card (or re-opens the editor for the
//     authoring coordinator).
//   • coordinator + suggesting mode, no pending suggestion → an editable target; on
//     blur the edit commits as a `text` suggestion (create / update / withdraw).
//
// The plan is NEVER written here — only plan_annotations. `from_value` is pinned to
// the field's stored text at first creation; re-edits move only `to_value`, and an
// edit back to the original withdraws the suggestion (no empty diff).

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { textDiffSegments } from '@/lib/review/textDiff';
import { useOptionalAnnotations } from './context';
import { pendingSuggestion } from './finders';
import { A } from './tokens';

export function ProseField({
  anchorType,
  phaseRef,
  field,
  value,
  placeholder,
}: {
  anchorType: 'objective' | 'phase_description';
  /** block.type for a phase_description; omitted for the objective. */
  phaseRef?: string;
  /** the description field for a phase_description; omitted for the objective. */
  field?: 'teacher_does' | 'students_do';
  /** the field's current stored text. */
  value: string;
  /** muted placeholder when empty (objective only). */
  placeholder?: string;
}) {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // No provider → plain text, byte-identical (the editor Review step never wraps
  // PartContent in a provider, so this is the path there).
  if (!ctx) return <>{value || renderPlaceholder(placeholder)}</>;

  const pending = pendingSuggestion(ctx.annotations, { shape: 'text', anchorType, phaseRef, blockRef: field });
  const canEdit = ctx.role === 'coordinator' && ctx.suggesting;
  const base = pending?.fromValue ?? value;

  const startEdit = () => {
    setDraft(pending?.toValue ?? value);
    setEditing(true);
  };

  const commit = async () => {
    const next = draft;
    setEditing(false);
    const nt = next.trim();
    const bt = base.trim();
    if (pending) {
      // Edited back to the original → withdraw; unchanged → nothing; else revise to_value.
      if (nt === bt) await ctx.remove(pending.id);
      else if (nt === (pending.toValue ?? '').trim()) return;
      else await ctx.update(pending.id, next);
    } else {
      if (nt === bt) return; // no net change → create nothing
      await ctx.create({
        kind: 'suggestion',
        suggestionShape: 'text',
        anchorType,
        phaseRef: phaseRef ?? null,
        blockRef: field ?? null,
        fromValue: base,
        toValue: next,
        note: t('annotations.author.textNoteDefault'),
      });
    }
  };

  if (editing) {
    return (
      <textarea
        dir="auto"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        rows={2}
        className="block w-full resize-none rounded-[8px] border bg-white px-[9px] py-[6px] text-[13.5px] leading-[1.5] text-ink outline-none focus:border-teal"
        style={{ borderColor: A.textareaBorder }}
      />
    );
  }

  if (pending) {
    const segs = textDiffSegments(pending.fromValue ?? '', pending.toValue ?? '');
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={canEdit ? startEdit : () => ctx.setActiveId(pending.id)}
        className="cursor-pointer"
        title={canEdit ? t('annotations.author.editHint') : undefined}
      >
        {segs.pre}
        {segs.del ? (
          <span className="line-through" style={{ color: A.fromFg }}>
            {segs.del}
          </span>
        ) : null}
        {segs.ins ? <span style={{ color: A.toFg }}>{segs.ins}</span> : null}
        {segs.post}
      </span>
    );
  }

  if (canEdit) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEdit}
        className="cursor-text rounded-[4px] px-[2px] transition-colors hover:bg-[#EEF6F3]"
        style={{ boxShadow: `inset 0 -1px 0 ${A.pillTealBorder}` }}
        title={t('annotations.author.editHint')}
      >
        {value || <span style={{ color: A.hint }}>{placeholder ?? t('annotations.author.textEmptyHint')}</span>}
      </span>
    );
  }

  return <>{value || renderPlaceholder(placeholder)}</>;
}

function renderPlaceholder(placeholder?: string) {
  return placeholder ? <span className="text-text-muted">{placeholder}</span> : null;
}
