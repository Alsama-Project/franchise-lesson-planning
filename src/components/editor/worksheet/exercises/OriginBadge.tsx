'use client';

// The origin badge (new / reused from bank / adapted from bank) and the "Edited by
// you" mark. Origin and edit are SEPARATE facts on ONE quiet line: a card can be
// both "Reused from bank" and "Edited by you". Neither prints — this is editor
// chrome, so it reads through next-intl (the teacher's UI locale), not the
// content-language artifact catalog.

import { useTranslations } from 'next-intl';
import type { WorksheetExerciseOrigin } from '@/types/worksheet-exercise';

const ORIGIN_KEY: Record<WorksheetExerciseOrigin, string> = {
  generated: 'origin.generated',
  reused: 'origin.reused',
  adapted: 'origin.adapted',
};

export function OriginRow({
  origin,
  edited,
}: {
  origin: WorksheetExerciseOrigin;
  edited: boolean;
}) {
  const t = useTranslations('worksheetGen');
  return (
    <div className="ws-no-print flex items-center gap-2 text-[11px] text-neutral-400">
      <span className="inline-flex items-center rounded-[5px] bg-surface-subtle px-[7px] py-[2px] font-semibold text-neutral-500">
        {t(ORIGIN_KEY[origin])}
      </span>
      {edited ? (
        <span className="inline-flex items-center gap-1 font-medium text-[#B0651E]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {t('editedByYou')}
        </span>
      ) : null}
    </div>
  );
}
