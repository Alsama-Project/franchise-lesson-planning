'use client';

// One exercise block: a data-driven heading row, then the card — a pink wrapper
// around a white inner paper surface. Renders every post-generation state:
//
//   • ready / edited → the filled paper (ExerciseBody), the origin+edit line, and
//     Regenerate / Edit controls revealed on hover AND keyboard focus. At rest the
//     card reads as a handout.
//   • regenerating   → back to a skeleton AT ITS CURRENT MEASURED HEIGHT, so nothing
//     below moves; its own controls are inert while every other card stays live.
//   • failed         → one quiet line and Try again (teal). No red, no icon, no
//     apology. The heading holds its place.
//
// The heading TEXT is data: `exercise.title` when present, else the positional
// "Exercise N" fallback from the content-language catalog — never a hardcoded
// English literal. The number is positional; the label is not.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { WorksheetDoc } from '@/types/lesson';
import type { WorksheetExercise } from '@/types/worksheet-exercise';
import type { WorksheetContentLanguage } from '@/lib/editor/worksheet-content-locale';
import { worksheetArtifactText } from '@/lib/editor/worksheet-content-locale';
import { worksheetDocExtensions } from '../doc/extensions';
import { ExerciseBody } from './ExerciseBody';
import { ExerciseSkeleton } from './ExerciseSkeleton';
import { OriginRow } from './OriginBadge';
import { CardConfirm } from './CardConfirm';

const EDIT_DEBOUNCE_MS = 900;

export function ExerciseCard({
  exercise,
  position,
  contentLanguage,
  regenerating,
  slotBaseIndex,
  onRegenerate,
  onRetry,
  onRegenerateSlot,
  onRetrySlot,
  onEdit,
}: {
  exercise: WorksheetExercise;
  /** 1-based position, for the "Exercise N" heading fallback only. */
  position: number;
  contentLanguage: WorksheetContentLanguage;
  regenerating: boolean;
  slotBaseIndex: number;
  onRegenerate: () => void;
  onRetry: () => void;
  onRegenerateSlot: (slotId: string) => void;
  onRetrySlot: (slotId: string) => void;
  onEdit: (bodyDoc: WorksheetDoc) => void;
}) {
  const t = useTranslations('worksheetGen');
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const heading =
    exercise.title.trim() ||
    worksheetArtifactText(contentLanguage, 'exerciseHeading', { n: position });

  const edited = exercise.status === 'edited';
  const failed = exercise.status === 'failed';

  // Keep the last rendered paper height so a regenerate can hold the exact space
  // (the skeleton then occupies it and nothing below moves). While regenerating the
  // paper isn't mounted, so the last measured height persists.
  useLayoutEffect(() => {
    const el = paperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    setMeasuredHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setMeasuredHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [regenerating, failed, editing]);

  const requestRegenerate = useCallback(() => {
    // Per-card regenerate confirms ONLY when this card carries an edit; discarding
    // merely-generated content is not her work, so it goes straight through.
    if (edited) setConfirming(true);
    else onRegenerate();
  }, [edited, onRegenerate]);

  return (
    <div className="group ws-print-block relative">
      {/* Heading row (data-driven text; positional number for the fallback only). */}
      <div className="mb-[9px] flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-ink" dir="auto">
          {heading}
        </h3>
        {!regenerating && !failed ? (
          <div className="ws-no-print flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {editing ? (
              <CardButton onClick={() => setEditing(false)}>{t('doneEditing')}</CardButton>
            ) : (
              <CardButton onClick={() => setEditing(true)}>{t('edit')}</CardButton>
            )}
            <CardButton onClick={requestRegenerate}>{t('regenerate')}</CardButton>
          </div>
        ) : null}
      </div>

      {/* The card: pink wrapper + white inner paper. */}
      <div className="rounded-[16px] bg-[#F7E4EB] p-[10px]">
        {regenerating ? (
          <ExerciseSkeleton height={measuredHeight ?? 200} />
        ) : failed ? (
          <FailedBody onRetry={onRetry} />
        ) : (
          <div ref={paperRef} className="rounded-[10px] bg-white px-[22px] py-[18px]">
            {editing ? (
              <CardEditor
                exercise={exercise}
                contentLanguage={contentLanguage}
                onEdit={onEdit}
              />
            ) : (
              <ExerciseBody
                exercise={exercise}
                slotBaseIndex={slotBaseIndex}
                onRegenerateSlot={onRegenerateSlot}
                onRetrySlot={onRetrySlot}
              />
            )}
            <div className="mt-[14px] border-t border-[#F0EAE1] pt-[9px]">
              <OriginRow origin={exercise.origin} edited={edited} />
            </div>
          </div>
        )}
      </div>

      {confirming ? (
        <CardConfirm
          title={t('confirm.cardTitle')}
          body={t('confirm.cardEditedBody')}
          confirmLabel={t('confirm.regenerateAnyway')}
          cancelLabel={t('confirm.keep')}
          danger
          onConfirm={() => {
            setConfirming(false);
            onRegenerate();
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

/** The failed state: one quiet line and Try again. No red, no icon, no apology. */
function FailedBody({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('worksheetGen');
  return (
    <div className="rounded-[10px] bg-white px-[22px] py-[20px]">
      <p className="text-[13.5px] text-neutral-500" dir="auto">
        {t('failed')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="ws-no-print mt-[10px] text-[13px] font-semibold text-teal hover:underline"
      >
        {t('tryAgain')}
      </button>
    </div>
  );
}

/** An inline tiptap editor bound to the card's body_doc. On a debounced pause it
 *  lifts the new doc so the parent persists it (status → 'edited') and recompiles. */
function CardEditor({
  exercise,
  contentLanguage,
  onEdit,
}: {
  exercise: WorksheetExercise;
  contentLanguage: WorksheetContentLanguage;
  onEdit: (bodyDoc: WorksheetDoc) => void;
}) {
  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onEditRef.current = onEdit;
  }, [onEdit]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: worksheetDocExtensions(contentLanguage),
    content: (exercise.body_doc as JSONContent | null) ?? { type: 'doc', content: [] },
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ws-doc', spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current);
      const doc = editor.getJSON() as WorksheetDoc;
      timer.current = setTimeout(() => onEditRef.current(doc), EDIT_DEBOUNCE_MS);
    },
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return <EditorContent editor={editor} />;
}

/** A quiet teal chip control on the heading row. */
function CardButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[7px] px-[9px] py-[4px] text-[12px] font-semibold text-teal hover:bg-[#E4F0ED]"
    >
      {children}
    </button>
  );
}
