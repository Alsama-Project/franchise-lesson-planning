'use client';

// The Review step's toggled right pane, shown only when the plan carries coordinator
// feedback (at least one annotation). A segmented control in the pane header switches
// between the student WORKSHEET (unchanged: its own scroll container, always editable
// regardless of plan.status) and the COMMENTS list (the annotations as a plain stacked
// list, retiring the section-anchored floating layout that caused overlap defects on
// this surface). When the plan has NO feedback this pane is never used — the Review
// step then shows the worksheet with no toggle and no added chrome, exactly as before.
//
// The selection is local component state for the life of the step; it is NOT persisted
// (no new column, no localStorage) and there is no unread tracking — only the count.
// The default view is Comments when at least one annotation is still OPEN, otherwise
// Worksheet (so an approved plan whose comments are all resolved opens on the sheet).

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Worksheet, WorksheetV3 } from '@/types/lesson';
import type { TagsByDimension } from '@/types/resource';
import { WorksheetPane } from '@/components/editor/worksheet/WorksheetPane';
import type { WorksheetContext } from '@/components/editor/worksheet/context';
import type { SaveState } from '@/components/editor/worksheet/doc/DocumentWorksheet';
import { AnnotationPane } from '@/components/review/annotation/AnnotationPane';
import { isOpenAnnotation, useAnnotations } from '@/components/review/annotation/context';

type View = 'worksheet' | 'comments';

export function ReviewRightPane({
  worksheet,
  onWorksheetChange,
  context,
  vocabulary,
  saveState,
  /** Section keys in lesson order (`objective`, then block types) so the stacked
   *  comments list can order its section groups the way the lesson reads. */
  sectionOrder,
}: {
  worksheet: unknown;
  onWorksheetChange: (worksheet: Worksheet | WorksheetV3) => void;
  context: WorksheetContext;
  vocabulary: TagsByDimension;
  saveState?: SaveState;
  sectionOrder: string[];
}) {
  const t = useTranslations('wizard.review.rightPane');
  const { annotations } = useAnnotations();
  const count = annotations.length;
  // Default to Comments only while something is still open; a plan whose feedback is
  // all resolved opens on the worksheet.
  const [view, setView] = useState<View>(() =>
    annotations.some(isOpenAnnotation) ? 'comments' : 'worksheet',
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* Segmented toggle — rendered here only, and only because at least one comment
          exists (this pane is not used otherwise). */}
      <div className="flex shrink-0 items-center gap-[6px] border-b border-[#EFE8DD] bg-surface px-[14px] py-[8px]">
        <div className="inline-flex rounded-[9px] border border-border bg-surface-subtle p-[3px]">
          <TabButton active={view === 'worksheet'} onClick={() => setView('worksheet')}>
            {t('worksheet')}
          </TabButton>
          <TabButton active={view === 'comments'} onClick={() => setView('comments')}>
            {t('comments', { count })}
          </TabButton>
        </div>
      </div>

      {view === 'worksheet' ? (
        // Bounded-height flex column that does NOT itself scroll — the worksheet's own
        // canvas owns the scroll, its toolbar stays put above it, and no transform /
        // zoom wraps it (that would break tiptap click + selection alignment).
        <div className="flex min-h-0 flex-1 flex-col">
          <WorksheetPane
            value={worksheet}
            onChange={onWorksheetChange}
            context={context}
            vocabulary={vocabulary}
            saveState={saveState}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[16px]">
          <AnnotationPane stacked sectionOrder={sectionOrder} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-[7px] px-[13px] py-[6px] text-[12.5px] font-semibold transition-colors ' +
        (active ? 'bg-surface text-ink shadow-sm' : 'text-neutral-500 hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
