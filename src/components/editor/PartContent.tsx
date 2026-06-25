'use client';

// The read-only body of a single lesson part, shared by the creator's Review step
// (/plan/[id]) and the non-creator read-only view (/plan/[id]/view) so the planned
// content reads identically on both. It renders only the part's CONTENT — the
// header (name, phase tag, minutes) is owned by each surface.
//
// Nothing here is editable. For New content it surfaces the Teach-it writing plus
// any bank resources; for Independent practice it surfaces the Practise writing
// plus the student worksheet (rendered inline, collapsed behind a toggle). Genuinely
// empty parts show a clear "not planned yet" state rather than a bare dash.

import type { Block } from '@/types/lesson';
import type { ResourceWithTags } from '@/types/resource';
import type { WorksheetContext } from '@/components/editor/worksheet/context';
import { ReadOnlyResourceList } from '@/components/editor/ReadOnlyResourceList';
import { ReadOnlyWorksheet } from '@/components/editor/ReadOnlyWorksheet';

function Detail({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="text-[12.5px] leading-[1.5]">
      <span className="font-semibold text-text-faint">{label}: </span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}

export function PartContent({
  block,
  attachedResources = [],
  worksheet,
  worksheetContext,
  techniques = [],
  fallback,
}: {
  /** The plan block this part maps to, or undefined for fixed parts (routines). */
  block: Block | undefined;
  /** Bank resources attached to this block, pre-resolved. */
  attachedResources?: ResourceWithTags[];
  /** The plan's worksheet — passed only for the Independent practice part. */
  worksheet?: unknown;
  /** Master-frame context for the worksheet — passed only with `worksheet`. */
  worksheetContext?: WorksheetContext;
  /**
   * Resolved "Link it together" technique selections (label + note), passed for
   * the cfu / exit_ticket parts. The caller resolves each technique id to its
   * display label from the activity bank.
   */
  techniques?: { label: string; note: string }[];
  /** Fixed-part description shown when there is no block (e.g. Standard routines). */
  fallback?: string;
}) {
  // Fixed parts (no block) just carry their stock description.
  if (!block) {
    return <div className="text-[12.5px] leading-[1.5] text-neutral-700">{fallback ?? ''}</div>;
  }

  const hasWorksheet = worksheet !== undefined && worksheetContext !== undefined;

  // cfu / exit_ticket use the "Link it together" technique model — their legacy
  // single-select fields (activity_title, note, teacher/students/materials) are no
  // longer written, so for those parts we render ONLY the resolved techniques.
  const isTechniqueBlock = block.type === 'cfu' || block.type === 'exit_ticket';

  const hasWriting =
    block.activity_title.trim() ||
    block.note?.trim() ||
    block.teacher_does.trim() ||
    block.students_do.trim() ||
    block.resources.trim();
  const hasAnything = isTechniqueBlock
    ? techniques.length > 0 || attachedResources.length > 0
    : hasWriting || attachedResources.length > 0 || hasWorksheet;

  if (!hasAnything) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-strong px-3 py-[12px] text-center text-[12px] text-text-faint">
        Not planned yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {techniques.length > 0 ? (
        <div className="flex flex-col gap-[6px]">
          {techniques.map((t, i) => (
            <div key={i} className="text-[12.5px] leading-[1.5]">
              <span className="font-semibold text-ink">{t.label}</span>
              {t.note.trim() ? <span className="text-neutral-800"> — {t.note}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {block.type === 'recap' ? (
        block.note?.trim() ? (
          <div className="text-[12.5px] leading-[1.5] text-neutral-800">{block.note}</div>
        ) : null
      ) : !isTechniqueBlock ? (
        <>
          {block.activity_title.trim() ? (
            <div className="text-[13px] font-semibold text-ink">{block.activity_title}</div>
          ) : null}
          <Detail label="What I'll do" value={block.note ?? ''} />
          <Detail label="Teacher" value={block.teacher_does} />
          <Detail label="Students" value={block.students_do} />
          <Detail label="Materials" value={block.resources} />
        </>
      ) : null}
      {attachedResources.length > 0 ? <ReadOnlyResourceList resources={attachedResources} /> : null}
      {hasWorksheet ? (
        <div>
          <div className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-text-faint">
            Student worksheet
          </div>
          <ReadOnlyWorksheet worksheet={worksheet} ctx={worksheetContext!} />
        </div>
      ) : null}
    </div>
  );
}
