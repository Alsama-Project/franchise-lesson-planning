'use client';

import { useTranslations } from 'next-intl';
import type { EditorCurriculumContext } from '@/lib/editor/load-plan';

/**
 * A compact, persistent cream/locked panel surfacing the current lesson's
 * curriculum-provided fields — Daily outcome, Theme, Grammar & vocabulary — so
 * they stay on screen across the wizard's later stages. Step 1 shows the fuller
 * {@link CurriculumBand}, which already carries these three fields plus the
 * week/month context, so this panel covers every stage past it.
 *
 * Curriculum content is "given": this reuses the cream `given` surface
 * (colour = meaning) rather than inventing a treatment. Each row renders only
 * when its field is non-empty; if all three are empty the panel renders nothing
 * (no empty cream box). `grammar_vocabulary` in particular may be empty for
 * English until its backfill runs — that row just drops out.
 */
export function CurriculumPanel({ curriculum }: { curriculum: EditorCurriculumContext | null }) {
  const t = useTranslations('wizard.curriculum');

  const rows = curriculum
    ? [
        { label: t('dailyOutcome'), value: curriculum.dailyLO },
        { label: t('theme'), value: curriculum.theme },
        { label: t('grammarVocab'), value: curriculum.grammarVocab },
      ].filter((r) => r.value && r.value.trim())
    : [];

  if (rows.length === 0) return null;

  return (
    <dl className="flex flex-col gap-[9px] rounded-[11px] border border-given-border bg-given px-[15px] py-[12px]">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-[2px] sm:flex-row sm:gap-[12px]">
          <dt className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.06em] text-given-label sm:w-[140px] sm:pt-[1px]">
            {row.label}
          </dt>
          <dd dir="auto" className="text-[13px] leading-[1.45] text-neutral-900">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
