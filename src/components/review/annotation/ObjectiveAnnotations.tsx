'use client';

// Read-side affordance for the SMARTT objective on the review view. Renders nothing
// extra on a non-member's plain read-only view (no provider); with a provider it
// adds a count badge (focuses the objective's first card) and, for a coordinator, a
// "comment on the objective" toggle. Woven into ReadOnlyPlan beside the section head.

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useOptionalAnnotations } from './context';
import { CountBadge, CommentForm } from './PhaseRow';
import { A } from './tokens';

export function ObjectiveAnnotations() {
  const ctx = useOptionalAnnotations();
  const t = useTranslations('review');
  const locale = useLocale();
  const [authoring, setAuthoring] = useState(false);

  if (!ctx) return null;
  const cards = ctx.forObjective();
  const isCoordinator = ctx.role === 'coordinator';

  return (
    <>
      <span className="inline-flex items-center gap-[8px]">
        {cards.length > 0 ? (
          <CountBadge count={cards.length} onClick={() => ctx.setActiveId(cards[0]?.id)} locale={locale} />
        ) : null}
        {isCoordinator ? (
          <button
            type="button"
            onClick={() => setAuthoring((v) => !v)}
            className="rounded-[8px] border px-[9px] py-[3px] text-[11px] font-semibold transition-colors"
            style={
              authoring
                ? { background: A.suggestionBg, color: A.suggestionFg, borderColor: A.pillTealBorder }
                : { background: 'transparent', color: A.tabIdleFg, borderColor: A.tabBorder }
            }
          >
            {t('annotations.author.comment')}
          </button>
        ) : null}
      </span>
      {isCoordinator && authoring ? (
        <div className="mt-[8px]">
          <CommentForm anchorType="objective" onClose={() => setAuthoring(false)} />
        </div>
      ) : null}
    </>
  );
}
